/**
 * Authorization-issuance service (thin wrapper around the India adapter).
 *
 * Runs the same validation the DB triggers cannot express (Puttaswamy
 * 4-prong, Competent Authority allowlist, statutory duration bounds),
 * plus the Zod shape check derived from
 * @sendwise-forensic/legal-framework/schemas.
 *
 * The API route layer calls these; the DB layer catches anything we miss
 * via CHECK constraints and RLS.
 */

import {
  AuthorizationSchema,
  AuthorizationScopeSchema,
  ProportionalityChecklistSchema,
  IndiaLegalFramework,
  AuthorizationType,
  type Authorization as LFAuthorization,
} from '@sendwise-forensic/legal-framework';
import { z } from 'zod';

const india = new IndiaLegalFramework();

// ---------------------------------------------------------------------------
// Public API-layer input shape
// ---------------------------------------------------------------------------

/**
 * Input the /api/authorizations route accepts. Shape mirrors the wizard.
 * Server re-runs everything the wizard does client-side.
 */
export const IssueWarrantInputSchema = z
  .object({
    caseId: z.string().min(1),
    subjectId: z.string().min(1),
    legitimateAim: z.string().min(1),
    issuingAuthorityId: z.string().min(1),
    issuedOn: z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
      message: 'issuedOn must be ISO 8601',
    }),
    expiresOn: z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
      message: 'expiresOn must be ISO 8601',
    }),
    scope: AuthorizationScopeSchema,
    proportionalityChecklist: ProportionalityChecklistSchema,
    reviewCommitteeApproval: z
      .object({
        approvers: z.array(z.string().min(1)).min(1),
        approvedAt: z.string(),
        notes: z.string().default(''),
      })
      .nullable(),
    statuteReferences: z.array(z.string().min(1)).min(1),
    signedOrderDocumentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, 'must be 64 hex characters (SHA-256)'),
    signedOrderDocumentRef: z.string().min(1),
    dpdpaExemptionRef: z.string().min(1).nullable().default(null),
  })
  .strict();

export type IssueWarrantInput = z.infer<typeof IssueWarrantInputSchema>;

/**
 * Validate the composed authorization object before hitting the DB.
 * Enforces:
 *   - Zod shape from @sendwise-forensic/legal-framework/schemas
 *   - Puttaswamy 4-prong (all justified)
 *   - Competent Authority allowlist
 *   - IT Rules 2009 R.11 duration cap (60 days per order)
 */
export function validateWarrantIssue(input: IssueWarrantInput): {
  ok: true;
  authorization: LFAuthorization;
} | {
  ok: false;
  errors: string[];
} {
  const errors: string[] = [];

  // 1) Zod: assemble a full Authorization draft and validate the shape.
  const draft = {
    id: 'draft', // real id is assigned by DB on insert
    caseId: input.caseId,
    subjectId: input.subjectId,
    type: AuthorizationType.JUDICIAL_WARRANT,
    legitimateAim: input.legitimateAim,
    issuingAuthorityId: input.issuingAuthorityId,
    issuedOn: input.issuedOn,
    expiresOn: input.expiresOn,
    scope: input.scope,
    proportionalityChecklist: input.proportionalityChecklist,
    reviewCommitteeApproval: input.reviewCommitteeApproval,
    statuteReferences: input.statuteReferences,
    signedOrderDocumentHash: input.signedOrderDocumentHash,
    signedOrderDocumentRef: input.signedOrderDocumentRef,
    dpdpaExemptionRef: input.dpdpaExemptionRef,
    status: 'PENDING_REVIEW' as const,
    revocationLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const parsed = AuthorizationSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
    return { ok: false, errors };
  }

  const authorization = parsed.data;

  // 2) India adapter: Puttaswamy prongs + Competent Authority allowlist
  //    + JUDICIAL_WARRANT preconditions.
  const validation = india.validateAuthorization(authorization);
  if (!validation.ok) {
    errors.push(...validation.errors);
  }

  // 3) Duration bounds — IT Rules 2009 R.11 (60 days per order).
  const bounds = india.computeMaxDuration(authorization);
  if (bounds.perOrderDays !== null) {
    const perOrderMs = bounds.perOrderDays * 24 * 60 * 60 * 1000;
    const requestedMs =
      new Date(authorization.expiresOn).getTime() -
      new Date(authorization.issuedOn).getTime();
    if (requestedMs > perOrderMs) {
      errors.push(
        `IT Rules 2009 R.11: requested duration exceeds ${bounds.perOrderDays} days per order (${bounds.statuteReferences.join(', ')})`,
      );
    }
    if (requestedMs <= 0) {
      errors.push('expiresOn must be after issuedOn');
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, authorization };
}

/**
 * Convenience wrapper — exposed per task spec so callers don't reach
 * into the adapter directly.
 */
export function computeMaxDuration(auth: LFAuthorization) {
  return india.computeMaxDuration(auth);
}

/**
 * Verify the issuing authority is on the current Competent Authority
 * allowlist. Cheap check the API route uses before writing.
 */
export function isCompetentAuthority(officerId: string): boolean {
  const ca = india.getCompetentAuthorities();
  if (ca.unionHomeSecretary?.officerId === officerId) return true;
  return ca.stateHomeSecretaries.some((s) => s.officerId === officerId);
}
