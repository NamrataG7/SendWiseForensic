/**
 * TypeScript types for the BSA §63 certificate module.
 *
 * These types deliberately duplicate no fields from the legal-framework
 * package: this module is meant to be usable from both the Node-side
 * forensic-console AND a future Android upload-receipt component, so it
 * imports nothing from @sendwise-forensic/legal-framework.
 */

export type DataCategory =
  | 'KEYSTROKE_BATCH'
  | 'APP_EVENT'
  | 'COMMS_METADATA'
  | 'RISK_DETECTION';

export type AuthorizationTypeRef =
  | 'JUDICIAL_WARRANT'
  | 'BAIL_CONDITION'
  | 'PROBATION_ORDER'
  | 'PLEA_AGREEMENT'
  | 'CORPORATE_INSIDER'
  | 'VOLUNTARY_VICTIM';

export interface IssuedBy {
  officerId: string;
  name: string;
  designation: string;
  organizationalUnit: string;
}

export interface AuthorizationRef {
  warrantId: string;
  type: AuthorizationTypeRef;
  issuedOn: string;
  expiresOn: string;
  statuteReferences: string[];
}

export interface DeviceRef {
  deviceId: string;
  platform: 'ANDROID' | 'IOS' | 'DESKTOP' | 'OTHER';
  model: string;
  os: string;
  /** Opaque hex-encoded fingerprint (Play Integrity / hardware attestation). */
  deviceFingerprint: string;
  /** Optional hardware-backed public key, hex-encoded. */
  hardwareBackedPubKeyHex?: string;
}

export interface CollectionRef {
  startedAt: string;
  endedAt: string;
  sessionId: string;
  categories: DataCategory[];
}

export interface EvidenceBundle {
  evidenceIds: string[];
  /** One SHA-256 hex per evidence record, aligned with evidenceIds. */
  hashes: string[];
  /** SHA-256 hex computed over the ordered evidence hashes. */
  aggregatedRootHash: string;
}

export interface IntegrityBlock {
  chainVerified: boolean;
  chainVerifiedAt: string;
  verifierRef: string;
}

export interface CertificateInput {
  certificateId: string;
  issuedAt: string;
  issuedBy: IssuedBy;
  caseRef: string;
  authorizationRef: AuthorizationRef;
  device: DeviceRef;
  collection: CollectionRef;
  evidence: EvidenceBundle;
  integrity: IntegrityBlock;
  deviceOperationalStatement: string;
  statuteReferences: string[];
  remarks?: string;
  /** If true, PDF renderer stamps "DUMMY VERIFIED — PROTOTYPE" in red. */
  prototypeMode?: boolean;
}

/**
 * The canonical JSON shape returned by toCertificateJson. Property order is
 * fixed (see render-json.ts) so the serialized form is deterministic and
 * safe to hash / sign downstream.
 */
export interface RenderedCertificateJson {
  schemaVersion: '1.0.0';
  certificateId: string;
  issuedAt: string;
  issuedBy: IssuedBy;
  caseRef: string;
  authorizationRef: AuthorizationRef;
  device: DeviceRef;
  collection: CollectionRef;
  evidence: EvidenceBundle;
  integrity: IntegrityBlock;
  deviceOperationalStatement: string;
  statuteReferences: string[];
  remarks: string;
}

export interface MissingFieldReport {
  path: string;
  label: string;
  statute: string;
  clause: string;
}

export class CertificateValidationError extends Error {
  readonly missingFields: MissingFieldReport[];
  readonly zodIssues: unknown;
  constructor(
    message: string,
    missingFields: MissingFieldReport[],
    zodIssues?: unknown,
  ) {
    super(message);
    this.name = 'CertificateValidationError';
    this.missingFields = missingFields;
    this.zodIssues = zodIssues;
  }
}
