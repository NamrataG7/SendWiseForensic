/**
 * PROTOTYPE_NOTICE.md item 1 — Aadhaar / identity verification stub.
 *
 * Never store the raw Aadhaar number. We hash it and retain only the last
 * four digits in a masked form suitable for on-screen display.
 *
 * TODO(UIDAI-INTEGRATION) — replace with a real UIDAI e-KYC call.
 */

import { createHash } from 'node:crypto';
import {
  DUMMY_IDENTITY_MARKER,
  DummyVerificationError,
  TODO_UIDAI,
  type DummyIdentityToken,
} from './types';

const AADHAAR_DIGITS = /^\d{12}$/;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface MakeDummyAadhaarTokenInput {
  subjectAadhaar: string;
  subjectFullName: string;
  /** Injectable for deterministic tests. Defaults to () => new Date(). */
  clock?: () => Date;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function makeDummyAadhaarToken(
  input: MakeDummyAadhaarTokenInput,
): DummyIdentityToken {
  const clock = input.clock ?? (() => new Date());
  const raw = input.subjectAadhaar.replace(/[\s-]/g, '');
  if (!AADHAAR_DIGITS.test(raw)) {
    throw new DummyVerificationError(
      'subjectAadhaar must be exactly 12 digits (spaces and hyphens are stripped before validation)',
      [
        {
          path: 'subjectAadhaar',
          message: 'must be 12 digits',
          statute: 'UIDAI_ACT_STUB',
          todoTag: TODO_UIDAI,
        },
      ],
    );
  }
  if (input.subjectFullName.trim().length === 0) {
    throw new DummyVerificationError(
      'subjectFullName must not be empty',
      [
        {
          path: 'subjectFullName',
          message: 'must be non-empty',
          todoTag: TODO_UIDAI,
        },
      ],
    );
  }

  const now = clock();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + TWENTY_FOUR_HOURS_MS).toISOString();
  const last4 = raw.slice(-4);

  return {
    kind: 'DUMMY_AADHAAR',
    issuedAt,
    subjectRefHash: sha256Hex(raw),
    maskedIdentifier: `XXXX-XXXX-${last4}`,
    prototypeMarker: DUMMY_IDENTITY_MARKER,
    expiresAt,
    sourceStatute: 'UIDAI_ACT_STUB',
    todoTag: TODO_UIDAI,
  };
}
