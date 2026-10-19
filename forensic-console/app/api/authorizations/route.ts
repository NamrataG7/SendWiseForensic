import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  IssueWarrantInputSchema,
  validateWarrantIssue,
} from '@/lib/authz';
import {
  jsonError,
  jsonOk,
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
 * Insert + AUTH_ISSUE audit-append happen atomically inside the
 * SECURITY DEFINER RPC p_authorization_issue (20260909000010), which
 * also satisfies the authorization table's RLS (no INSERT policy
 * exists for INVESTIGATING_OFFICER/SUPERVISING_OFFICER — see that
 * migration) and normalizes legacy un-prefixed India statute codes to
 * the IN_-prefixed form the DB jurisdiction-prefix trigger requires.
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

  // Server-derive jurisdiction from Case.jurisdiction — never trust the
  // wire. If the client sent a jurisdiction field, validateWarrantIssue
  // will refuse the write if it disagrees with the DB row.
  const { data: caseRow, error: caseErr } = await supabase
    .from('case')
    .select('id, jurisdiction')
    .eq('id', shape.data.caseId)
    .maybeSingle();
  if (caseErr) {
    return jsonError(500, `case lookup failed: ${caseErr.message}`);
  }
  if (!caseRow) {
    return jsonError(404, `case ${shape.data.caseId} not found or not visible`);
  }
  const jurisdiction = (caseRow as { jurisdiction: 'IN' | 'US' | 'UK' })
    .jurisdiction;

  const validation = validateWarrantIssue(shape.data, jurisdiction);
  if (!validation.ok) {
    return jsonError(validation.status ?? 422, 'Validation failed', {
      violations: validation.errors,
    });
  }

  const a = validation.authorization;

  // Atomic insert + audit-append via SECURITY DEFINER RPC. Replaces the
  // former raw `.from('authorization').insert(...)`, which had no RLS
  // INSERT policy to satisfy (fixed in 20260909000010) and relied on a
  // two-round-trip insert-then-audit pattern with a compensating delete
  // on audit failure (TODO(AUDIT-ATOMICITY), now resolved — both writes
  // share one Postgres transaction inside the RPC).
  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_authorization_issue',
    {
      p_case_id: a.caseId,
      p_jurisdiction: jurisdiction,
      p_subject_id: a.subjectId,
      p_type: a.type,
      p_legitimate_aim: a.legitimateAim,
      p_issuing_authority_id: a.issuingAuthorityId,
      p_issued_on: a.issuedOn,
      p_expires_on: a.expiresOn,
      p_scope: a.scope,
      p_proportionality_checklist: a.proportionalityChecklist,
      p_review_committee_approval: a.reviewCommitteeApproval,
      p_statute_references: a.statuteReferences,
      p_signed_order_document_hash: a.signedOrderDocumentHash,
      p_signed_order_document_ref: a.signedOrderDocumentRef,
      p_dpdpa_exemption_ref: a.dpdpaExemptionRef,
      p_caller_officer_id: caller.officerId,
      // Preserves the original route's hardcoded actorRole: 'INVESTIGATING_OFFICER'
      // audit-log quirk when the caller actually holds that role; otherwise
      // records the actual matching role (SUPERVISING_OFFICER).
      p_caller_role: caller.roles.includes('INVESTIGATING_OFFICER')
        ? 'INVESTIGATING_OFFICER'
        : 'SUPERVISING_OFFICER',
    },
  );

  if (rpcErr || !result) {
    return jsonError(500, `authorization issuance failed: ${rpcErr?.message ?? 'unknown'}`);
  }

  const { id, auditId } = result as { id: string; auditId: number };
  return jsonOk({ id, auditId }, 201);
}
