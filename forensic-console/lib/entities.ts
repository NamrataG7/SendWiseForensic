/**
 * SendWiseForensic — core entity types.
 *
 * Mirrors docs/ENTITY_MODEL.md §1. This is the UI-facing type surface;
 * the DB schema (Supabase migrations) is owned by a separate lane.
 *
 * NOTE: These types are intentionally UI-shaped (Date objects, string IDs).
 * Wire-adapters between Supabase rows and these types live in
 * lib/db.ts (Supabase reads) and lib/authz.ts (validator wrappers).
 * Search for TODO(WIRE-TO-SCHEMA) for handoff points.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type Jurisdiction = 'IN' | 'US' | 'UK';

export type RoleName =
  | 'INVESTIGATING_OFFICER'
  | 'SUPERVISING_OFFICER'
  | 'COMPETENT_AUTHORITY'
  | 'REVIEW_COMMITTEE'
  | 'FILTER_TEAM'
  | 'PROSECUTOR'
  | 'DEFENSE_COUNSEL'
  | 'JUDICIAL_AUDITOR'
  | 'DPO'
  | 'SYSTEM';

export type CaseStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLOSED' | 'SEALED';

export type AuthorizationType =
  | 'JUDICIAL_WARRANT'
  | 'BAIL_CONDITION'
  | 'PROBATION_ORDER'
  | 'PLEA_AGREEMENT'
  | 'CORPORATE_INSIDER'
  | 'VOLUNTARY_VICTIM';

export type AuthorizationStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'REVOKED';

/** IT Act §69 legitimate aims — canonical enum. */
export type LegitimateAim =
  | 'SOVEREIGNTY_INTEGRITY'
  | 'DEFENCE_OF_INDIA'
  | 'SECURITY_OF_STATE'
  | 'FRIENDLY_RELATIONS'
  | 'PUBLIC_ORDER'
  | 'PREVENTING_INCITEMENT_TO_COGNIZABLE_OFFENCE'
  | 'INVESTIGATION_OF_OFFENCE';

export type DataCategory =
  | 'KEYSTROKE'
  | 'APP_EVENT'
  | 'COMMS_METADATA'
  | 'RISK_DETECTION';

export type DevicePlatform = 'ANDROID';
export type DeviceStatus = 'ENROLLED' | 'UNINSTALLED' | 'TAMPERED';

export type MonitoringSessionStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'ENDED'
  | 'AUTO_TERMINATED';

export type EvidenceCategory =
  | 'KEYSTROKE_BATCH'
  | 'APP_EVENT'
  | 'COMMS_METADATA'
  | 'RISK_DETECTION';

export type PrivilegeFlag =
  | 'NONE'
  | 'LEGAL'
  | 'MEDICAL'
  | 'CLERGY'
  | 'SPOUSAL'
  | 'UNKNOWN';

export type QuarantineStatus = 'PENDING_FILTER' | 'RELEASED' | 'SUPPRESSED';

export type ExportPurpose =
  | 'COURT_SUBMISSION'
  | 'INTERNAL_REVIEW'
  | 'DEFENSE_DISCLOSURE';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface Officer {
  id: string;
  fullName: string;
  designation: string;         // e.g., "Inspector, Cyber Cell, Pune"
  roles: RoleName[];
  organisation: string;        // e.g., "Maharashtra Police"
  serviceId?: string;          // service number / IPS batch, etc.
  isActive: boolean;
}

export interface Case {
  id: string;
  jurisdiction: Jurisdiction;
  externalCaseRef: string;     // e.g., FIR number
  offences: string[];          // BNS section codes, e.g., ["BNS_318(4)", "BNS_336"]
  status: CaseStatus;
  createdBy: Officer['id'];
  assignedOfficers: Officer['id'][];
  createdAt: Date;
  closedAt?: Date;
}

/** Puttaswamy 4-prong proportionality record. Every prong must be justified. */
export interface ProportionalityChecklist {
  legality: string;
  legitimateAim: string;
  proportionality: string;
  proceduralSafeguards: string;
}

export interface ReviewCommitteeApproval {
  approvers: {
    officerId: Officer['id'];
    designation: string;
    approvedAt: Date;
    note?: string;
  }[];
  quorumMet: boolean;
  // Prototype only — real system requires cryptographic per-approver signatures.
  isPrototypeStub: boolean;
}

export interface AuthorizationScope {
  dataCategories: DataCategory[];
  devices: Device['id'][];
  timeWindows?: { fromHour: number; toHour: number }[];
  keywords?: string[];
  contextApps?: string[];       // package names
}

export interface Authorization {
  id: string;
  caseId: Case['id'];
  subjectId: Subject['id'];
  type: AuthorizationType;
  legitimateAim: LegitimateAim;
  issuingAuthorityId: Officer['id'];
  issuedOn: Date;
  expiresOn: Date;
  scope: AuthorizationScope;
  proportionalityChecklist: ProportionalityChecklist;
  reviewCommitteeApproval?: ReviewCommitteeApproval;
  statuteReferences: string[]; // e.g., ["IT_ACT_S69", "IT_RULES_2009_R3"]
  signedOrderDocumentHash: string; // SHA-256 hex
  signedOrderDocumentRef: string;  // storage ref
  dpdpaExemptionRef?: string;
  status: AuthorizationStatus;
  revocationLog: {
    actorId: Officer['id'];
    reason: string;
    at: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Subject {
  id: string;
  /** System-generated pseudonym shown in most UI ("Subject A-7391"). */
  pseudonymousLabel: string;
  identityRefs: {
    aadhaarHash?: string;     // SHA-256; raw NEVER stored
    panHash?: string;
    /** TRUE in prototype = dummy-verified. UI MUST render a visible pill. */
    verifiedByStub: boolean;
  };
  devices: Device['id'][];
  authorizations: Authorization['id'][];
  createdAt: Date;
}

export interface Device {
  id: string;
  subjectId: Subject['id'];
  platform: DevicePlatform;
  deviceFingerprint: string;
  hardwareBackedPubKey?: string;
  enrolledAt: Date;
  lastSeenAt?: Date;
  status: DeviceStatus;
}

export interface MonitoringSession {
  id: string;
  authorizationId: Authorization['id'];
  deviceId: Device['id'];
  startedAt: Date;
  endsAt: Date;
  collectedCategories: DataCategory[];
  autoTerminationTriggers: {
    onExpiry: boolean;
    onRevocation: boolean;
    onTamper: boolean;
  };
  status: MonitoringSessionStatus;
}

export interface Evidence {
  id: string;
  sessionId: MonitoringSession['id'];
  category: EvidenceCategory;
  capturedAt: Date;
  payloadHash: string;
  payloadRef: string;
  deviceSignature: string;
  prevEvidenceHash?: string;
  privilegeFlag: PrivilegeFlag;
  quarantineStatus?: QuarantineStatus;
  redactionsApplied: string[];
  createdAt: Date;
}

export interface EvidenceExport {
  id: string;
  caseId: Case['id'];
  evidenceIds: Evidence['id'][];
  requestedBy: Officer['id'];
  approvedBy: Officer['id'][]; // ≥ 2 required; ≥ 1 SUPERVISING_OFFICER
  purpose: ExportPurpose;
  bsaSection63CertificateRef: string;
  exportedAt: Date;
  recipientNotice: string;
}

// ---------------------------------------------------------------------------
// Audit chain — append-only, hash-linked. Enforced at DB layer.
// ---------------------------------------------------------------------------

export type AuditAction =
  | 'LOGIN'
  | 'AUTH_ISSUE'
  | 'AUTH_REVOKE'
  | 'EVIDENCE_READ'
  | 'EVIDENCE_EXPORT'
  | 'QUERY_REWRITE_BLOCKED'
  | 'AUTH_EXPIRED_AUTO'
  | 'SESSION_AUTO_TERMINATED';

export interface AuditLogEntry {
  id: number;                  // monotonic
  prevAuditHash?: string;
  actorId: Officer['id'] | 'SYSTEM';
  actorRole: RoleName;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  context?: Record<string, unknown>;
  ip?: string;
  deviceInfo?: string;
  timestamp: Date;
  hash: string;                // SHA-256 over prev + payload
}
