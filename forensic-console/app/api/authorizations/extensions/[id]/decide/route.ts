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
 * Follows the same resolveCaller/requireRole/optimistic-lock/appendAudit
 * (with compensating rollback) pattern as
 * app/api/authorizations/[id]/review/route.ts.
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

  const { data: current, error: readErr } = await supabase
    .from('authorization_extension')
    .select(
      'id, parent_authorization_id, requested_new_expires_on, decision_status',
    )
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) return jsonError(500, readErr.message);
  if (!current) return jsonError(404, 'extension request not found');

  const ext = current as {
    id: string;
    parent_authorization_id: string;
    requested_new_expires_on: string;
    decision_status: string;
  };
  if (ext.decision_status !== 'PENDING') {
    return jsonError(
      409,
      `cannot decide from status ${ext.decision_status}; expected PENDING`,
    );
  }

  const { data: parentAuth, error: parentReadErr } = await supabase
    .from('authorization')
    .select('id, case_id, subject_id, expires_on')
    .eq('id', ext.parent_authorization_id)
    .maybeSingle();
  if (parentReadErr) return jsonError(500, parentReadErr.message);
  if (!parentAuth) return jsonError(404, 'parent authorization not found');

  const parent = parentAuth as {
    id: string;
    case_id: string;
    subject_id: string;
    expires_on: string;
  };
  const oldExpiresOn = parent.expires_on;

  if (decision === 'approve') {
    const { error: extUpdateErr } = await supabase
      .from('authorization_extension')
      .update({
        decision_status: 'APPROVED',
        decided_by: caller.officerId,
        decided_at: new Date().toISOString(),
        decision_reason: notes,
      })
      .eq('id', ext.id)
      .eq('decision_status', 'PENDING'); // optimistic guard
    if (extUpdateErr) return jsonError(500, extUpdateErr.message);

    const { error: authUpdateErr } = await supabase
      .from('authorization')
      .update({ expires_on: ext.requested_new_expires_on })
      .eq('id', parent.id)
      .eq('expires_on', oldExpiresOn); // optimistic guard
    if (authUpdateErr) {
      // Revert the extension-row transition since the expiry change failed.
      await supabase
        .from('authorization_extension')
        .update({
          decision_status: 'PENDING',
          decided_by: null,
          decided_at: null,
          decision_reason: null,
        })
        .eq('id', ext.id);
      return jsonError(500, authUpdateErr.message);
    }

    const audit = await appendAudit(supabase, {
      actorId: caller.officerId,
      actorRole: 'REVIEW_COMMITTEE',
      action: 'EXTENSION_APPROVE',
      targetType: 'authorization_extension',
      targetId: ext.id,
      context: {
        decision: 'approve',
        caseId: parent.case_id,
        subjectId: parent.subject_id,
        authorizationId: parent.id,
        oldExpiresOn,
        newExpiresOn: ext.requested_new_expires_on,
        notes,
      },
      ip: requestIp(req),
    });
    if (!audit.ok) {
      // TODO(AUDIT-ATOMICITY): revert both the extension decision and the
      // expiry change since audit failed.
      await supabase
        .from('authorization')
        .update({ expires_on: oldExpiresOn })
        .eq('id', parent.id);
      await supabase
        .from('authorization_extension')
        .update({
          decision_status: 'PENDING',
          decided_by: null,
          decided_at: null,
          decision_reason: null,
        })
        .eq('id', ext.id);
      return jsonError(
        502,
        `decision reverted; audit append failed: ${audit.error}`,
      );
    }

    return jsonOk({
      id: ext.id,
      authorizationId: parent.id,
      oldExpiresOn,
      newExpiresOn: ext.requested_new_expires_on,
      auditId: audit.id,
    });
  }

  // decision === 'deny'
  const { error: denyUpdateErr } = await supabase
    .from('authorization_extension')
    .update({
      decision_status: 'DENIED',
      decided_by: caller.officerId,
      decided_at: new Date().toISOString(),
      decision_reason: notes,
    })
    .eq('id', ext.id)
    .eq('decision_status', 'PENDING'); // optimistic guard
  if (denyUpdateErr) return jsonError(500, denyUpdateErr.message);

  const audit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: 'REVIEW_COMMITTEE',
    action: 'EXTENSION_DENY',
    targetType: 'authorization_extension',
    targetId: ext.id,
    context: {
      decision: 'deny',
      caseId: parent.case_id,
      subjectId: parent.subject_id,
      authorizationId: parent.id,
      requestedExpiresOn: ext.requested_new_expires_on,
      notes,
    },
    ip: requestIp(req),
  });
  if (!audit.ok) {
    // TODO(AUDIT-ATOMICITY): revert the decision since audit failed.
    await supabase
      .from('authorization_extension')
      .update({
        decision_status: 'PENDING',
        decided_by: null,
        decided_at: null,
        decision_reason: null,
      })
      .eq('id', ext.id);
    return jsonError(
      502,
      `decision reverted; audit append failed: ${audit.error}`,
    );
  }

  return jsonOk({
    id: ext.id,
    authorizationId: parent.id,
    auditId: audit.id,
  });
}
