/**
 * Statute reference constants for the India adapter.
 *
 * Every technical feature must cite at least one of these (see
 * docs/LEGAL_FRAMEWORK_IN.md §7 for the feature→statute traceability).
 *
 * `url` is intentionally `null` in this prototype; a curated set of
 * India Code / eGazette links will be attached before pilot.
 * TODO(STATUTE-URLS) attach canonical India Code URLs.
 */

export interface StatuteReference {
  code: string;
  title: string;
  url: string | null;
  note: string;
}

export const IT_ACT_S69: StatuteReference = {
  code: 'IT_ACT_S69',
  title: 'Information Technology Act, 2000 — Section 69',
  url: null,
  note:
    'Power to issue directions for interception, monitoring, or decryption ' +
    'of any information through any computer resource. Grounds: sovereignty, ' +
    'defence, security of state, friendly relations with foreign states, ' +
    'public order, prevention of incitement to a cognizable offence.',
};

export const IT_RULES_2009_R3: StatuteReference = {
  code: 'IT_RULES_2009_R3',
  title:
    'IT (Procedure and Safeguards for Interception, Monitoring and Decryption) Rules, 2009 — Rule 3',
  url: null,
  note:
    'Directions for interception/monitoring/decryption to be issued only by ' +
    'the Competent Authority (Union Home Secretary or State Home Secretary).',
};

export const IT_RULES_2009_R11: StatuteReference = {
  code: 'IT_RULES_2009_R11',
  title: 'IT Rules 2009 — Rule 11 (Period of direction)',
  url: null,
  note:
    'Direction shall remain in force ≤ 60 days from date of issue; ' +
    'may be renewed but total period ≤ 180 days.',
};

export const IT_RULES_2009_R22: StatuteReference = {
  code: 'IT_RULES_2009_R22',
  title: 'IT Rules 2009 — Rule 22 (Review Committee)',
  url: null,
  note:
    'Review Committee (Cabinet Secretary + Secretary Legal + Secretary Telecom ' +
    'at Union; equivalent at State) reviews every 2 months.',
};

export const IT_RULES_2009_R23: StatuteReference = {
  code: 'IT_RULES_2009_R23',
  title: 'IT Rules 2009 — Rule 23 (Destruction of records)',
  url: null,
  note:
    'Records of interception/monitoring/decryption to be destroyed within ' +
    '6 months of discontinuance unless required for functional requirements.',
};

export const BNSS_2023: StatuteReference = {
  code: 'BNSS_2023',
  title: 'Bharatiya Nagarik Suraksha Sanhita, 2023',
  url: null,
  note:
    'Replaces CrPC. Ch. XXXV governs bail conditions; Ch. XXIII governs ' +
    'plea bargaining. Basis for BAIL_CONDITION / PLEA_AGREEMENT authorizations.',
};

export const BNS_2023: StatuteReference = {
  code: 'BNS_2023',
  title: 'Bharatiya Nyaya Sanhita, 2023',
  url: null,
  note: 'Substantive criminal code; Case.offences[] uses BNS section codes.',
};

export const BSA_2023_S63: StatuteReference = {
  code: 'BSA_2023_S63',
  title: 'Bharatiya Sakshya Adhiniyam, 2023 — Section 63',
  url: null,
  note:
    'Electronic records admissible with a certificate signed by a responsible ' +
    'official identifying record, device, manner of production, and stating the ' +
    'device was operating properly. Replaces old Evidence Act §65B.',
};

export const DPDPA_2023_S17: StatuteReference = {
  code: 'DPDPA_2023_S17',
  title: 'Digital Personal Data Protection Act, 2023 — Section 17',
  url: null,
  note:
    'Exemptions for notified government agencies. Reference must be captured ' +
    'on Authorization; not self-declared.',
};

export const CONST_ART_21_PUTTASWAMY_2017: StatuteReference = {
  code: 'CONST_ART_21_PUTTASWAMY_2017',
  title:
    'Constitution of India Art. 21 — K.S. Puttaswamy v. Union of India (2017) 10 SCC 1',
  url: null,
  note:
    'Right to privacy is a fundamental right. Four-prong proportionality: ' +
    'legality, legitimate aim, proportionality, procedural safeguards.',
};

export const STATUTES = {
  IT_ACT_S69,
  IT_RULES_2009_R3,
  IT_RULES_2009_R11,
  IT_RULES_2009_R22,
  IT_RULES_2009_R23,
  BNSS_2023,
  BNS_2023,
  BSA_2023_S63,
  DPDPA_2023_S17,
  CONST_ART_21_PUTTASWAMY_2017,
} as const;

export type StatuteCode = keyof typeof STATUTES;
