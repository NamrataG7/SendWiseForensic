/**
 * Integrity helpers shared between the evidence-certificate module and the
 * forensic-console audit-log visualisation.
 *
 *   sha256Hex(input)        — canonical hex SHA-256 (Node runtime).
 *   verifyHashChain(entries) — walks a hash-chain and reports the first
 *                              broken link (index-based) or ok=true.
 *
 * A hash-chain entry is:
 *   { payloadHash, prevHash, hash }
 *   where hash === sha256Hex(prevHash || payloadHash).
 * `prevHash` for the first entry is the empty string "".
 */

import { createHash } from 'node:crypto';

export function sha256Hex(input: Uint8Array | string): string {
  const h = createHash('sha256');
  if (typeof input === 'string') {
    h.update(input, 'utf8');
  } else {
    h.update(input);
  }
  return h.digest('hex');
}

export interface HashChainEntry {
  payloadHash: string;
  prevHash: string;
  hash: string;
}

export interface HashChainVerifyResult {
  ok: boolean;
  brokenAtIndex?: number;
  reason?: string;
}

export function verifyHashChain(
  entries: readonly HashChainEntry[],
): HashChainVerifyResult {
  let expectedPrev = '';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e) {
      return { ok: false, brokenAtIndex: i, reason: 'undefined entry' };
    }
    if (e.prevHash !== expectedPrev) {
      return {
        ok: false,
        brokenAtIndex: i,
        reason: `prevHash mismatch: expected "${expectedPrev}", got "${e.prevHash}"`,
      };
    }
    const recomputed = sha256Hex(e.prevHash + e.payloadHash);
    if (recomputed !== e.hash) {
      return {
        ok: false,
        brokenAtIndex: i,
        reason: `hash mismatch: expected "${recomputed}", got "${e.hash}"`,
      };
    }
    expectedPrev = e.hash;
  }
  return { ok: true };
}

/**
 * Convenience: canonical aggregated root hash over an ordered list of
 * per-evidence SHA-256 hex strings. Concatenates in order with no separator
 * and hashes the result — the same algorithm the certificate schema
 * expects for evidence.aggregatedRootHash.
 */
export function aggregatedRootHash(hashes: readonly string[]): string {
  return sha256Hex(hashes.join(''));
}
