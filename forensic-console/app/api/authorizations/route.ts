import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  IssueWarrantInputSchema,
  validateWarrantIssue,
} from '@/lib/authz';
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
 * POST /api/authorizations
 *
 * Creates a JUDICIAL_WARRANT in PENDING_REVIEW.
 *
 * Validation stack (server-side, mirrors client wizard):
 *   1. Zod (AuthorizationSchema via lib/authz.IssueWarrantInputSchema)
 *   2. IndiaLegalFramework.validateAuthorization
 *      - Puttaswamy 4-prong justified
 *      - JUDICIAL_WARRANT requires signedOrderDocumentHash + Review
 *        Committee approval + Competent Authority allowlist
 *   3. IT Rules 2009 R.11: perOrderDays ≤ 60
 *
 * Post-write: appends AUTH_ISSUE to audit_log via p_append_audit RPC.
 *
 * TODO(AUDIT-ATOMICITY): the row insert and the audit append are two
 * network round-trips. If the audit append fails, we attempt a
 * compensating delete of the just-created row and surface a 502 with a
 * clear message. A proper fix wraps both in one plpgsql function so
 * they share a Postgres transaction.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());

  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  if (
    !requireRole(caller, ['INVESTIGATING_OFFICER', 'SUPERVISING_OFFICER'])
  ) {
    return jsonError(
      403,
      'Only INVESTIGATING_OFFICER or SUPERVISING_OFFICER may draft warrants',
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }

  const shape = IssueWarrantInputSchema.safeParse(body);
  if (!shape.success) {
    return jsonError(422, 'Invalid input', {
      violations: shape.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }

  const validation = validateWarrantIssue(shape.data);
  if (!validation.ok) {
    return jsonError(422, 'Validation failed', {
      violations: validation.errors,
    });
  }

  const a = validation.authorization;

  const { data: inserted, error: insertErr } = await supabase
    .from('authorization')
    .insert({
      case_id: a.caseId,
      subject_id: a.subjectId,
      type: a.type,
      legitimate_aim: a.legitimateAim,
      issuing_authority_id: a.issuingAuthorityId,
      issued_on: a.issuedOn,
      expires_on: a.expiresOn,
      scope: a.scope,
      proportionality_checklist: a.proportionalityChecklist,
      review_committee_approval: a.reviewCommitteeApproval,
      statute_references: a.statuteReferences,
      signed_order_document_hash: a.signedOrderDocumentHash,
      signed_order_document_ref: a.signedOrderDocumentRef,
      dpdpa_exemption_ref: a.dpdpaExemptionRef,
      status: 'PENDING_REVIEW',
      revocation_log: [],
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return jsonError(500, `insert failed: ${insertErr?.message ?? 'unknown'}`);
  }

  const audit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: 'INVESTIGATING_OFFICER',
    action: 'AUTH_ISSUE',
    targetType: 'authorization',
    targetId: (inserted as { id: string }).id,
    context: {
      caseId: a.caseId,
      subjectId: a.subjectId,
      legitimateAim: a.legitimateAim,
      statuteReferences: a.statuteReferences,
    },
    ip: requestIp(req),
  });

  if (!audit.ok) {
    // TODO(AUDIT-ATOMICITY): compensating delete because the audit
    // write happens outside the insert's transaction.
    await supabase
      .from('authorization')
      .delete()
      .eq('id', (inserted as { id: string }).id);
    return jsonError(
      502,
      `authorization written but audit append failed; compensating rollback applied: ${audit.error}`,
    );
  }

  return jsonOk({ id: (inserted as { id: string }).id, auditId: audit.id }, 201);
}
