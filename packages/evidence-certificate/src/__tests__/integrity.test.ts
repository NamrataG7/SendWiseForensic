import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sha256Hex,
  verifyHashChain,
  aggregatedRootHash,
  type HashChainEntry,
} from '../integrity';

test('sha256Hex is stable and 64 hex chars', () => {
  const a = sha256Hex('hello');
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.equal(a, sha256Hex('hello'));
  assert.notEqual(a, sha256Hex('world'));
});

test('verifyHashChain accepts a well-formed chain', () => {
  const p1 = sha256Hex('payload-1');
  const p2 = sha256Hex('payload-2');
  const h1 = sha256Hex('' + p1);
  const h2 = sha256Hex(h1 + p2);
  const chain: HashChainEntry[] = [
    { payloadHash: p1, prevHash: '', hash: h1 },
    { payloadHash: p2, prevHash: h1, hash: h2 },
  ];
  assert.deepEqual(verifyHashChain(chain), { ok: true });
});

test('verifyHashChain detects a broken link (tampered payloadHash)', () => {
  const p1 = sha256Hex('payload-1');
  const p2 = sha256Hex('payload-2');
  const h1 = sha256Hex('' + p1);
  const h2 = sha256Hex(h1 + p2);
  const tampered: HashChainEntry[] = [
    { payloadHash: p1, prevHash: '', hash: h1 },
    { payloadHash: sha256Hex('evil'), prevHash: h1, hash: h2 },
  ];
  const res = verifyHashChain(tampered);
  assert.equal(res.ok, false);
  assert.equal(res.brokenAtIndex, 1);
});

test('aggregatedRootHash is deterministic over hash order', () => {
  const r = aggregatedRootHash(['aa', 'bb', 'cc']);
  assert.equal(r, sha256Hex('aabbcc'));
});
