import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDummyAadhaarToken } from '../identity.js';
import { makeDummyESignToken } from '../esign.js';
import { makeDummyReviewCommitteeApproval } from '../review-committee.js';
import {
  PROTOTYPE_BANNER_TEXT,
  wrapWithDummyMarker,
} from '../banners.js';
import {
  FIXTURE_AADHAAR,
  FIXTURE_DOC_BYTES,
  FIXTURE_NAME,
  fixedClock,
} from './_fixtures.js';

test('determinism: full bundle JSON matches known snapshot for a fixed input', async () => {
  const identity = makeDummyAadhaarToken({
    subjectAadhaar: FIXTURE_AADHAAR,
    subjectFullName: FIXTURE_NAME,
    clock: fixedClock,
  });
  const eSign = await makeDummyESignToken({
    signerName: 'Ravi Kumar',
    signerDesignation: 'Union Home Secretary (STUB)',
    documentBytes: FIXTURE_DOC_BYTES,
    clock: fixedClock,
  });
  const reviewCommittee = makeDummyReviewCommitteeApproval({
    approvers: [
      { officerId: 'O1', name: 'Cab Sec', role: 'CABINET_SECRETARY_STUB' },
      { officerId: 'O2', name: 'Sec Legal', role: 'SECRETARY_LEGAL_STUB' },
      { officerId: 'O3', name: 'Sec Tel', role: 'SECRETARY_TELECOM_STUB' },
    ],
    clock: fixedClock,
  });

  const snapshot = JSON.stringify({ identity, eSign, reviewCommittee });
  const expected = JSON.stringify({
    identity: {
      kind: 'DUMMY_AADHAAR',
      issuedAt: '2026-02-01T00:00:00.000Z',
      subjectRefHash:
        '2a33349e7e606a8ad2e30e3c84521f9377450cf09083e162e0a9b1480ce0f972',
      maskedIdentifier: 'XXXX-XXXX-9012',
      prototypeMarker: 'DUMMY VERIFIED — PROTOTYPE ONLY',
      expiresAt: '2026-02-02T00:00:00.000Z',
      sourceStatute: 'UIDAI_ACT_STUB',
      todoTag: 'TODO(UIDAI-INTEGRATION)',
    },
    eSign: {
      kind: 'DUMMY_ESIGN',
      issuedAt: '2026-02-01T00:00:00.000Z',
      signerName: 'Ravi Kumar',
      signerDesignation: 'Union Home Secretary (STUB)',
      documentHash:
        'c644f26a0d71bd3bbb2ef5e90ba41b6f10a19ca99934fb9e784edfafd3b2620c',
      certificateSerialStub: 'PROTO-98FE401B40C72660',
      prototypeMarker: 'DUMMY E-SIGN — PROTOTYPE ONLY',
      todoTag: 'TODO(ESIGN-VERIFICATION)',
    },
    reviewCommittee: {
      kind: 'DUMMY_REVIEW_COMMITTEE',
      approvedAt: '2026-02-01T00:00:00.000Z',
      approvers: [
        { officerId: 'O1', name: 'Cab Sec', role: 'CABINET_SECRETARY_STUB' },
        { officerId: 'O2', name: 'Sec Legal', role: 'SECRETARY_LEGAL_STUB' },
        { officerId: 'O3', name: 'Sec Tel', role: 'SECRETARY_TELECOM_STUB' },
      ],
      quorumMet: true,
      prototypeMarker: 'DUMMY QUORUM — PROTOTYPE ONLY',
      todoTag: 'TODO(REVIEW-COMMITTEE-QUORUM)',
      statuteReference: 'IT_RULES_2009_R22',
    },
  });
  assert.equal(snapshot, expected);
});

test('wrapWithDummyMarker: adds _prototype top-level marker and deep-freezes', () => {
  const token = makeDummyAadhaarToken({
    subjectAadhaar: FIXTURE_AADHAAR,
    subjectFullName: FIXTURE_NAME,
    clock: fixedClock,
  });
  const wrapped = wrapWithDummyMarker(token);
  assert.equal(wrapped._prototype, PROTOTYPE_BANNER_TEXT);
  assert.equal(Object.isFrozen(wrapped), true);
  assert.throws(() => {
    (wrapped as unknown as { kind: string }).kind = 'HACK';
  });
});
