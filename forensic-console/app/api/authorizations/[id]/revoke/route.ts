import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { appendAudit } from '@/lib/db';
import {
  jsonError,
  jsonOk,
  mapRpcErrorStatus,
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

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_authorization_revoke',
    {
      p_authorization_id: params.id,
      p_caller_officer_id: caller.officerId,
      p_caller_role: caller.roles[0] ?? 'SUPERVISING_OFFICER',
      p_reason: parsed.data.reason,
    },
  );
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }

  const data = result as {
    id: string;
    status: string;
    revokeAuditId: number;
  };

  // Cascade sessions. Not part of the atomic RPC — remains its own
  // round-trip, as it always has.
  const { data: terminatedSessions, error: sessionErr } = await supabase
    .from('monitoring_session')
    .update({ status: 'AUTO_TERMINATED' })
    .eq('authorization_id', params.id)
    .in('status', ['ACTIVE', 'PAUSED'])
    .select('id');
  if (sessionErr) return jsonError(500, sessionErr.message);

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
    id: data.id,
    revokeAuditId: data.revokeAuditId,
    terminatedSessionCount: sessionIds.length,
  });
}
