/**
 * PROTOTYPE_NOTICE.md item 3 — Review Committee (§69 IT Rules 2009 R.22)
 * single-user stub.
 *
 * Real §69 authorizations must be reviewed by a Review Committee:
 *   Union: Cabinet Secretary + Secretary Legal Affairs + Secretary
 *          Telecommunications.
 *   State: equivalent (state-notified).
 *
 * The prototype allows a single user to approve, but we still return a
 * token — with `quorumMet=false` — so downstream consumers (e.g. the
 * India adapter's validateAuthorization) can decide whether to reject.
 *
 * TODO(REVIEW-COMMITTEE-QUORUM) — enforce full quorum before ACTIVE.
 */

import {
  DUMMY_REVIEW_COMMITTEE_MARKER,
  DummyVerificationError,
  TODO_REVIEW_COMMITTEE,
  type DummyReviewCommitteeApprover,
  type DummyReviewCommitteeToken,
  type ReviewCommitteeRole,
} from './types.js';

export interface MakeDummyReviewCommitteeApprovalInput {
  approvers: DummyReviewCommitteeApprover[];
  clock?: () => Date;
}

const REQUIRED_ROLES: readonly ReviewCommitteeRole[] = [
  'CABINET_SECRETARY_STUB',
  'SECRETARY_LEGAL_STUB',
  'SECRETARY_TELECOM_STUB',
];

export function makeDummyReviewCommitteeApproval(
  input: MakeDummyReviewCommitteeApprovalInput,
): DummyReviewCommitteeToken {
  if (!Array.isArray(input.approvers) || input.approvers.length === 0) {
    throw new DummyVerificationError('approvers must be a non-empty array', [
      {
        path: 'approvers',
        message: 'must contain at least one approver',
        statute: 'IT_RULES_2009_R22',
        todoTag: TODO_REVIEW_COMMITTEE,
      },
    ]);
  }
  for (let i = 0; i < input.approvers.length; i++) {
    const a = input.approvers[i];
    if (!a || !a.officerId || !a.name || !a.role) {
      throw new DummyVerificationError(
        `approvers[${i}] is missing required fields`,
        [
          {
            path: `approvers.${i}`,
            message: 'officerId, name, and role are required',
            statute: 'IT_RULES_2009_R22',
            todoTag: TODO_REVIEW_COMMITTEE,
          },
        ],
      );
    }
  }

  const roles = new Set(input.approvers.map((a) => a.role));
  const quorumMet =
    input.approvers.length >= 3 &&
    REQUIRED_ROLES.every((r) => roles.has(r));

  const clock = input.clock ?? (() => new Date());

  return {
    kind: 'DUMMY_REVIEW_COMMITTEE',
    approvedAt: clock().toISOString(),
    approvers: input.approvers.map((a) => ({ ...a })),
    quorumMet,
    prototypeMarker: DUMMY_REVIEW_COMMITTEE_MARKER,
    todoTag: TODO_REVIEW_COMMITTEE,
    statuteReference: 'IT_RULES_2009_R22',
  };
}
