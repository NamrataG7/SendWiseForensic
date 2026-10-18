import crypto from 'crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { appendAudit } from '@/lib/db';
import {
  jsonError,
  jsonOk,
  refuseIfOnlyFilterTeam,
  requestIp,
  requireRoleAny,
  resolveCaller,
} from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ENROLLMENT_CODE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Crockford base32 alphabet, excluding I, L, O, U (ambiguous with 1/0).
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates an 8-char Crockford base32 code formatted XXXX-XXXX from
 * crypto.randomBytes(5) (40 bits -> 8 symbols x 5 bits). No external
 * dependency.
 */
function generateEnrollmentCode(): string {
  const bytes = crypto.randomBytes(5); // 40 bits
  // Accumulate as a plain number bit buffer (40 bits fits well under 2^53).
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    bits = bits * 256 + bytes[i]!;
  }
  const symbols: string[] = [];
  for (let i = 0; i < 8; i++) {
    const shift = 5 * (7 - i);
    const idx = Math.floor(bits / 2 ** shift) & 0x1f;
    symbols.push(CROCKFORD_ALPHABET[idx]!);
  }
  const raw = symbols.join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Normalize (strip dashes, uppercase) then sha256-hex. Never log the raw code. */
function hashEnrollmentCode(code: string): string {
  const normalized = code.replace(/-/g, '').toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * POST /api/authorizations/[id]/enrollment-codes
 *
 * Officer-issued, single-use, 30-min-TTL code that binds a device
 * enrollment to this specific ACTIVE authorization (not just case/subject).
 * Only the sha256 hash of the raw code is ever persisted; the raw code is
 * returned exactly once in this response and never logged (including in
 * the audit context).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);
  const notFilterOnly = refuseIfOnlyFilterTeam(caller);
  if (!notFilterOnly.ok) return jsonError(notFilterOnly.status, notFilterOnly.error);
  if (!requireRoleAny(caller, ['INVESTIGATING_OFFICER', 'SUPERVISING_OFFICER'])) {
    return jsonError(403, 'INVESTIGATING_OFFICER or SUPERVISING_OFFICER role required');
  }

  const { data: auth, error: authErr } = await supabase
    .from('authorization')
    .select('id, status, subject_id, case_id')
    .eq('id', params.id)
    .maybeSingle();
  if (authErr) return jsonError(500, authErr.message);
  if (!auth) return jsonError(404, 'authorization not found');

  const row = auth as { id: string; status: string; subject_id: string; case_id: string };
  if (row.status !== 'ACTIVE') {
    return jsonError(409, `authorization must be ACTIVE to issue an enrollment code (current status: ${row.status})`);
  }

  const code = generateEnrollmentCode();
  const codeHash = hashEnrollmentCode(code);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ENROLLMENT_CODE_TTL_MS);

  const { data: inserted, error: insertErr } = await supabase
    .from('device_enrollment_code')
    .insert({
      authorization_id: row.id,
      subject_id: row.subject_id,
      code_hash: codeHash,
      issued_by: caller.officerId,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return jsonError(500, `insert failed: ${insertErr?.message ?? 'unknown'}`);
  }

  const audit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: caller.roles.includes('SUPERVISING_OFFICER')
      ? 'SUPERVISING_OFFICER'
      : 'INVESTIGATING_OFFICER',
    action: 'DEVICE_ENROLL_CODE_ISSUE',
    targetType: 'device_enrollment_code',
    targetId: (inserted as { id: string }).id,
    context: {
      authorizationId: row.id,
      caseId: row.case_id,
      subjectId: row.subject_id,
      expiresAt: expiresAt.toISOString(),
      // Never log the raw code or its hash.
    },
    ip: requestIp(req),
  });
  if (!audit.ok) {
    // TODO(AUDIT-ATOMICITY): compensating delete.
    await supabase
      .from('device_enrollment_code')
      .delete()
      .eq('id', (inserted as { id: string }).id);
    return jsonError(
      502,
      `enrollment code reverted; audit append failed: ${audit.error}`,
    );
  }

  return jsonOk(
    {
      id: (inserted as { id: string }).id,
      code,
      expiresAt: expiresAt.toISOString(),
    },
    201,
  );
}
