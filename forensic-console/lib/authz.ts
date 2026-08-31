/**
 * Authorization-issuance service.
 *
 * Dispatches to the per-jurisdiction adapter selected from
 * Case.jurisdiction (server-derived, NEVER client-picked). Runs the same
 * validation the DB triggers cannot express (statutory proportionality
 * prongs, Competent Authority allowlist, statutory duration bounds), plus
 * the Zod shape check from @sendwise-forensic/legal-framework/schemas.
 *
 * Cross-jurisdiction contamination — a statute prefix that does not match
 * the case jurisdiction — is refused here as defense in depth against the
 * DB trigger authorization_statute_prefix_matches_jurisdiction.
 */

import {
  AuthorizationSchema,
  AuthorizationScopeSchema,
  ProportionalityChecklistSchema,
  AuthorizationType,
  type Authorization as LFAuthorization,
} from '@sendwise-forensic/legal-framework';
import { z } from 'zod';
import { getAdapterFor, JurisdictionNotSupportedError } from '@/lib/adapter-selector';
import type { Jurisdiction } from '@/lib/entities';

// ---------------------------------------------------------------------------
// Public API-layer input shape
// ---------------------------------------------------------------------------

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
    /**
     * Optional client-declared jurisdiction. Ignored for adapter selection
     * (server always derives from Case.jurisdiction) but if present it MUST
     * equal the server-derived value or the write is refused.
     */
    jurisdiction: z.enum(['IN', 'US', 'UK']).optional(),
  })
  .strict();

export type IssueWarrantInput = z.infer<typeof IssueWarrantInputSchema>;

/**
 * Statute-prefix guard. Every reference must be namespaced with the
 * jurisdiction it belongs to; a mixed set is treated as contamination
 * and refused with an explicit error listing the offending codes.
 */
const PREFIX_BY_JURISDICTION: Record<Jurisdiction, string[]> = {
  IN: ['IN_', 'IT_ACT', 'IT_RULES', 'BNS_', 'BSA_', 'DPDPA'],
  US: ['US_'],
  UK: ['UK_'],
};

function statutePrefixMatches(ref: string, j: Jurisdiction): boolean {
  return PREFIX_BY_JURISDICTION[j].some((p) => ref.startsWith(p));
}

/**
 * Validate the composed authorization object before hitting the DB.
 * `jurisdiction` is derived server-side from the Case row and passed in
 * by the route handler — never trusted from the wire.
 */
export function validateWarrantIssue(
  input: IssueWarrantInput,
  jurisdiction: Jurisdiction,
): { ok: true; authorization: LFAuthorization }
  | { ok: false; status?: number; errors: string[] } {
  const errors: string[] = [];

  // Client-provided jurisdiction (if any) must match server-derived value.
  if (input.jurisdiction && input.jurisdiction !== jurisdiction) {
    return {
      ok: false,
      status: 409,
      errors: [
        `Client-declared jurisdiction '${input.jurisdiction}' does not match ` +
          `Case.jurisdiction '${jurisdiction}'. Adapter selection is DB-driven.`,
      ],
    };
  }

  // Cross-jurisdiction contamination in statute references.
  const contamination = input.statuteReferences.filter(
    (r) => !statutePrefixMatches(r, jurisdiction),
  );
  if (contamination.length > 0) {
    return {
      ok: false,
      status: 422,
      errors: [
        `REJECTED — cross-jurisdiction contamination: statute reference(s) ` +
          `do not match Case.jurisdiction '${jurisdiction}': ${contamination.join(', ')}`,
      ],
    };
  }

  // 1) Zod: assemble a full Authorization draft and validate the shape.
  const draft = {
    id: 'draft',
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
    return { ok: false, status: 422, errors };
  }

  const authorization = parsed.data;

  // 2) Per-jurisdiction adapter validation.
  let adapter;
  try {
    adapter = getAdapterFor(jurisdiction);
  } catch (err) {
    if (err instanceof JurisdictionNotSupportedError) {
      return {
        ok: false,
        status: 501,
        errors: [
          `Jurisdiction '${jurisdiction}' has no registered adapter. ` +
            `See @sendwise-forensic/legal-framework AdapterRegistry.`,
        ],
      };
    }
    throw err;
  }

  const validation = adapter.validateAuthorization(authorization);
  if (!validation.ok) {
    errors.push(...validation.errors);
  }

  // 3) Duration bounds (per-jurisdiction).
  const bounds = adapter.computeMaxDuration(authorization);
  if (bounds.perOrderDays !== null) {
    const perOrderMs = bounds.perOrderDays * 24 * 60 * 60 * 1000;
    const requestedMs =
      new Date(authorization.expiresOn).getTime() -
      new Date(authorization.issuedOn).getTime();
    if (requestedMs > perOrderMs) {
      errors.push(
        `Duration exceeds ${bounds.perOrderDays} days per order (${bounds.statuteReferences.join(', ')})`,
      );
    }
    if (requestedMs <= 0) {
      errors.push('expiresOn must be after issuedOn');
    }
  }

  if (errors.length > 0) return { ok: false, status: 422, errors };
  return { ok: true, authorization };
}

/**
 * Convenience wrapper — computes maximum duration for a given
 * jurisdiction's adapter without exposing the adapter surface.
 */
export function computeMaxDuration(
  auth: LFAuthorization,
  jurisdiction: Jurisdiction,
) {
  return getAdapterFor(jurisdiction).computeMaxDuration(auth);
}

/**
 * Verify the issuing authority is on the current per-jurisdiction
 * Competent Authority allowlist. TODO(US-OVERSIGHT-DIRECTORY) and
 * TODO(UK-JUDICIAL-COMMISSIONER-DIRECTORY): production integrations
 * pending; stubs live in each adapter.
 */
export function isCompetentAuthority(
  officerId: string,
  jurisdiction: Jurisdiction,
): boolean {
  const ca = getAdapterFor(jurisdiction).getCompetentAuthorities();
  if (ca.unionHomeSecretary?.officerId === officerId) return true;
  if (ca.stateHomeSecretaries.some((s) => s.officerId === officerId)) return true;
  if (
    ca.usFederalJudges?.some((j) => j.officerId === officerId) ||
    ca.usStateJudges?.some((j) => j.officerId === officerId)
  ) {
    return true;
  }
  return false;
}
