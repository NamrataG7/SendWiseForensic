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
 * POST /api/authorizations/[id]/review
 *
 * Review Committee approval (single-user stub for the prototype).
 * Transitions PENDING_REVIEW → ACTIVE and appends AUTH_APPROVE +
 * AUTH_ACTIVATE audit entries.
 *
 * TODO(REVIEW-COMMITTEE-QUORUM): production requires the full quorum
 * (Cabinet Secretary + Secretary Legal + Secretary Telecom for Union,
 * equivalents for State). Prototype records a single approver.
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

  let body: { notes?: string } = {};
  try {
    body = (await req.json()) as { notes?: string };
  } catch {
    // empty body allowed
  }

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_authorization_review_approve',
    {
      p_authorization_id: params.id,
      p_caller_officer_id: caller.officerId,
      p_notes: body.notes ?? '',
    },
  );
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }

  const data = result as {
    id: string;
    status: string;
    approvalAuditId: number;
    activateAuditId: number;
  };

  return jsonOk({
    id: data.id,
    approvalAuditId: data.approvalAuditId,
    activateAuditId: data.activateAuditId,
  });
}
