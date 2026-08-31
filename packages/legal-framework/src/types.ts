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
  // --- US-specific ---
  // US-namespaced variants. Distinct enum values from the India-side
  // labels so the Filter Team console shows unambiguous per-jurisdiction
  // categories. TODO(IN-PREFIX-MIGRATION): rename unprefixed India values
  // above to IN_-prefixed forms in a follow-up.
  US_ATTORNEY_CLIENT = 'US_ATTORNEY_CLIENT',
  US_MEDICAL_HIPAA = 'US_MEDICAL_HIPAA',
  US_CLERGY = 'US_CLERGY',
  US_SPOUSAL_TRAMMEL = 'US_SPOUSAL_TRAMMEL',
  // --- end US-specific ---
  // --- UK-specific ---
  // UK privilege categories are UK_-prefixed so the Filter Team console
  // cannot confuse them with the India (unprefixed) or US variants.
  // See docs/LEGAL_FRAMEWORK_UK.md and packages/legal-framework/src/uk/.
  UK_LPP = 'UK_LPP',                     // Legal professional privilege (R v Derby Magistrates ex p B)
  UK_JOURNALISTIC = 'UK_JOURNALISTIC',   // PACE ss.9-11 + IPA 2016 ss.28-29
  UK_MP_WILSON = 'UK_MP_WILSON',         // Wilson Doctrine / IPA 2016 s.26
  UK_MEDICAL_DPA = 'UK_MEDICAL_DPA',     // DPA 2018 special category / UK GDPR Art. 9
  UK_RELIGIOUS = 'UK_RELIGIOUS',         // Common-law considerations (no statutory blanket)
  // --- end UK-specific ---
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

export type LegitimateAim = LegitimateAimIN | LegitimateAimUS | LegitimateAimUK;

// --- US-specific ---
/**
 * US-specific grounds under Title III / ECPA. Every value is US_-prefixed
 * so cross-jurisdiction confusion is structurally impossible.
 */
export enum LegitimateAimUS {
  US_PARTICULAR_OFFENSE_S2516 = 'US_PARTICULAR_OFFENSE_S2516',
  US_INVESTIGATION_OF_ORGANIZED_CRIME = 'US_INVESTIGATION_OF_ORGANIZED_CRIME',
  US_NATIONAL_SECURITY_NON_FISA = 'US_NATIONAL_SECURITY_NON_FISA',
  US_PRETRIAL_SUPERVISION_S3142 = 'US_PRETRIAL_SUPERVISION_S3142',
  US_PROBATION_CONDITIONS_S3563 = 'US_PROBATION_CONDITIONS_S3563',
  US_CORPORATE_INSIDER_CONTRACT = 'US_CORPORATE_INSIDER_CONTRACT',
  US_VOLUNTARY_VICTIM_CONSENT = 'US_VOLUNTARY_VICTIM_CONSENT',
}
// --- end US-specific ---

// --- UK-specific ---
/**
 * UK grounds under IPA 2016 s.19 (targeted interception). Every value is
 * UK_-prefixed so cross-jurisdiction confusion is structurally impossible.
 */
export enum LegitimateAimUK {
  UK_NATIONAL_SECURITY_IPA_S19_1_A = 'UK_NATIONAL_SECURITY_IPA_S19_1_A',
  UK_SERIOUS_CRIME_IPA_S19_1_B = 'UK_SERIOUS_CRIME_IPA_S19_1_B',
  UK_ECONOMIC_WELLBEING_IPA_S19_1_C = 'UK_ECONOMIC_WELLBEING_IPA_S19_1_C',
}
// --- end UK-specific ---

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
  // India-side (§69 IT Rules 2009 R.3). Present iff jurisdiction is IN.
  unionHomeSecretary: { officerId: string; name: string } | null;
  stateHomeSecretaries: Array<{
    state: string;
    officerId: string;
    name: string;
  }>;
  // US-side. Under Title III / §2518 the authorizer is a court judge, not
  // an executive officer. Present iff jurisdiction is US.
  // TODO(JUDICIAL-DIRECTORY-INTEGRATION) resolve from AOUSC + state
  // judicial directories rather than the stub list.
  usFederalJudges?: Array<{ officerId: string; name: string; court: string }>;
  usStateJudges?: Array<{
    state: string;
    officerId: string;
    name: string;
    court: string;
  }>;
}

export interface PurgeSchedule {
  triggerEvent: 'AUTHORIZATION_CESSATION';
  retainForDays: number;
  statuteReference: string;
  // US Title III sealing (§2518(8)(a)) — sealed recordings retained per
  // court protective order. Optional so the India shape stays unchanged.
  minRetentionDays?: number;
  sealed?: boolean;
  sealingStatute?: string;
  note?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}
