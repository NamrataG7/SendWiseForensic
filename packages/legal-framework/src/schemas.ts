/**
 * Zod schemas mirroring the entity model in docs/ENTITY_MODEL.md section 1.
 *
 * Style borrows from SendWise parental-dashboard/lib/schema.ts:
 *   - strict objects (reject unknown keys)
 *   - HEX64 for SHA-256 hashes
 *   - ISO 8601 refinements for timestamps
 *
 * These are shared, jurisdiction-neutral shapes. Adapters may layer
 * further constraints (e.g. India requires signedOrderDocumentHash for
 * JUDICIAL_WARRANT before it can become ACTIVE).
 */

import { z } from 'zod';
import {
  AuthorizationStatus,
  AuthorizationType,
  DataCategory,
  Jurisdiction,
  LegitimateAimIN,
  PrivilegeCategory,
} from './types';

const HEX64 = /^[a-f0-9]{64}$/i;
const iso8601 = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'must be ISO 8601');
const hex64 = z.string().regex(HEX64, 'must be 64 hex characters (SHA-256)');
const id = z.string().min(1);

export const JurisdictionEnum = z.nativeEnum(Jurisdiction);
export const AuthorizationTypeEnum = z.nativeEnum(AuthorizationType);
export const AuthorizationStatusEnum = z.nativeEnum(AuthorizationStatus);
export const DataCategoryEnum = z.nativeEnum(DataCategory);
export const PrivilegeCategoryEnum = z.nativeEnum(PrivilegeCategory);
export const LegitimateAimINEnum = z.nativeEnum(LegitimateAimIN);

// Puttaswamy four-prong proportionality checklist.
export const ProportionalityChecklistSchema = z
  .object({
    legality: z.object({ justified: z.boolean(), note: z.string().min(1) }),
    legitimateAim: z.object({
      justified: z.boolean(),
      note: z.string().min(1),
    }),
    proportionality: z.object({
      justified: z.boolean(),
      note: z.string().min(1),
    }),
    proceduralSafeguards: z.object({
      justified: z.boolean(),
      note: z.string().min(1),
    }),
  })
  .strict();

export const ReviewCommitteeApprovalSchema = z
  .object({
    approvers: z.array(id).min(1),
    approvedAt: iso8601,
    notes: z.string().default(''),
    // TODO(REVIEW-COMMITTEE-QUORUM) capture full quorum (Cabinet Secretary +
    // Secretary Legal + Secretary Telecom for Union; equivalents for State).
  })
  .strict();

export const AuthorizationScopeSchema = z
  .object({
    dataCategories: z.array(DataCategoryEnum).min(1),
    devices: z.array(id).min(1),
    timeWindows: z
      .array(
        z
          .object({ startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(0).max(23) })
          .strict(),
      )
      .optional(),
    keywords: z.array(z.string()).optional(),
    contextApps: z.array(z.string()).optional(),
  })
  .strict();

export const AuthorizationSchema = z
  .object({
    id,
    caseId: id,
    subjectId: id,
    type: AuthorizationTypeEnum,
    legitimateAim: LegitimateAimINEnum,
    issuingAuthorityId: id,
    issuedOn: iso8601,
    expiresOn: iso8601,
    scope: AuthorizationScopeSchema,
    proportionalityChecklist: ProportionalityChecklistSchema,
    reviewCommitteeApproval: ReviewCommitteeApprovalSchema.nullable(),
    statuteReferences: z.array(z.string().min(1)).min(1),
    signedOrderDocumentHash: hex64.nullable(),
    signedOrderDocumentRef: z.string().min(1).nullable(),
    dpdpaExemptionRef: z.string().min(1).nullable(),
    status: AuthorizationStatusEnum,
    revocationLog: z
      .array(
        z
          .object({ actorId: id, reason: z.string().min(1), at: iso8601 })
          .strict(),
      )
      .default([]),
    createdAt: iso8601,
    updatedAt: iso8601,
  })
  .strict();

export type Authorization = z.infer<typeof AuthorizationSchema>;

export const CaseSchema = z
  .object({
    id,
    jurisdiction: JurisdictionEnum,
    externalCaseRef: z.string().min(1),
    offences: z.array(z.string().min(1)),
    status: z.enum(['OPEN', 'UNDER_REVIEW', 'CLOSED', 'SEALED']),
    createdBy: id,
    assignedOfficers: z.array(id),
    createdAt: iso8601,
    closedAt: iso8601.nullable(),
  })
  .strict();
export type Case = z.infer<typeof CaseSchema>;

export const SubjectSchema = z
  .object({
    id,
    pseudonymousLabel: z.string().min(1),
    identityRefs: z
      .object({
        aadhaarHash: hex64,
        panHash: hex64.nullable(),
        verifiedByStub: z.boolean(),
        // TODO(UIDAI-INTEGRATION) replace verifiedByStub with real UIDAI e-KYC.
      })
      .strict(),
    devices: z.array(id),
    authorizations: z.array(id),
    createdAt: iso8601,
  })
  .strict();
export type Subject = z.infer<typeof SubjectSchema>;

export const DeviceSchema = z
  .object({
    id,
    subjectId: id,
    platform: z.literal('ANDROID'),
    deviceFingerprint: z.string().min(1), // TODO(PLAY-INTEGRITY)
    hardwareBackedPubKey: z.string().min(1).nullable(), // TODO(HARDWARE-KEYSTORE)
    enrolledAt: iso8601,
    lastSeenAt: iso8601,
    status: z.enum(['ENROLLED', 'UNINSTALLED', 'TAMPERED']),
  })
  .strict();
export type Device = z.infer<typeof DeviceSchema>;

export const MonitoringSessionSchema = z
  .object({
    id,
    authorizationId: id,
    deviceId: id,
    startedAt: iso8601,
    endsAt: iso8601,
    collectedCategories: z.array(DataCategoryEnum),
    autoTerminationTriggers: z
      .object({
        onExpiry: z.boolean(),
        onRevocation: z.boolean(),
        onTamper: z.boolean(),
      })
      .strict(),
    status: z.enum(['ACTIVE', 'PAUSED', 'ENDED', 'AUTO_TERMINATED']),
  })
  .strict();
export type MonitoringSession = z.infer<typeof MonitoringSessionSchema>;

export const EvidenceSchema = z
  .object({
    id,
    sessionId: id,
    category: z.enum([
      'KEYSTROKE_BATCH',
      'APP_EVENT',
      'COMMS_METADATA',
      'RISK_DETECTION',
    ]),
    capturedAt: iso8601,
    payloadHash: hex64,
    payloadRef: z.string().min(1),
    deviceSignature: z.string().min(1), // TODO(HARDWARE-KEYSTORE)
    prevEvidenceHash: hex64.nullable(),
    privilegeFlag: z.enum([
      'NONE',
      'LEGAL',
      'MEDICAL',
      'CLERGY',
      'SPOUSAL',
      'UNKNOWN',
    ]),
    quarantineStatus: z
      .enum(['PENDING_FILTER', 'RELEASED', 'SUPPRESSED'])
      .nullable(),
    redactionsApplied: z.array(z.record(z.unknown())).default([]),
    createdAt: iso8601,
  })
  .strict();
export type Evidence = z.infer<typeof EvidenceSchema>;

export const AuditLogSchema = z
  .object({
    id: z.string().min(1),
    prevAuditHash: hex64.nullable(),
    actorId: id,
    actorRole: z.string().min(1),
    action: z.string().min(1),
    targetType: z.string().min(1),
    targetId: id,
    context: z.record(z.unknown()).default({}),
    ip: z.string().min(1),
    deviceInfo: z.string().min(1),
    timestamp: iso8601,
    hash: hex64,
  })
  .strict();
export type AuditLog = z.infer<typeof AuditLogSchema>;
