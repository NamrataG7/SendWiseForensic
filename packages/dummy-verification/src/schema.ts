/**
 * Zod schemas for every dummy verification token. Strict — unknown keys
 * are rejected. The `prototypeMarker` literals are enforced at the type
 * level so any consumer that constructs a token by hand must include the
 * visible dummy stamp.
 */

import { z } from 'zod';
import {
  DUMMY_ESIGN_MARKER,
  DUMMY_IDENTITY_MARKER,
  DUMMY_REVIEW_COMMITTEE_MARKER,
  TODO_ESIGN,
  TODO_REVIEW_COMMITTEE,
  TODO_UIDAI,
} from './types';

const HEX64 = /^[a-f0-9]{64}$/i;
const iso8601 = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'must be ISO 8601');
const hex64 = z.string().regex(HEX64, 'must be 64 hex characters (SHA-256)');
const nonEmpty = z.string().min(1);

export const ReviewCommitteeRoleEnum = z.enum([
  'CABINET_SECRETARY_STUB',
  'SECRETARY_LEGAL_STUB',
  'SECRETARY_TELECOM_STUB',
]);

export const DummyIdentityTokenSchema = z
  .object({
    kind: z.literal('DUMMY_AADHAAR'),
    issuedAt: iso8601,
    subjectRefHash: hex64,
    maskedIdentifier: z
      .string()
      .regex(/^XXXX-XXXX-\d{4}$/, 'must be XXXX-XXXX-<4 digits>'),
    prototypeMarker: z.literal(DUMMY_IDENTITY_MARKER),
    expiresAt: iso8601,
    sourceStatute: z.literal('UIDAI_ACT_STUB'),
    todoTag: z.literal(TODO_UIDAI),
  })
  .strict();

export const DummyESignTokenSchema = z
  .object({
    kind: z.literal('DUMMY_ESIGN'),
    issuedAt: iso8601,
    signerName: nonEmpty,
    signerDesignation: nonEmpty,
    documentHash: hex64,
    certificateSerialStub: nonEmpty,
    prototypeMarker: z.literal(DUMMY_ESIGN_MARKER),
    todoTag: z.literal(TODO_ESIGN),
  })
  .strict();

export const DummyReviewCommitteeApproverSchema = z
  .object({
    officerId: nonEmpty,
    name: nonEmpty,
    role: ReviewCommitteeRoleEnum,
  })
  .strict();

export const DummyReviewCommitteeTokenSchema = z
  .object({
    kind: z.literal('DUMMY_REVIEW_COMMITTEE'),
    approvedAt: iso8601,
    approvers: z.array(DummyReviewCommitteeApproverSchema).min(1),
    quorumMet: z.boolean(),
    prototypeMarker: z.literal(DUMMY_REVIEW_COMMITTEE_MARKER),
    todoTag: z.literal(TODO_REVIEW_COMMITTEE),
    statuteReference: z.literal('IT_RULES_2009_R22'),
  })
  .strict();

export const CombinedDummyVerificationBundleSchema = z
  .object({
    identity: DummyIdentityTokenSchema,
    eSign: DummyESignTokenSchema,
    reviewCommittee: DummyReviewCommitteeTokenSchema,
  })
  .strict();
