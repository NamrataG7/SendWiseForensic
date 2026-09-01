import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

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

export async function POST(req: Request) {
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

  const supabase = createClient(cookies());

  // Look up the active MonitoringSession + Authorization from sessionId.
  const sessionId = batches[0]!.sessionId;
  const { data: session } = await supabase
    .from('monitoring_session')
    .select('id, authorization_id, status')
    .eq('id', sessionId)
    .single();
  if (!session || session.status !== 'ACTIVE') {
    return Response.json({ error: 'session_not_active' }, { status: 403 });
  }

  const rows = batches.map((b) => ({
    session_id: session.id,
    category: b.category,
    captured_at: b.capturedAt,
    payload_hash: b.batchHashHex,
    prev_evidence_hash: b.prevBatchHashHex,
    privilege_flag: b.privilegeFlag,
    // TODO(EVIDENCE-PAYLOAD-STORAGE): move payload to cold storage; keep only ref.
    payload_ref: null,
    device_signature: b.signatureBase64,
    quarantine_status: b.privilegeFlag === 'NONE' ? null : 'PENDING_FILTER',
  }));

  const { error } = await supabase.from('evidence').insert(rows);
  if (error) return Response.json({ error: 'insert_failed', detail: error.message }, { status: 500 });

  // TODO(AUDIT-ATOMICITY): move insert + audit into a single plpgsql function.
  await supabase.rpc('p_append_audit', {
    p_actor_id: null,
    p_actor_role: 'SYSTEM',
    p_action: 'EVIDENCE_INGEST',
    p_target_type: 'monitoring_session',
    p_target_id: session.id,
    p_context: { count: rows.length, device_id: device.deviceId },
  });

  return Response.json({ ok: true, accepted: rows.length }, { status: 202 });
}
