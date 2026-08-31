/**
 * Public token types for the prototype dummy-verification package.
 *
 * Every token carries:
 *   - a `prototypeMarker` literal string so downstream UI can render a
 *     visible red badge without inspecting the token type;
 *   - a `todoTag` matching docs/PROTOTYPE_NOTICE.md so grep-based audits
 *     can enumerate every prototype stub in the tree.
 *
 * See docs/PROTOTYPE_NOTICE.md items 1 (UIDAI e-KYC), 2 (UIDAI e-Sign),
 * and 3 (Review Committee quorum).
 */

export const DUMMY_IDENTITY_MARKER =
  'DUMMY VERIFIED — PROTOTYPE ONLY' as const;
export const DUMMY_ESIGN_MARKER = 'DUMMY E-SIGN — PROTOTYPE ONLY' as const;
export const DUMMY_REVIEW_COMMITTEE_MARKER =
  'DUMMY QUORUM — PROTOTYPE ONLY' as const;

export const TODO_UIDAI = 'TODO(UIDAI-INTEGRATION)' as const;
export const TODO_ESIGN = 'TODO(ESIGN-VERIFICATION)' as const;
export const TODO_REVIEW_COMMITTEE = 'TODO(REVIEW-COMMITTEE-QUORUM)' as const;

export type DummyIdentityMarker = typeof DUMMY_IDENTITY_MARKER;
export type DummyESignMarker = typeof DUMMY_ESIGN_MARKER;
export type DummyReviewCommitteeMarker = typeof DUMMY_REVIEW_COMMITTEE_MARKER;

export interface DummyIdentityToken {
  kind: 'DUMMY_AADHAAR';
  issuedAt: string;
  /** SHA-256 hex of the raw Aadhaar. Raw Aadhaar is never stored. */
  subjectRefHash: string;
  /** e.g. "XXXX-XXXX-1234". Safe to display. */
  maskedIdentifier: string;
  prototypeMarker: DummyIdentityMarker;
  expiresAt: string;
  sourceStatute: 'UIDAI_ACT_STUB';
  todoTag: typeof TODO_UIDAI;
}

export interface DummyESignToken {
  kind: 'DUMMY_ESIGN';
  issuedAt: string;
  signerName: string;
  signerDesignation: string;
  /** SHA-256 hex of the signed document bytes. */
  documentHash: string;
  certificateSerialStub: string;
  prototypeMarker: DummyESignMarker;
  todoTag: typeof TODO_ESIGN;
}

export type ReviewCommitteeRole =
  | 'CABINET_SECRETARY_STUB'
  | 'SECRETARY_LEGAL_STUB'
  | 'SECRETARY_TELECOM_STUB';

export interface DummyReviewCommitteeApprover {
  officerId: string;
  name: string;
  role: ReviewCommitteeRole;
}

export interface DummyReviewCommitteeToken {
  kind: 'DUMMY_REVIEW_COMMITTEE';
  approvedAt: string;
  approvers: DummyReviewCommitteeApprover[];
  quorumMet: boolean;
  prototypeMarker: DummyReviewCommitteeMarker;
  todoTag: typeof TODO_REVIEW_COMMITTEE;
  statuteReference: 'IT_RULES_2009_R22';
}

export interface CombinedDummyVerificationBundle {
  identity: DummyIdentityToken;
  eSign: DummyESignToken;
  reviewCommittee: DummyReviewCommitteeToken;
}

export interface DummyVerificationErrorField {
  path: string;
  message: string;
  statute?: string;
  todoTag?: string;
}

/**
 * Fail-closed error used by identity.ts et al. Mirrors the shape of
 * CertificateValidationError from @sendwise-forensic/evidence-certificate
 * so consumers can handle both uniformly.
 */
export class DummyVerificationError extends Error {
  readonly fields: DummyVerificationErrorField[];
  constructor(message: string, fields: DummyVerificationErrorField[]) {
    super(message);
    this.name = 'DummyVerificationError';
    this.fields = fields;
  }
}
