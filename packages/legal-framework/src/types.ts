/**
 * Shared enums for the SendWiseForensic legal-framework package.
 *
 * These are jurisdiction-agnostic where possible; statute-specific unions
 * (e.g. LegitimateAim) collect the values of every supported jurisdiction
 * and each adapter narrows to its own subset.
 */

export enum Jurisdiction {
  IN = 'IN',
  US = 'US',
  UK = 'UK',
}

export enum AuthorizationType {
  JUDICIAL_WARRANT = 'JUDICIAL_WARRANT',
  BAIL_CONDITION = 'BAIL_CONDITION',
  PROBATION_ORDER = 'PROBATION_ORDER',
  PLEA_AGREEMENT = 'PLEA_AGREEMENT',
  CORPORATE_INSIDER = 'CORPORATE_INSIDER',
  VOLUNTARY_VICTIM = 'VOLUNTARY_VICTIM',
}

export enum AuthorizationStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export enum DataCategory {
  KEYSTROKE = 'KEYSTROKE',
  APP_EVENT = 'APP_EVENT',
  COMMS_METADATA = 'COMMS_METADATA',
  RISK_DETECTION = 'RISK_DETECTION',
}

export enum PrivilegeCategory {
  LEGAL = 'LEGAL',
  MEDICAL = 'MEDICAL',
  CLERGY = 'CLERGY',
  SPOUSAL = 'SPOUSAL',
}

/**
 * Statute-specific legitimate aims. Each adapter accepts only the values
 * that map to grounds in its own governing statute. India uses the
 * IT Act §69 grounds.
 */
export enum LegitimateAimIN {
  SOVEREIGNTY_INTEGRITY = 'SOVEREIGNTY_INTEGRITY',
  DEFENCE_OF_INDIA = 'DEFENCE_OF_INDIA',
  SECURITY_OF_STATE = 'SECURITY_OF_STATE',
  FRIENDLY_RELATIONS_FOREIGN_STATES = 'FRIENDLY_RELATIONS_FOREIGN_STATES',
  PUBLIC_ORDER = 'PUBLIC_ORDER',
  PREVENT_INCITEMENT_COGNIZABLE_OFFENCE = 'PREVENT_INCITEMENT_COGNIZABLE_OFFENCE',
  // TODO(US-ADAPTER) add US grounds.
  // TODO(UK-ADAPTER) add UK grounds.
}

export type LegitimateAim = LegitimateAimIN;

/**
 * BSA §63 certificate — evidence admissibility artefact.
 */
export interface EvidenceCertificate {
  statuteReference: string;
  deviceDetails: {
    deviceId: string;
    fingerprint: string;
    platform: 'ANDROID';
  };
  integrityHash: string;
  collectionWindow: { startedAt: string; endedAt: string };
  signingOfficer: {
    officerId: string;
    responsibleOfficialPosition: string;
  };
  operatingProperly: boolean;
  generatedAt: string;
  // TODO(ESIGN-VERIFICATION) attach signer certificate + signature bytes.
}

export interface CompetentAuthorities {
  unionHomeSecretary: { officerId: string; name: string } | null;
  stateHomeSecretaries: Array<{
    state: string;
    officerId: string;
    name: string;
  }>;
}

export interface PurgeSchedule {
  triggerEvent: 'AUTHORIZATION_CESSATION';
  retainForDays: number;
  statuteReference: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}
