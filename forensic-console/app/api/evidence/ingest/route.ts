import crypto from 'crypto';
import { z } from 'zod';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TODO(EVIDENCE-INGEST-FULL): full validation against Authorization.scope
// + hash-chain link + PrivilegeHint routing to Filter Team queue when flag != NONE.
// Currently accepts and records the batch; scope enforcement lives on the
// on-device CollectionGate as first line of defense.

const BatchSchema = z.object({
  batchId: z.string().uuid(),
  sessionId: z.string(),
  capturedAt: z.string(),
  category: z.enum(['KEYSTROKE_BATCH', 'APP_EVENT', 'COMMS_METADATA', 'RISK_DETECTION']),
  payloadBase64: z.string(),
  prevBatchHashHex: z.string().regex(/^[a-f0-9]{64}$/i),
  batchHashHex: z.string().regex(/^[a-f0-9]{64}$/i),
  privilegeFlag: z.enum(['NONE', 'LEGAL', 'MEDICAL', 'CLERGY', 'SPOUSAL', 'UNKNOWN']),
  contextAppPackage: z.string().nullable().optional(),
  signatureBase64: z.string(),
  // Defaults false so the existing Android client (unaware of this field)
  // is unaffected. Must be true for non-production pipeline-validation
  // submissions (e.g. the Phase 3 Chrome extension's placeholder-input
  // cycle) that do not reflect real captured activity -- see migration
  // 20260907000000_evidence_synthetic_marker.sql.
  synthetic: z.boolean().optional().default(false),
});

const IngestSchema = z.object({
  batches: z.array(BatchSchema).min(1).max(100),
  device: z.object({
    deviceId: z.string(),
    publicKeyBase64: z.string(),
    attestation: z.object({
      ok: z.boolean(),
      kind: z.string(),
      verdict: z.string(),
    }),
  }),
  clientVersion: z.string(),
});

function hashIngestToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function POST(req: Request) {
  // Per-device bearer credential, issued once at POST /api/devices/enroll
  // and stored only as a hash on device.ingest_token_hash. Closes a
  // pre-existing unauthenticated gap on this route.
  const authHeader = req.headers.get('authorization');
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const rawToken = bearerMatch?.[1];
  if (!rawToken) {
    return Response.json({ error: 'missing_bearer_token' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return Response.json({ error: 'server_misconfigured' }, { status: 500 });
  }
  const admin = createAdminClient(url, secret);

  const tokenHash = hashIngestToken(rawToken);
  const { data: tokenDevice } = await admin
    .from('device')
    .select('id, status')
    .eq('ingest_token_hash', tokenHash)
    .maybeSingle();
  if (!tokenDevice) {
    return Response.json({ error: 'invalid_token' }, { status: 401 });
  }
  const resolvedDevice = tokenDevice as { id: string; status: string };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'schema', issues: parsed.error.issues }, { status: 400 });
  }
  const { batches, device } = parsed.data;

  // Look up the MonitoringSession + Authorization from sessionId.
  const sessionId = batches[0]!.sessionId;
  const { data: session } = await admin
    .from('monitoring_session')
    .select('id, authorization_id, device_id, status, ends_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.status !== 'ACTIVE') {
    return Response.json({ error: 'session_not_active' }, { status: 403 });
  }
  const sessionRow = session as {
    id: string;
    authorization_id: string;
    device_id: string;
    status: string;
    ends_at: string;
  };

  // Assert the monitoring_session's device_id matches the token-resolved
  // device's id — prevents token/payload device_id mismatch.
  if (sessionRow.device_id !== resolvedDevice.id) {
    return Response.json({ error: 'device_session_mismatch' }, { status: 403 });
  }

  // Re-validate the associated authorization is ACTIVE and within its time
  // window at submission time. This duplicates the existing DB trigger
  // enforce_evidence_active_authorization intentionally (API-layer clean
  // error before the raw insert fails inside the DB) — the DB trigger
  // remains the hard boundary and is NOT removed or weakened.
  const { data: authorization } = await admin
    .from('authorization')
    .select('id, status, expires_on')
    .eq('id', sessionRow.authorization_id)
    .maybeSingle();
  const authRow = authorization as { id: string; status: string; expires_on: string } | null;
  if (!authRow || authRow.status !== 'ACTIVE') {
    return Response.json({ error: 'authorization_not_active' }, { status: 403 });
  }
  const now = new Date();
  if (now > new Date(authRow.expires_on) || now > new Date(sessionRow.ends_at)) {
    return Response.json({ error: 'authorization_window_elapsed' }, { status: 403 });
  }

  const rows = batches.map((b) => ({
    session_id: sessionRow.id,
    category: b.category,
    captured_at: b.capturedAt,
    payload_hash: b.batchHashHex,
    prev_evidence_hash: b.prevBatchHashHex,
    privilege_flag: b.privilegeFlag,
    // TODO(EVIDENCE-PAYLOAD-STORAGE): move payload to cold storage; keep only ref.
    payload_ref: null,
    device_signature: b.signatureBase64,
    quarantine_status: b.privilegeFlag === 'NONE' ? null : 'PENDING_FILTER',
    synthetic: b.synthetic,
  }));

  // Insert the batch + append the EVIDENCE_INGEST audit row atomically.
  // All pre-insert validation above (bearer token, session lookup,
  // authorization active-window re-check) is unchanged -- only the final
  // insert+audit tail is folded into one transaction here. See
  // 20260908000005_audit_atomicity_batch3.sql.
  const { data: rpcResult, error } = await admin.rpc('p_evidence_ingest_batch', {
    p_rows: rows,
    p_session_id: sessionRow.id,
    p_device_id: resolvedDevice.id,
  });
  if (error) return Response.json({ error: 'insert_failed', detail: error.message }, { status: 500 });

  const accepted = (rpcResult as { accepted?: number } | null)?.accepted ?? rows.length;
  return Response.json({ ok: true, accepted }, { status: 202 });
}
