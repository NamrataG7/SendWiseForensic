import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  jsonError,
  jsonOk,
  mapRpcErrorStatus,
  requireRole,
  resolveCaller,
} from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/authorizations/extensions/[id]/decide
 *
 * Review Committee approve/deny on a pending warrant-extension request.
 * Body (JSON): { decision: 'approve' | 'deny', notes?: string }
 *
 * On approve: transitions authorization_extension.decision_status
 * PENDING → APPROVED and extends the parent authorization.expires_on to
 * the requested value. On deny: transitions PENDING → DENIED only; the
 * parent authorization is untouched.
 *
 * Follows the resolveCaller/requireRole/Zod-validation pattern as other
 * oversight routes. The core decision (status transition + expiry update +
 * audit append) is delegated to the atomic p_extension_decide() RPC
 * (migration 20260908000001_audit_atomicity_batch1.sql) so the mutation and
 * its audit row commit or roll back together, in one transaction.
 *
 * Audit actions EXTENSION_APPROVE / EXTENSION_DENY (migration
 * 20260906000001_extension_decide_audit_enum.sql) — added specifically for
 * this route, fixing a Phase 2 remediation finding (Oracle gate 4): the
 * prior AUTH_APPROVE/AUTH_SUSPEND reuse was semantically inaccurate for
 * deny (authorization.status is never actually suspended on deny), which
 * would have produced a false audit record for anyone querying audit_log
 * by action type.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  if (!requireRole(caller, ['REVIEW_COMMITTEE'])) {
    return jsonError(403, 'REVIEW_COMMITTEE role required');
  }

  let body: { decision?: string; notes?: string } = {};
  try {
    body = (await req.json()) as { decision?: string; notes?: string };
  } catch {
    // empty body not allowed — decision is required
  }
  const decision = body.decision;
  if (decision !== 'approve' && decision !== 'deny') {
    return jsonError(400, "decision must be 'approve' or 'deny'");
  }
  const notes = body.notes ?? '';

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_extension_decide',
    {
      p_extension_id: params.id,
      p_caller_officer_id: caller.officerId,
      p_decision: decision,
      p_reason: notes,
    },
  );
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }

  if (decision === 'approve') {
    const data = result as {
      id: string;
      authorizationId: string;
      oldExpiresOn: string;
      newExpiresOn: string;
      auditId: number;
    };
    return jsonOk({
      id: data.id,
      authorizationId: data.authorizationId,
      oldExpiresOn: data.oldExpiresOn,
      newExpiresOn: data.newExpiresOn,
      auditId: data.auditId,
    });
  }

  const data = result as {
    id: string;
    authorizationId: string;
    auditId: number;
  };
  return jsonOk({
    id: data.id,
    authorizationId: data.authorizationId,
    auditId: data.auditId,
  });
}
