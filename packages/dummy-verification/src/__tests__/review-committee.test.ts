import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDummyReviewCommitteeApproval } from '../review-committee';
import {
  DUMMY_REVIEW_COMMITTEE_MARKER,
  DummyVerificationError,
  TODO_REVIEW_COMMITTEE,
} from '../types';
import { DummyReviewCommitteeTokenSchema } from '../schema';
import { fixedClock } from './_fixtures';

test('review-committee: full quorum (all three role types + count >= 3) sets quorumMet=true', () => {
  const t = makeDummyReviewCommitteeApproval({
    approvers: [
      { officerId: 'O1', name: 'Cab Sec', role: 'CABINET_SECRETARY_STUB' },
      { officerId: 'O2', name: 'Sec Legal', role: 'SECRETARY_LEGAL_STUB' },
      { officerId: 'O3', name: 'Sec Tel', role: 'SECRETARY_TELECOM_STUB' },
    ],
    clock: fixedClock,
  });
  assert.equal(t.quorumMet, true);
  assert.equal(t.prototypeMarker, DUMMY_REVIEW_COMMITTEE_MARKER);
  assert.equal(t.prototypeMarker, 'DUMMY QUORUM — PROTOTYPE ONLY');
  assert.equal(t.todoTag, TODO_REVIEW_COMMITTEE);
  assert.equal(t.todoTag, 'TODO(REVIEW-COMMITTEE-QUORUM)');
  assert.equal(t.statuteReference, 'IT_RULES_2009_R22');
  const parsed = DummyReviewCommitteeTokenSchema.safeParse(t);
  assert.equal(parsed.success, true);
});

test('review-committee: single approver produces token with quorumMet=false', () => {
  const t = makeDummyReviewCommitteeApproval({
    approvers: [
      { officerId: 'O1', name: 'Cab Sec', role: 'CABINET_SECRETARY_STUB' },
    ],
    clock: fixedClock,
  });
  assert.equal(t.quorumMet, false);
  // Still a valid token (prototype path).
  const parsed = DummyReviewCommitteeTokenSchema.safeParse(t);
  assert.equal(parsed.success, true);
});

test('review-committee: three approvers but only two role types => quorumMet=false', () => {
  const t = makeDummyReviewCommitteeApproval({
    approvers: [
      { officerId: 'O1', name: 'A', role: 'CABINET_SECRETARY_STUB' },
      { officerId: 'O2', name: 'B', role: 'CABINET_SECRETARY_STUB' },
      { officerId: 'O3', name: 'C', role: 'SECRETARY_LEGAL_STUB' },
    ],
    clock: fixedClock,
  });
  assert.equal(t.quorumMet, false);
});

test('review-committee: fails closed on empty approvers array', () => {
  assert.throws(
    () => makeDummyReviewCommitteeApproval({ approvers: [], clock: fixedClock }),
    DummyVerificationError,
  );
});
