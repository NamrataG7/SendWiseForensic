import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { appendAudit } from '@/lib/db';
import {
  jsonError,
  jsonOk,
  requestIp,
  requireRole,
  resolveCaller,
} from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RevokeInputSchema = z
  .object({ reason: z.string().min(1) })
  .strict();

/**
 * POST /api/authorizations/[id]/revoke
 *
 * Transitions any non-terminal status to REVOKED, cascades all
 * ACTIVE/PAUSED monitoring_sessions to AUTO_TERMINATED, appends an
 * AUTH_REVOKE audit row and a SESSION_AUTO_TERMINATE row per session.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  if (
    !requireRole(caller, [
      'REVIEW_COMMITTEE',
      'SUPERVISING_OFFICER',
      'COMPETENT_AUTHORITY',
    ])
  ) {
    return jsonError(403, 'Insufficient role for revocation');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }
  const parsed = RevokeInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, 'Invalid input', {
      violations: parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }

  const { data: current, error: readErr } = await supabase
    .from('authorization')
    .select('id, status, case_id, revocation_log')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) return jsonError(500, readErr.message);
  if (!current) return jsonError(404, 'authorization not found');

  const row = current as {
    id: string;
    status: string;
    case_id: string;
    revocation_log: Array<{ actorId: string; reason: string; at: string }>;
  };
  if (row.status === 'REVOKED' || row.status === 'EXPIRED') {
    return jsonError(409, `already in terminal status ${row.status}`);
  }

  const entry = {
    actorId: caller.officerId,
    reason: parsed.data.reason,
    at: new Date().toISOString(),
  };
  const newLog = [...(row.revocation_log ?? []), entry];

  const { error: updateErr } = await supabase
    .from('authorization')
    .update({ status: 'REVOKED', revocation_log: newLog })
    .eq('id', params.id);
  if (updateErr) return jsonError(500, updateErr.message);

  // Cascade sessions.
  const { data: terminatedSessions, error: sessionErr } = await supabase
    .from('monitoring_session')
    .update({ status: 'AUTO_TERMINATED' })
    .eq('authorization_id', params.id)
    .in('status', ['ACTIVE', 'PAUSED'])
    .select('id');
  if (sessionErr) return jsonError(500, sessionErr.message);

  const revokeAudit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: caller.roles[0] ?? 'SUPERVISING_OFFICER',
    action: 'AUTH_REVOKE',
    targetType: 'authorization',
    targetId: params.id,
    context: { caseId: row.case_id, reason: parsed.data.reason },
    ip: requestIp(req),
  });
  if (!revokeAudit.ok) {
    // TODO(AUDIT-ATOMICITY): revert.
    await supabase
      .from('authorization')
      .update({ status: row.status, revocation_log: row.revocation_log })
      .eq('id', params.id);
    return jsonError(
      502,
      `revoke reverted; audit append failed: ${revokeAudit.error}`,
    );
  }

  // Best-effort audit rows for cascaded sessions.
  const sessionIds = (terminatedSessions ?? []).map(
    (s) => (s as { id: string }).id,
  );
  for (const sid of sessionIds) {
    await appendAudit(supabase, {
      actorId: caller.officerId,
      actorRole: caller.roles[0] ?? 'SUPERVISING_OFFICER',
      action: 'SESSION_AUTO_TERMINATE',
      targetType: 'monitoring_session',
      targetId: sid,
      context: { authorizationId: params.id, reason: 'authorization revoked' },
      ip: requestIp(req),
    });
  }

  return jsonOk({
    id: params.id,
    revokeAuditId: revokeAudit.id,
    terminatedSessionCount: sessionIds.length,
  });
}
