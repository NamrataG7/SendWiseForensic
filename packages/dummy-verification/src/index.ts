/**
 * @sendwise-forensic/dummy-verification — barrel export.
 *
 * Prototype-only dummy verification tokens. Every returned token carries
 * a `prototypeMarker` literal AND a `todoTag` matching the corresponding
 * entry in docs/PROTOTYPE_NOTICE.md.
 */

export * from './types';
export * from './banners';
export {
  DummyIdentityTokenSchema,
  DummyESignTokenSchema,
  DummyReviewCommitteeTokenSchema,
  DummyReviewCommitteeApproverSchema,
  CombinedDummyVerificationBundleSchema,
  ReviewCommitteeRoleEnum,
} from './schema';
export {
  makeDummyAadhaarToken,
  type MakeDummyAadhaarTokenInput,
} from './identity';
export {
  makeDummyESignToken,
  type MakeDummyESignTokenInput,
} from './esign';
export {
  makeDummyReviewCommitteeApproval,
  type MakeDummyReviewCommitteeApprovalInput,
} from './review-committee';
