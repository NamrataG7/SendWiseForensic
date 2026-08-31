import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
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

  const { data: current, error: readErr } = await supabase
    .from('authorization')
    .select('id, status, case_id, subject_id, review_committee_approval')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) return jsonError(500, readErr.message);
  if (!current) return jsonError(404, 'authorization not found');

  const row = current as {
    id: string;
    status: string;
    case_id: string;
    subject_id: string;
    review_committee_approval: Record<string, unknown> | null;
  };
  if (row.status !== 'PENDING_REVIEW') {
    return jsonError(
      409,
      `cannot approve from status ${row.status}; expected PENDING_REVIEW`,
    );
  }

  const approval = {
    approvers: [caller.officerId],
    approvedAt: new Date().toISOString(),
    notes: body.notes ?? '',
    // TODO(REVIEW-COMMITTEE-QUORUM): single-user stub.
    prototypeStub: true,
  };

  const { error: updateErr } = await supabase
    .from('authorization')
    .update({
      status: 'ACTIVE',
      review_committee_approval: approval,
    })
    .eq('id', params.id)
    .eq('status', 'PENDING_REVIEW'); // optimistic guard

  if (updateErr) return jsonError(500, updateErr.message);

  const approveAudit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: 'REVIEW_COMMITTEE',
    action: 'AUTH_APPROVE',
    targetType: 'authorization',
    targetId: params.id,
    context: { caseId: row.case_id, subjectId: row.subject_id, approval },
    ip: requestIp(req),
  });
  if (!approveAudit.ok) {
    // TODO(AUDIT-ATOMICITY): revert the status change since audit failed.
    await supabase
      .from('authorization')
      .update({
        status: 'PENDING_REVIEW',
        review_committee_approval: row.review_committee_approval,
      })
      .eq('id', params.id);
    return jsonError(
      502,
      `approval reverted; audit append failed: ${approveAudit.error}`,
    );
  }

  const activateAudit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: 'REVIEW_COMMITTEE',
    action: 'AUTH_ACTIVATE',
    targetType: 'authorization',
    targetId: params.id,
    context: { caseId: row.case_id },
    ip: requestIp(req),
  });
  // Non-fatal on second audit failure — the transition is real; log-only.
  if (!activateAudit.ok) {
    return jsonOk(
      {
        id: params.id,
        approvalAuditId: approveAudit.id,
        activateAuditWarning: activateAudit.error,
      },
      200,
    );
  }

  return jsonOk({
    id: params.id,
    approvalAuditId: approveAudit.id,
    activateAuditId: activateAudit.id,
  });
}
