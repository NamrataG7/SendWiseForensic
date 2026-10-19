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
 * Body: { action: 'approve' | 'reject', notes?: string, reason?: string }
 * (action defaults to 'approve' if omitted, for backward compatibility
 * with existing callers that only ever sent { notes }).
 *
 * Approve: for non-IN jurisdictions (US/UK), a single REVIEW_COMMITTEE
 * approver immediately transitions PENDING_REVIEW → ACTIVE (appending
 * AUTH_APPROVE + AUTH_ACTIVATE audit entries), as before. For IN, the
 * RPC enforces real 3-seat Review Committee quorum (Cabinet Secretary +
 * Secretary Legal + Secretary Telecom): each call accumulates the
 * caller's seat into review_committee_approval and only activates once
 * all 3 seats are present. Until quorum is met, the RPC returns a
 * partial-approval shape instead of the activation shape — both are
 * surfaced here as-is.
 *
 * Reject (P1.1 — previously missing entirely): a single REVIEW_COMMITTEE
 * member's decision, in every jurisdiction — quorum governs who may
 * ACTIVATE a warrant, not who may decline one. Transitions
 * PENDING_REVIEW → REJECTED (terminal, distinct from REVOKED: this
 * warrant never activated at all) and requires a non-empty reason.
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

  let body: { action?: string; notes?: string; reason?: string } = {};
  try {
    body = (await req.json()) as {
      action?: string;
      notes?: string;
      reason?: string;
    };
  } catch {
    // empty body allowed (defaults to approve, matching pre-existing behavior)
  }

  const action = body.action === 'reject' ? 'reject' : 'approve';

  if (action === 'reject') {
    const { data: result, error: rpcErr } = await supabase.rpc(
      'p_authorization_review_reject',
      {
        p_authorization_id: params.id,
        p_caller_officer_id: caller.officerId,
        p_reason: body.reason ?? '',
      },
    );
    if (rpcErr) {
      return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
    }
    const data = result as { id: string; status: string; rejectAuditId: number };
    return jsonOk({
      id: data.id,
      status: data.status,
      rejectAuditId: data.rejectAuditId,
    });
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
    quorumMet?: boolean;
    approvalAuditId?: number;
    activateAuditId?: number;
    seatsPresent?: string[];
    seatsMissing?: string[];
    approverCount?: number;
  };

  if (data.status === 'PENDING_REVIEW' && data.quorumMet === false) {
    // IN-jurisdiction partial approval: quorum not yet met.
    return jsonOk({
      id: data.id,
      status: data.status,
      quorumMet: false,
      seatsPresent: data.seatsPresent ?? [],
      seatsMissing: data.seatsMissing ?? [],
      approverCount: data.approverCount ?? 0,
    });
  }

  return jsonOk({
    id: data.id,
    status: data.status,
    quorumMet: data.quorumMet ?? true,
    approvalAuditId: data.approvalAuditId,
    activateAuditId: data.activateAuditId,
  });
}
