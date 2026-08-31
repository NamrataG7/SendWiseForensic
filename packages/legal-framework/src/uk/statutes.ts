/**
 * Statute reference constants for the UK adapter.
 *
 * Every technical feature must cite at least one of these (see
 * docs/LEGAL_FRAMEWORK_UK.md for the feature -> statute traceability;
 * that document is authored by a sibling worker).
 *
 * All codes are UK_-prefixed to make cross-jurisdiction contamination
 * structurally impossible in the Filter Team console and evidence
 * certificate rendering paths.
 *
 * `url` is intentionally `null` in this prototype; a curated set of
 * legislation.gov.uk / Judicial Commissioners' Office links will be
 * attached before pilot.
 * TODO(STATUTE-URLS) attach canonical legislation.gov.uk URLs.
 */

export interface StatuteReference {
  code: string;
  title: string;
  url: string | null;
  note: string;
}

// ---- Human rights baseline ------------------------------------------------

export const UK_ECHR_ART_8: StatuteReference = {
  code: 'UK_ECHR_ART_8',
  title: 'European Convention on Human Rights, Article 8',
  url: null,
  note:
    'Right to respect for private and family life. Any interference must ' +
    'be (a) in accordance with law, (b) necessary in a democratic society ' +
    'for a legitimate aim, and (c) proportionate. This is the UK ' +
    'three-prong proportionality test (contrast: Puttaswamy four-prong, IN).',
};

export const UK_HRA_1998: StatuteReference = {
  code: 'UK_HRA_1998',
  title: 'Human Rights Act 1998',
  url: null,
  note:
    'Domesticates the ECHR. Public authorities must act compatibly with ' +
    'Convention rights (s.6). Warrant issuers and Judicial Commissioners ' +
    'are public authorities for this purpose.',
};

// ---- Investigatory Powers Act 2016 ---------------------------------------

export const UK_IPA_2016_PART2_CH1: StatuteReference = {
  code: 'UK_IPA_2016_PART2_CH1',
  title: 'Investigatory Powers Act 2016 - Part 2 Chapter 1 (ss.15-43)',
  url: null,
  note:
    'Targeted interception of communications. Primary UK statutory basis ' +
    'for lawful interception of live communications content.',
};

export const UK_IPA_2016_S15: StatuteReference = {
  code: 'UK_IPA_2016_S15',
  title: 'IPA 2016 s.15 - Subject-matter of warrants',
  url: null,
  note:
    'Defines what a targeted interception warrant may cover: a person, ' +
    'a single set of premises, or a group linked by a common purpose.',
};

export const UK_IPA_2016_S17: StatuteReference = {
  code: 'UK_IPA_2016_S17',
  title: 'IPA 2016 s.17 - Persons who may apply for warrants',
  url: null,
  note:
    'Applications may be made by heads of specified intelligence services ' +
    'and law-enforcement chiefs. Not open to arbitrary agencies.',
};

export const UK_IPA_2016_S19: StatuteReference = {
  code: 'UK_IPA_2016_S19',
  title: 'IPA 2016 s.19 - Grounds on which warrants may be issued',
  url: null,
  note:
    'A targeted interception warrant may be issued only on grounds of ' +
    '(a) national security, (b) preventing or detecting serious crime, ' +
    '(c) safeguarding the economic well-being of the UK so far as those ' +
    'interests are also relevant to national security.',
};

export const UK_IPA_2016_S23: StatuteReference = {
  code: 'UK_IPA_2016_S23',
  title: 'IPA 2016 s.23 - Approval of warrants by Judicial Commissioners',
  url: null,
  note:
    'The double-lock. A warrant issued by the Secretary of State (or ' +
    'Scottish Ministers) has no effect until approved by a Judicial ' +
    'Commissioner, applying judicial-review principles to necessity and ' +
    'proportionality.',
};

export const UK_IPA_2016_S29: StatuteReference = {
  code: 'UK_IPA_2016_S29',
  title: 'IPA 2016 s.29 - Approval of warrants issued in urgent cases',
  url: null,
  note:
    'Urgent-issue procedure. The Secretary of State may issue without ' +
    'prior JC approval, but a Judicial Commissioner must decide whether ' +
    'to approve within 3 working days; unapproved urgent warrants cease ' +
    'to have effect and material must be handled accordingly. Urgent ' +
    'warrants last only 5 working days.',
};

export const UK_IPA_2016_S32: StatuteReference = {
  code: 'UK_IPA_2016_S32',
  title: 'IPA 2016 s.32 - Duration of warrants',
  url: null,
  note:
    'Standard targeted interception warrants: 6 months from date of ' +
    'issue (or renewal). Urgent s.29 warrants: 5 working days.',
};

export const UK_IPA_2016_S56: StatuteReference = {
  code: 'UK_IPA_2016_S56',
  title: 'IPA 2016 s.56 - Exclusion of matters from legal proceedings',
  url: null,
  note:
    'Intercepted material and related conduct are inadmissible in and ' +
    'may not be disclosed in ordinary legal proceedings, subject to ' +
    'Schedule 3 exceptions. Critical admissibility caveat: intercept ' +
    'product cannot be tendered as evidence at trial (contrast BSA §63 ' +
    'in India, §2518(8)(a) in the US).',
};

export const UK_IPA_2016_PART5: StatuteReference = {
  code: 'UK_IPA_2016_PART5',
  title: 'IPA 2016 - Part 5 (ss.99-113) Equipment Interference',
  url: null,
  note:
    'Targeted equipment interference (EI) warrants. Closest UK analog ' +
    'to on-device supervision - covers conduct that would otherwise be ' +
    'an offence under the Computer Misuse Act 1990.',
};

export const UK_IPA_2016_S99: StatuteReference = {
  code: 'UK_IPA_2016_S99',
  title: 'IPA 2016 s.99 - Subject-matter of targeted EI warrants',
  url: null,
  note: 'Defines the persons/equipment that a targeted EI warrant may cover.',
};

export const UK_IPA_2016_S102: StatuteReference = {
  code: 'UK_IPA_2016_S102',
  title: 'IPA 2016 s.102 - Approval of EI warrants by Judicial Commissioners',
  url: null,
  note:
    'Double-lock for equipment interference: issuing authority + Judicial ' +
    'Commissioner approval, mirroring s.23.',
};

export const UK_IPA_2016_S108: StatuteReference = {
  code: 'UK_IPA_2016_S108',
  title: 'IPA 2016 s.108 - Duration of EI warrants',
  url: null,
  note:
    'Targeted EI warrants: 6 months from issue/renewal. Urgent: 5 ' +
    'working days.',
};

export const UK_IPA_2016_S113: StatuteReference = {
  code: 'UK_IPA_2016_S113',
  title: 'IPA 2016 s.113 - Renewal of EI warrants',
  url: null,
  note:
    'Renewal for a further 6 months requires fresh double-lock: renewal ' +
    'instrument + Judicial Commissioner approval.',
};

export const UK_IPA_2016_S150: StatuteReference = {
  code: 'UK_IPA_2016_S150',
  title:
    'IPA 2016 s.150 - Safeguards relating to retention and disclosure of material',
  url: null,
  note:
    'Handling arrangements: material obtained under an EI warrant must be ' +
    'destroyed as soon as retention is no longer necessary for any ' +
    'authorised purpose. Necessity-and-proportionality determines ' +
    'retention (no fixed calendar cap). Contrast IN 6-months-post-cessation ' +
    'and US 10-year sealed rule.',
};

export const UK_IPA_2016_S229: StatuteReference = {
  code: 'UK_IPA_2016_S229',
  title:
    'IPA 2016 s.229 - Investigatory Powers Commissioner and other Judicial Commissioners',
  url: null,
  note:
    'Establishes the IPC and the Judicial Commissioners. Independent ' +
    'oversight of the whole IPA regime.',
};

export const UK_IPA_2016_S234: StatuteReference = {
  code: 'UK_IPA_2016_S234',
  title: 'IPA 2016 s.234 - Annual and other reports',
  url: null,
  note:
    'Functions of the IPC and Judicial Commissioners: audit, inspection, ' +
    'annual reports laid before Parliament.',
};

// ---- RIPA 2000 (legacy) ---------------------------------------------------

export const UK_RIPA_2000_PART2: StatuteReference = {
  code: 'UK_RIPA_2000_PART2',
  title: 'Regulation of Investigatory Powers Act 2000 - Part II',
  url: null,
  note:
    'Directed and intrusive surveillance (still in force post-IPA 2016). ' +
    'Not the primary basis for on-device supervision, but referenced for ' +
    'covert surveillance conduct that falls outside interception/EI.',
};

export const UK_RIPA_2000_PART3: StatuteReference = {
  code: 'UK_RIPA_2000_PART3',
  title: 'RIPA 2000 - Part III (encryption keys), s.49 notice',
  url: null,
  note:
    'Power to require disclosure of protected electronic information ' +
    '(encryption keys). Still in force; may be relevant to compelled ' +
    'decryption of material handed over by the supervised device.',
};

// ---- Data protection ------------------------------------------------------

export const UK_DPA_2018_PART3: StatuteReference = {
  code: 'UK_DPA_2018_PART3',
  title: 'Data Protection Act 2018 - Part 3',
  url: null,
  note:
    'Law-enforcement processing regime (implements the LED). Analog to ' +
    "India's DPDPA §17 exemption pathway for competent authorities.",
};

export const UK_UK_GDPR: StatuteReference = {
  code: 'UK_UK_GDPR',
  title: 'UK GDPR (as retained by the Data Protection Act 2018)',
  url: null,
  note:
    'Baseline data-protection regime. Special-category data (Article 9) ' +
    'includes health data - relevant to UK_MEDICAL_DPA privilege handling.',
};

// ---- Criminal procedure / bail / sentencing ------------------------------

export const UK_PACE_1984: StatuteReference = {
  code: 'UK_PACE_1984',
  title: 'Police and Criminal Evidence Act 1984',
  url: null,
  note:
    'Governs police powers, evidence authenticity (s.78 exclusionary ' +
    'discretion), and special procedure material (ss.9-11) protecting ' +
    'journalistic material and legal privileged material.',
};

export const UK_BAIL_ACT_1976_S3: StatuteReference = {
  code: 'UK_BAIL_ACT_1976_S3',
  title: 'Bail Act 1976 s.3 - General provisions',
  url: null,
  note:
    'Court may impose conditions on bail as appear necessary. Basis for ' +
    'BAIL_CONDITION authorization type - duration set by the court order.',
};

export const UK_POCA_2000: StatuteReference = {
  code: 'UK_POCA_2000',
  title: 'Powers of Criminal Courts (Sentencing) Act 2000',
  url: null,
  note:
    'Supervision requirements (community orders, supervision orders). ' +
    'Basis for PROBATION_ORDER authorization type; duration set by the ' +
    'sentencing court.',
};

export const UK_CJPOA_1994_S51: StatuteReference = {
  code: 'UK_CJPOA_1994_S51',
  title:
    'Criminal Justice and Public Order Act 1994 s.51 - Intimidation of witnesses',
  url: null,
  note:
    'Offence taxonomy stub: witness intimidation - a common predicate ' +
    'offence for supervision applications.',
};

// ---- Explicit out-of-scope marker ----------------------------------------

export const UK_BULK_EI_OUT_OF_SCOPE: StatuteReference = {
  code: 'UK_BULK_EI_OUT_OF_SCOPE',
  title: 'IPA 2016 Part 6 Chapter 3 (Bulk EI) - OUT OF PROTOTYPE SCOPE',
  url: null,
  note:
    'Bulk equipment interference warrants (ss.176 et seq.) are ' +
    'deliberately out of scope for this court-ordered per-subject ' +
    'supervision prototype. TODO(BULK-EI-OUT-OF-SCOPE) - do not add ' +
    'bulk-EI code paths without a fresh legal review.',
};

export const STATUTES = {
  UK_ECHR_ART_8,
  UK_HRA_1998,
  UK_IPA_2016_PART2_CH1,
  UK_IPA_2016_S15,
  UK_IPA_2016_S17,
  UK_IPA_2016_S19,
  UK_IPA_2016_S23,
  UK_IPA_2016_S29,
  UK_IPA_2016_S32,
  UK_IPA_2016_S56,
  UK_IPA_2016_PART5,
  UK_IPA_2016_S99,
  UK_IPA_2016_S102,
  UK_IPA_2016_S108,
  UK_IPA_2016_S113,
  UK_IPA_2016_S150,
  UK_IPA_2016_S229,
  UK_IPA_2016_S234,
  UK_RIPA_2000_PART2,
  UK_RIPA_2000_PART3,
  UK_DPA_2018_PART3,
  UK_UK_GDPR,
  UK_PACE_1984,
  UK_BAIL_ACT_1976_S3,
  UK_POCA_2000,
  UK_CJPOA_1994_S51,
  UK_BULK_EI_OUT_OF_SCOPE,
} as const;

export type StatuteCode = keyof typeof STATUTES;

/**
 * Statute codes originating from other jurisdictions. Any statuteReference
 * on a UK Authorization or UK EvidenceCertificate matching one of these
 * prefixes is treated as cross-jurisdiction contamination and rejected
 * fail-closed.
 */
export const FOREIGN_STATUTE_PREFIXES: readonly string[] = [
  // India
  'IT_ACT_',
  'IT_RULES_',
  'BNSS_',
  'BNS_',
  'BSA_',
  'DPDPA_',
  'CONST_ART_21_PUTTASWAMY_',
  // United States
  'US_18USC_',
  'US_TITLE_III_',
  'US_ECPA_',
  'US_SCA_',
  'US_CONST_4TH_AMENDMENT',
  'US_BERGER_',
  'US_KATZ_',
  'US_RILEY_',
  'US_ALL_WRITS_',
  'US_FRCP_',
  'US_FISA_',
] as const;

export function findForeignStatuteRefs(refs: readonly string[]): string[] {
  return refs.filter((r) =>
    FOREIGN_STATUTE_PREFIXES.some((p) => r.startsWith(p)),
  );
}
