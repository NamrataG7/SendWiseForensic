import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { appendAudit, getEvidenceExportById } from '@/lib/db';
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

/**
 * POST /api/exports/[id]/approve
 *
 * Adds the caller's officer id to evidence_export.approved_by. Once
 * cardinality is ≥ 2 AND at least one approver holds SUPERVISING_OFFICER,
 * the export becomes APPROVED (derived; the schema stores no status
 * column).
 *
 * Guardrails:
 *   - Requester may not self-approve.
 *   - Same officer may not double-approve.
 *   - Only SUPERVISING_OFFICER may be the *finalizing* approver — but
 *     any of the two approvers may hold that role, so we simply require
 *     the caller carry SUPERVISING_OFFICER when their approval would
 *     take the count to ≥ 2 and no supervising approver is already
 *     present.
 */
export async function POST(
  req: NextRequest,
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

  const current = await getEvidenceExportById(supabase, params.id);
  if (!current) return jsonError(404, 'export not found');

  if (current.requestedBy === caller.officerId) {
    return jsonError(
      409,
      'Requester may not self-approve an evidence export',
    );
  }
  if (current.approvedBy.includes(caller.officerId)) {
    return jsonError(409, 'This officer has already approved this export');
  }
  if (current.derivedStatus === 'GENERATED') {
    return jsonError(409, 'Export already generated; cannot re-approve');
  }

  // Look up approvers' roles so we can enforce the SUPERVISING_OFFICER
  // presence invariant per ENTITY_MODEL §3.5.
  const nextApprovers = [...current.approvedBy, caller.officerId];
  let supervisingSeen = caller.roles.includes('SUPERVISING_OFFICER');
  if (!supervisingSeen && current.approvedBy.length > 0) {
    // Existing approvers — check whether any of them is a supervising officer.
    const { data: rolesRows } = await supabase
      .from('officer_role')
      .select('officer_id, role:role_id(name)')
      .in('officer_id', current.approvedBy)
      .is('revoked_at', null);
    if (Array.isArray(rolesRows)) {
      for (const row of rolesRows as unknown as {
        role: { name: string } | null;
      }[]) {
        if (row.role?.name === 'SUPERVISING_OFFICER') {
          supervisingSeen = true;
          break;
        }
      }
    }
  }

  if (nextApprovers.length >= 2 && !supervisingSeen) {
    return jsonError(
      409,
      'ENTITY_MODEL §3.5: at least one approver must hold SUPERVISING_OFFICER role',
    );
  }

  const { error: updateErr } = await supabase
    .from('evidence_export')
    .update({ approved_by: nextApprovers })
    .eq('id', params.id);
  if (updateErr) return jsonError(500, updateErr.message);

  const willBecomeApproved = nextApprovers.length >= 2 && supervisingSeen;

  // TODO(AUDIT-ATOMICITY): audit append happens outside the update
  // transaction; on failure we revert approved_by.
  const audit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: caller.roles.includes('SUPERVISING_OFFICER')
      ? 'SUPERVISING_OFFICER'
      : 'INVESTIGATING_OFFICER',
    action: 'EVIDENCE_EXPORT',
    targetType: 'evidence_export',
    targetId: params.id,
    context: {
      approverCount: nextApprovers.length,
      derivedStatus: willBecomeApproved ? 'APPROVED' : 'PENDING_APPROVAL',
    },
    ip: requestIp(req),
  });
  if (!audit.ok) {
    await supabase
      .from('evidence_export')
      .update({ approved_by: current.approvedBy })
      .eq('id', params.id);
    return jsonError(
      502,
      `approval reverted; audit append failed: ${audit.error}`,
    );
  }

  return jsonOk({
    id: params.id,
    approvers: nextApprovers,
    derivedStatus: willBecomeApproved ? 'APPROVED' : 'PENDING_APPROVAL',
    auditId: audit.id,
  });
}
