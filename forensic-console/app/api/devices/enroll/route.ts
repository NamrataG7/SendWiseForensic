import crypto from 'crypto';
import { z } from 'zod';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { appendAudit } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EnrollInputSchema = z
  .object({
    code: z.string().min(1),
    deviceFingerprint: z.string().min(1),
    platform: z.literal('ANDROID').default('ANDROID'),
    hardwareBackedPubKey: z.string().nullable().optional(),
  })
  .strict();

/** Normalize (strip dashes, uppercase) then sha256-hex. Mirrors enrollment-codes/route.ts. */
function hashEnrollmentCode(code: string): string {
  const normalized = code.replace(/-/g, '').toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function hashIngestToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * POST /api/devices/enroll
 *
 * PUBLIC/unauthenticated — the Android app calls this with the officer-
 * issued enrollment code before any device credential exists. Runs under
 * service_role (SYSTEM per auth_role()), mirroring the service-role client
 * construction pattern used in
 * app/api/authorizations/[id]/review-approve/route.ts.
 *
 * Generic 410 on any lookup failure (unknown/expired/non-PENDING code) —
 * deliberately no information leak about which condition failed.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const parsed = EnrollInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'schema', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { code, deviceFingerprint, platform, hardwareBackedPubKey } = parsed.data;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return Response.json({ ok: false, error: 'server_misconfigured' }, { status: 500 });
  }
  const admin = createAdminClient(url, secret);

  const codeHash = hashEnrollmentCode(code);
  const nowIso = new Date().toISOString();

  const { data: ec } = await admin
    .from('device_enrollment_code')
    .select('id, authorization_id, subject_id, status, expires_at')
    .eq('code_hash', codeHash)
    .eq('status', 'PENDING')
    .gt('expires_at', nowIso)
    .maybeSingle();

  if (!ec) {
    // Generic error — do not reveal whether the code is unknown, expired,
    // or already redeemed/revoked.
    return Response.json({ ok: false, error: 'enrollment_code_invalid' }, { status: 410 });
  }
  const ecRow = ec as {
    id: string;
    authorization_id: string;
    subject_id: string;
    status: string;
    expires_at: string;
  };

  // Re-check the referenced authorization is still ACTIVE at redemption time
  // (it may have been revoked/expired after the code was issued).
  const { data: auth } = await admin
    .from('authorization')
    .select('id, status')
    .eq('id', ecRow.authorization_id)
    .maybeSingle();
  const authRow = auth as { id: string; status: string } | null;
  if (!authRow || authRow.status !== 'ACTIVE') {
    await admin
      .from('device_enrollment_code')
      .update({ status: 'EXPIRED' })
      .eq('id', ecRow.id);
    return Response.json(
      { ok: false, error: 'authorization_not_active' },
      { status: 409 },
    );
  }

  // Idempotent re-bind by (subject_id, device_fingerprint) — device table
  // carries UNIQUE (subject_id, device_fingerprint).
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashIngestToken(rawToken);

  const { data: device, error: upsertErr } = await admin
    .from('device')
    .upsert(
      {
        subject_id: ecRow.subject_id,
        device_fingerprint: deviceFingerprint,
        platform,
        hardware_backed_pub_key: hardwareBackedPubKey ?? null,
        ingest_token_hash: tokenHash,
        status: 'ENROLLED',
        last_seen_at: nowIso,
      },
      { onConflict: 'subject_id,device_fingerprint' },
    )
    .select('id')
    .single();
  if (upsertErr || !device) {
    return Response.json(
      { ok: false, error: `device upsert failed: ${upsertErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }
  const deviceId = (device as { id: string }).id;

  const { error: redeemErr } = await admin
    .from('device_enrollment_code')
    .update({
      status: 'REDEEMED',
      redeemed_at: nowIso,
      redeemed_device_id: deviceId,
    })
    .eq('id', ecRow.id)
    .eq('status', 'PENDING');
  if (redeemErr) {
    return Response.json(
      { ok: false, error: `code redemption failed: ${redeemErr.message}` },
      { status: 500 },
    );
  }

  await appendAudit(admin, {
    actorId: null,
    actorRole: 'SYSTEM',
    action: 'DEVICE_ENROLLED',
    targetType: 'device',
    targetId: deviceId,
    context: {
      authorizationId: ecRow.authorization_id,
      subjectId: ecRow.subject_id,
      enrollmentCodeId: ecRow.id,
      // Never log the raw code, its hash, or the raw ingest token.
    },
  });

  return Response.json(
    { ok: true, data: { deviceId, ingestToken: rawToken } },
    { status: 201 },
  );
}
