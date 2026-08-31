/**
 * @sendwise-forensic/dummy-verification — barrel export.
 *
 * Prototype-only dummy verification tokens. Every returned token carries
 * a `prototypeMarker` literal AND a `todoTag` matching the corresponding
 * entry in docs/PROTOTYPE_NOTICE.md.
 */

export * from './types.js';
export * from './banners.js';
export {
  DummyIdentityTokenSchema,
  DummyESignTokenSchema,
  DummyReviewCommitteeTokenSchema,
  DummyReviewCommitteeApproverSchema,
  CombinedDummyVerificationBundleSchema,
  ReviewCommitteeRoleEnum,
} from './schema.js';
export {
  makeDummyAadhaarToken,
  type MakeDummyAadhaarTokenInput,
} from './identity.js';
export {
  makeDummyESignToken,
  type MakeDummyESignTokenInput,
} from './esign.js';
export {
  makeDummyReviewCommitteeApproval,
  type MakeDummyReviewCommitteeApprovalInput,
} from './review-committee.js';
