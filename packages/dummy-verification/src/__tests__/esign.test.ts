import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDummyESignToken } from '../esign';
import {
  DUMMY_ESIGN_MARKER,
  DummyVerificationError,
  TODO_ESIGN,
} from '../types';
import { DummyESignTokenSchema } from '../schema';
import { FIXTURE_DOC_BYTES, fixedClock } from './_fixtures';

test('esign: happy path returns a Zod-valid token with the dummy marker verbatim', async () => {
  const t = await makeDummyESignToken({
    signerName: 'Ravi Kumar',
    signerDesignation: 'Union Home Secretary (STUB)',
    documentBytes: FIXTURE_DOC_BYTES,
    clock: fixedClock,
  });
  assert.equal(t.kind, 'DUMMY_ESIGN');
  assert.equal(t.prototypeMarker, DUMMY_ESIGN_MARKER);
  assert.equal(t.prototypeMarker, 'DUMMY E-SIGN — PROTOTYPE ONLY');
  assert.equal(t.todoTag, TODO_ESIGN);
  assert.equal(t.todoTag, 'TODO(ESIGN-VERIFICATION)');
  assert.equal(
    t.documentHash,
    'c644f26a0d71bd3bbb2ef5e90ba41b6f10a19ca99934fb9e784edfafd3b2620c',
  );
  assert.equal(t.certificateSerialStub, 'PROTO-98FE401B40C72660');
  const parsed = DummyESignTokenSchema.safeParse(t);
  assert.equal(parsed.success, true);
});

test('esign: documentHash is stable across two calls for identical bytes', async () => {
  const a = await makeDummyESignToken({
    signerName: 'A',
    signerDesignation: 'X',
    documentBytes: FIXTURE_DOC_BYTES,
    clock: fixedClock,
  });
  const b = await makeDummyESignToken({
    signerName: 'B',
    signerDesignation: 'X',
    documentBytes: FIXTURE_DOC_BYTES,
    clock: fixedClock,
  });
  assert.equal(a.documentHash, b.documentHash);
});

test('esign: fails closed on empty document bytes', async () => {
  await assert.rejects(
    () =>
      makeDummyESignToken({
        signerName: 'A',
        signerDesignation: 'X',
        documentBytes: new Uint8Array(),
        clock: fixedClock,
      }),
    DummyVerificationError,
  );
});

test('esign: fails closed on empty signerName', async () => {
  await assert.rejects(
    () =>
      makeDummyESignToken({
        signerName: '',
        signerDesignation: 'X',
        documentBytes: FIXTURE_DOC_BYTES,
        clock: fixedClock,
      }),
    DummyVerificationError,
  );
});
