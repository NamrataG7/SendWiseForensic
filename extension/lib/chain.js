// lib/chain.js
//
// Faithful JS port of the Android hash-chain algorithm so chains are
// structurally consistent across platforms. Matched against
// SupervisedKeyboardApp/.../evidence/EvidenceRecorder.kt's
// computeBatchHash():
//
//   val md = MessageDigest.getInstance("SHA-256")
//   md.update(prevHashHex.toByteArray())
//   md.update(payload)
//   val meta = buildString {
//       append(sessionId); append('|')
//       append(category.name); append('|')
//       append(capturedAt.toString()); append('|')
//       append(contextAppPackage.orEmpty()); append('|')
//       append(privilegeFlag.name)
//   }
//   md.update(meta.toByteArray())
//   return md.digest().joinToString("") { "%02x".format(it) }
//
// MessageDigest.update() calls are sequential partial updates into the same
// digest context, which is cryptographically equivalent to a single digest
// call over the concatenation of all updated byte ranges in the same order
// -- so a single crypto.subtle.digest() call over
// (prevHashHex bytes || payload bytes || metadata bytes) is a faithful port.
//
// And GENESIS_PREV_HASH_HEX, read verbatim from
// SupervisedKeyboardApp/.../evidence/EvidenceBatch.kt:
//   const val GENESIS_PREV_HASH_HEX: String =
//       "0000000000000000000000000000000000000000000000000000000000000000"
// This literal is exactly 64 '0' characters (directly verified via `wc -c`
// against the Kotlin source and this file), matching the server's
// evidence/ingest route.ts regex /^[a-f0-9]{64}$/i for prevBatchHashHex.

const GENESIS_PREV_HASH_HEX =
  '0000000000000000000000000000000000000000000000000000000000000000'.slice(0, 64);

// (Defensive .slice(0,64) above guards against any accidental extra
// characters being introduced by a future copy/paste; the literal as read
// from EvidenceBatch.kt is already exactly 64 chars -- see verification in
// the task report.)

const CHAIN_TAIL_STORAGE_KEY = 'chainTail';

function utf8Bytes(str) {
  return new TextEncoder().encode(str);
}

function concatBuffers(buffers) {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b instanceof Uint8Array ? b : new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out;
}

function bytesToHex(buf) {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Compute batchHashHex exactly as Android's computeBatchHash() does.
 * @param {string} prevHashHex
 * @param {Uint8Array|ArrayBuffer} payloadBytes
 * @param {string} sessionId
 * @param {string} category - DataCategory.name-equivalent string, e.g. 'RISK_DETECTION'
 * @param {string} capturedAtIso - Instant.toString()-equivalent ISO-8601 string
 * @param {string|null|undefined} contextAppPackage
 * @param {string} privilegeFlag - PrivilegeFlag.name-equivalent string, e.g. 'UNKNOWN'
 * @returns {Promise<string>} lowercase 64-hex-char digest
 */
async function computeBatchHash(
  prevHashHex,
  payloadBytes,
  sessionId,
  category,
  capturedAtIso,
  contextAppPackage,
  privilegeFlag,
) {
  const metaStr = [
    sessionId,
    category,
    capturedAtIso,
    contextAppPackage || '',
    privilegeFlag,
  ].join('|');

  const concatenated = concatBuffers([
    utf8Bytes(prevHashHex),
    payloadBytes instanceof Uint8Array ? payloadBytes : new Uint8Array(payloadBytes),
    utf8Bytes(metaStr),
  ]);

  const digest = await crypto.subtle.digest('SHA-256', concatenated);
  return bytesToHex(digest);
}

/**
 * Ack-then-advance: read the persisted chain tail for `sessionId`. Returns
 * GENESIS_PREV_HASH_HEX if there is no persisted tail, or if the persisted
 * tail belongs to a different sessionId (mirrors Android's
 * EvidenceRecorder.tailFor()).
 */
async function getTailHash(sessionId) {
  const stored = await chrome.storage.local.get(CHAIN_TAIL_STORAGE_KEY);
  const tail = stored[CHAIN_TAIL_STORAGE_KEY];
  if (tail && tail.sessionId === sessionId && typeof tail.lastBatchHash === 'string') {
    return tail.lastBatchHash;
  }
  return GENESIS_PREV_HASH_HEX;
}

/**
 * Persist the new chain tail. MUST only be called by background.js AFTER a
 * successful (2xx) ingest response -- never speculatively, so an unacked
 * batch is retried next cycle with the same prevBatchHashHex (no fork).
 */
async function advanceTailAfterAck(sessionId, newHashHex) {
  await chrome.storage.local.set({
    [CHAIN_TAIL_STORAGE_KEY]: { sessionId, lastBatchHash: newHashHex },
  });
}

self.SendWiseChain = {
  GENESIS_PREV_HASH_HEX,
  computeBatchHash,
  getTailHash,
  advanceTailAfterAck,
};
