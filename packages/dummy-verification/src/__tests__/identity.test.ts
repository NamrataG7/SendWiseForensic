import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDummyAadhaarToken } from '../identity';
import {
  DUMMY_IDENTITY_MARKER,
  DummyVerificationError,
  TODO_UIDAI,
} from '../types';
import { DummyIdentityTokenSchema } from '../schema';
import {
  FIXTURE_AADHAAR,
  FIXTURE_NAME,
  fixedClock,
} from './_fixtures';

test('identity: happy path returns a Zod-valid token with the dummy marker verbatim', () => {
  const t = makeDummyAadhaarToken({
    subjectAadhaar: FIXTURE_AADHAAR,
    subjectFullName: FIXTURE_NAME,
    clock: fixedClock,
  });
  assert.equal(t.kind, 'DUMMY_AADHAAR');
  assert.equal(t.prototypeMarker, DUMMY_IDENTITY_MARKER);
  assert.equal(t.prototypeMarker, 'DUMMY VERIFIED — PROTOTYPE ONLY');
  assert.equal(t.todoTag, TODO_UIDAI);
  assert.equal(t.todoTag, 'TODO(UIDAI-INTEGRATION)');
  assert.equal(t.sourceStatute, 'UIDAI_ACT_STUB');
  assert.equal(t.maskedIdentifier, 'XXXX-XXXX-9012');
  assert.equal(
    t.subjectRefHash,
    '2a33349e7e606a8ad2e30e3c84521f9377450cf09083e162e0a9b1480ce0f972',
  );
  assert.equal(t.issuedAt, '2026-02-01T00:00:00.000Z');
  assert.equal(t.expiresAt, '2026-02-02T00:00:00.000Z');
  const parsed = DummyIdentityTokenSchema.safeParse(t);
  assert.equal(parsed.success, true);
});

test('identity: strips spaces and hyphens before validating length', () => {
  const t = makeDummyAadhaarToken({
    subjectAadhaar: '1234 5678 9012',
    subjectFullName: FIXTURE_NAME,
    clock: fixedClock,
  });
  assert.equal(t.maskedIdentifier, 'XXXX-XXXX-9012');
});

test('identity: fails closed on non-12-digit Aadhaar with statute + todoTag', () => {
  try {
    makeDummyAadhaarToken({
      subjectAadhaar: '12345',
      subjectFullName: FIXTURE_NAME,
      clock: fixedClock,
    });
    assert.fail('expected DummyVerificationError');
  } catch (err) {
    assert.ok(err instanceof DummyVerificationError);
    const f = err.fields[0];
    assert.ok(f);
    assert.equal(f.path, 'subjectAadhaar');
    assert.equal(f.statute, 'UIDAI_ACT_STUB');
    assert.equal(f.todoTag, 'TODO(UIDAI-INTEGRATION)');
  }
});

test('identity: fails closed on empty subjectFullName', () => {
  assert.throws(
    () =>
      makeDummyAadhaarToken({
        subjectAadhaar: FIXTURE_AADHAAR,
        subjectFullName: '   ',
        clock: fixedClock,
      }),
    DummyVerificationError,
  );
});
