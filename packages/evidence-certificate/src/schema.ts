/**
 * Zod schemas for CertificateInput and the rendered certificate JSON.
 * Mirrors the style of packages/legal-framework/src/schemas.ts:
 *   - strict() objects reject unknown keys
 *   - HEX64 for SHA-256 hashes
 *   - ISO 8601 refinement for timestamps
 */

import { z } from 'zod';

const HEX64 = /^[a-f0-9]{64}$/i;
const HEX_ANY = /^[a-f0-9]+$/i;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const iso8601 = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'must be ISO 8601');
const hex64 = z.string().regex(HEX64, 'must be 64 hex characters (SHA-256)');
const hexBytes = z.string().regex(HEX_ANY, 'must be hex-encoded bytes').min(2);
const nonEmpty = z.string().min(1);

export const DataCategoryEnum = z.enum([
  'KEYSTROKE_BATCH',
  'APP_EVENT',
  'COMMS_METADATA',
  'RISK_DETECTION',
]);

export const AuthorizationTypeRefEnum = z.enum([
  'JUDICIAL_WARRANT',
  'BAIL_CONDITION',
  'PROBATION_ORDER',
  'PLEA_AGREEMENT',
  'CORPORATE_INSIDER',
  'VOLUNTARY_VICTIM',
]);

export const PlatformEnum = z.enum(['ANDROID', 'IOS', 'DESKTOP', 'OTHER']);

export const IssuedBySchema = z
  .object({
    officerId: nonEmpty,
    name: nonEmpty,
    designation: nonEmpty,
    organizationalUnit: nonEmpty,
  })
  .strict();

export const AuthorizationRefSchema = z
  .object({
    warrantId: nonEmpty,
    type: AuthorizationTypeRefEnum,
    issuedOn: iso8601,
    expiresOn: iso8601,
    statuteReferences: z.array(nonEmpty).min(1),
  })
  .strict();

export const DeviceRefSchema = z
  .object({
    deviceId: nonEmpty,
    platform: PlatformEnum,
    model: nonEmpty,
    os: nonEmpty,
    deviceFingerprint: hexBytes,
    hardwareBackedPubKeyHex: hexBytes.optional(),
  })
  .strict();

export const CollectionRefSchema = z
  .object({
    startedAt: iso8601,
    endedAt: iso8601,
    sessionId: nonEmpty,
    categories: z.array(DataCategoryEnum).min(1),
  })
  .strict();

export const EvidenceBundleSchema = z
  .object({
    evidenceIds: z.array(nonEmpty).min(1),
    hashes: z.array(hex64).min(1),
    aggregatedRootHash: hex64,
  })
  .strict()
  .refine((v) => v.evidenceIds.length === v.hashes.length, {
    message: 'evidence.hashes.length must equal evidence.evidenceIds.length',
    path: ['hashes'],
  });

export const IntegrityBlockSchema = z
  .object({
    chainVerified: z.boolean(),
    chainVerifiedAt: iso8601,
    verifierRef: nonEmpty,
  })
  .strict();

export const CertificateInputSchema = z
  .object({
    certificateId: z.string().regex(UUID, 'must be a UUID'),
    issuedAt: iso8601,
    issuedBy: IssuedBySchema,
    caseRef: nonEmpty,
    authorizationRef: AuthorizationRefSchema,
    device: DeviceRefSchema,
    collection: CollectionRefSchema,
    evidence: EvidenceBundleSchema,
    integrity: IntegrityBlockSchema,
    deviceOperationalStatement: nonEmpty,
    statuteReferences: z
      .array(nonEmpty)
      .min(1)
      .refine((arr) => arr.includes('BSA_2023_S63'), {
        message: 'statuteReferences must include "BSA_2023_S63"',
      }),
    remarks: z.string().optional(),
    prototypeMode: z.boolean().optional(),
  })
  .strict();

export type CertificateInputParsed = z.infer<typeof CertificateInputSchema>;

export const RenderedCertificateJsonSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    certificateId: nonEmpty,
    issuedAt: iso8601,
    issuedBy: IssuedBySchema,
    caseRef: nonEmpty,
    authorizationRef: AuthorizationRefSchema,
    device: DeviceRefSchema,
    collection: CollectionRefSchema,
    evidence: EvidenceBundleSchema,
    integrity: IntegrityBlockSchema,
    deviceOperationalStatement: nonEmpty,
    statuteReferences: z.array(nonEmpty).min(1),
    remarks: z.string(),
  })
  .strict();
