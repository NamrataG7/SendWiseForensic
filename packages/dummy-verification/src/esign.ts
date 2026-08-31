/**
 * PROTOTYPE_NOTICE.md item 2 — Judicial e-Sign stub.
 *
 * Real system will require a UIDAI e-Sign digital signature from a
 * Competent Authority under IT Act §69 + IT Rules 2009 R.3, or from a
 * Magistrate under BNSS bail/probation pathways. The prototype only
 * captures the document hash and issuer form fields.
 *
 * TODO(ESIGN-VERIFICATION) — attach real signer certificate + verify
 * signature bytes.
 */

import { createHash } from 'node:crypto';
import {
  DUMMY_ESIGN_MARKER,
  DummyVerificationError,
  TODO_ESIGN,
  type DummyESignToken,
} from './types.js';

export interface MakeDummyESignTokenInput {
  signerName: string;
  signerDesignation: string;
  documentBytes: Uint8Array;
  clock?: () => Date;
}

/**
 * Hashes the document bytes using `crypto.subtle.digest` when available
 * (edge / browser / modern Node) and falls back to `node:crypto` on
 * older runtimes. Both paths yield the same hex output.
 */
async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const subtle = (
    globalThis as {
      crypto?: { subtle?: { digest(alg: string, data: Uint8Array): Promise<ArrayBuffer> } };
    }
  ).crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', bytes);
    const view = new Uint8Array(buf);
    let out = '';
    for (let i = 0; i < view.length; i++) {
      const b = view[i] ?? 0;
      out += b.toString(16).padStart(2, '0');
    }
    return out;
  }
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Deterministic pseudo-serial. NOT a real UUIDv5 — this is a prototype
 * placeholder. We take the first 16 hex chars of SHA-256(signerName ||
 * "\x00" || issuedAt) and prefix with "PROTO-" so it is obvious in logs
 * that this is not a real cert serial.
 */
function certificateSerialStub(signerName: string, issuedAt: string): string {
  const digest = createHash('sha256')
    .update(`${signerName}\u0000${issuedAt}`, 'utf8')
    .digest('hex');
  return `PROTO-${digest.slice(0, 16).toUpperCase()}`;
}

export async function makeDummyESignToken(
  input: MakeDummyESignTokenInput,
): Promise<DummyESignToken> {
  if (input.signerName.trim().length === 0) {
    throw new DummyVerificationError('signerName must not be empty', [
      { path: 'signerName', message: 'must be non-empty', todoTag: TODO_ESIGN },
    ]);
  }
  if (input.signerDesignation.trim().length === 0) {
    throw new DummyVerificationError('signerDesignation must not be empty', [
      {
        path: 'signerDesignation',
        message: 'must be non-empty',
        todoTag: TODO_ESIGN,
      },
    ]);
  }
  if (!(input.documentBytes instanceof Uint8Array) || input.documentBytes.length === 0) {
    throw new DummyVerificationError('documentBytes must be non-empty', [
      {
        path: 'documentBytes',
        message: 'must be a non-empty Uint8Array',
        todoTag: TODO_ESIGN,
      },
    ]);
  }

  const clock = input.clock ?? (() => new Date());
  const issuedAt = clock().toISOString();
  const documentHash = await sha256HexBytes(input.documentBytes);

  return {
    kind: 'DUMMY_ESIGN',
    issuedAt,
    signerName: input.signerName,
    signerDesignation: input.signerDesignation,
    documentHash,
    certificateSerialStub: certificateSerialStub(input.signerName, issuedAt),
    prototypeMarker: DUMMY_ESIGN_MARKER,
    todoTag: TODO_ESIGN,
  };
}
