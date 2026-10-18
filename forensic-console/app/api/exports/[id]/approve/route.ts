import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  jsonError,
  jsonOk,
  mapRpcErrorStatus,
  refuseIfOnlyFilterTeam,
  requireRoleAny,
  resolveCaller,
} from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/exports/[id]/approve
 *
 * Adds the caller's officer id to evidence_export.approved_by. Once
 * cardinality is ≥ 2 AND at least one approver holds SUPERVISING_OFFICER,
 * the export becomes APPROVED (derived; the schema stores no status
 * column).
 *
 * Guardrails (enforced inside the RPC; unchanged from before):
 *   - Requester may not self-approve.
 *   - Same officer may not double-approve.
 *   - Only SUPERVISING_OFFICER may be the *finalizing* approver — but
 *     any of the two approvers may hold that role, so we simply require
 *     the caller carry SUPERVISING_OFFICER when their approval would
 *     take the count to ≥ 2 and no supervising approver is already
 *     present.
 *
 * The read-current-row guardrail checks, the approved_by update, and the
 * EVIDENCE_EXPORT audit append are all delegated to the atomic
 * p_export_approve() RPC (migration
 * 20260908000004_audit_atomicity_batch2.sql) so the update and its audit
 * row commit or roll back together, in one transaction. This does not
 * touch the DB-level evidence_export_dual_approval CHECK constraint
 * (approved_by cardinality ≥ 2), which still fires on the update exactly
 * as it did before.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  const notFilterOnly = refuseIfOnlyFilterTeam(caller);
  if (!notFilterOnly.ok) {
    return jsonError(notFilterOnly.status, notFilterOnly.error);
  }

  if (
    !requireRoleAny(caller, [
      'SUPERVISING_OFFICER',
      'INVESTIGATING_OFFICER',
    ])
  ) {
    return jsonError(
      403,
      'Only INVESTIGATING_OFFICER or SUPERVISING_OFFICER may approve exports',
    );
  }

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_export_approve',
    {
      p_export_id: params.id,
      p_caller_officer_id: caller.officerId,
      p_caller_role: caller.roles.includes('SUPERVISING_OFFICER')
        ? 'SUPERVISING_OFFICER'
        : 'INVESTIGATING_OFFICER',
    },
  );
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }
  const data = result as {
    id: string;
    approvers: string[];
    derivedStatus: string;
    auditId: number;
  };

  return jsonOk({
    id: data.id,
    approvers: data.approvers,
    derivedStatus: data.derivedStatus,
    auditId: data.auditId,
  });
}
