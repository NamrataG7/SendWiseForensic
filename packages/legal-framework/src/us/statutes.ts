/**
 * Statute reference constants for the US adapter.
 *
 * Every entry is `US_`-prefixed so cross-jurisdiction confusion is
 * structurally impossible: the India adapter's contamination guard (and
 * the US adapter's guard implemented in ./index.ts) rejects any
 * authorization whose statuteReferences mix prefixes.
 *
 * Layout mirrors packages/legal-framework/src/india/statutes.ts.
 *
 * `url` is intentionally `null` in this prototype; a curated set of
 * Cornell LII / GPO / U.S. Code links will be attached before pilot.
 * TODO(STATUTE-URLS) attach canonical U.S. Code URLs.
 */

import type { StatuteReference } from '../india/statutes';

export type { StatuteReference };

// ── Constitutional / case-law frame ─────────────────────────────────────

export const US_CONST_4TH_AMENDMENT: StatuteReference = {
  code: 'US_CONST_4TH_AMENDMENT',
  title: 'U.S. Constitution — Fourth Amendment',
  url: null,
  note:
    'Right of the people to be secure against unreasonable searches and ' +
    'seizures; no warrants shall issue but upon probable cause, supported ' +
    'by oath or affirmation, and particularly describing the place to be ' +
    'searched and the persons or things to be seized.',
};

export const US_BERGER_1967: StatuteReference = {
  code: 'US_BERGER_1967',
  title: 'Berger v. New York, 388 U.S. 41 (1967)',
  url: null,
  note:
    'Wiretap orders must satisfy particularity: (a) particular offense ' +
    'under investigation, (b) particular facilities/place, (c) particular ' +
    'type of communication to be intercepted, (d) particular persons. ' +
    'All four are required for a Title III JUDICIAL_WARRANT.',
};

export const US_KATZ_1967: StatuteReference = {
  code: 'US_KATZ_1967',
  title: 'Katz v. United States, 389 U.S. 347 (1967)',
  url: null,
  note:
    'Reasonable expectation of privacy test: (1) subjective expectation ' +
    'of privacy; (2) that society is prepared to recognise as reasonable. ' +
    'The 4th Amendment protects people, not places.',
};

export const US_RILEY_2014: StatuteReference = {
  code: 'US_RILEY_2014',
  title: 'Riley v. California, 573 U.S. 373 (2014)',
  url: null,
  note:
    'A warrant is generally required to search digital contents of a ' +
    'cell phone seized incident to arrest. Cited for device-content ' +
    'proportionality on any US JUDICIAL_WARRANT.',
};

// ── Title III / Wiretap Act ─────────────────────────────────────────────

export const US_TITLE_III_1968: StatuteReference = {
  code: 'US_TITLE_III_1968',
  title:
    'Title III of the Omnibus Crime Control and Safe Streets Act of 1968 ' +
    '(18 U.S.C. §§ 2510–2523)',
  url: null,
  note:
    'Federal Wiretap Act. Governs real-time interception of wire, oral, ' +
    'and (via ECPA 1986) electronic communications.',
};

export const US_18USC_2516: StatuteReference = {
  code: 'US_18USC_2516',
  title: '18 U.S.C. § 2516 — Authorization for interception',
  url: null,
  note:
    'Enumerates the federal predicate offenses for which a Title III ' +
    'interception order may be sought. State counterparts must be at ' +
    'least as restrictive.',
};

export const US_18USC_2518: StatuteReference = {
  code: 'US_18USC_2518',
  title: '18 U.S.C. § 2518 — Procedure for interception',
  url: null,
  note:
    'Application, judicial authorization order, minimization, duration, ' +
    'and inventory provisions for Title III wiretaps.',
};

export const US_18USC_2518_1_B: StatuteReference = {
  code: 'US_18USC_2518_1_B',
  title: '18 U.S.C. § 2518(1)(b) — Required contents of application',
  url: null,
  note:
    'Application must include a full and complete statement of the facts ' +
    'and circumstances, including (i) details of the particular offense ' +
    'that has been, is being, or is about to be committed; (ii) a ' +
    'particular description of the nature and location of the facilities ' +
    'from which or the place where the communication is to be intercepted; ' +
    '(iii) a particular description of the type of communications sought; ' +
    '(iv) the identity of the person, if known, committing the offense.',
};

export const US_18USC_2518_5: StatuteReference = {
  code: 'US_18USC_2518_5',
  title: '18 U.S.C. § 2518(5) — Duration; extensions',
  url: null,
  note:
    'No order may authorize interception for longer than necessary and in ' +
    'no event longer than thirty days. Extensions may be granted for ' +
    'periods of no longer than thirty days each on a new showing.',
};

export const US_18USC_2518_7: StatuteReference = {
  code: 'US_18USC_2518_7',
  title: '18 U.S.C. § 2518(7) — Emergency interception',
  url: null,
  note:
    'Emergency interception may commence without prior judicial order in ' +
    'specified circumstances, but an application for an order approving ' +
    'the interception must be made within forty-eight hours or the ' +
    'interception must terminate.',
};

export const US_18USC_2518_8_A: StatuteReference = {
  code: 'US_18USC_2518_8_A',
  title: '18 U.S.C. § 2518(8)(a) — Sealing and custody of recordings',
  url: null,
  note:
    'Immediately upon expiration of the order (or extensions), recordings ' +
    'shall be made available to the judge and sealed under his directions. ' +
    'Custody shall be wherever the judge orders. Recordings shall not be ' +
    'destroyed except upon an order of the issuing or denying judge and in ' +
    'any event shall be kept for ten years.',
};

export const US_18USC_2518_8_D: StatuteReference = {
  code: 'US_18USC_2518_8_D',
  title: '18 U.S.C. § 2518(8)(d) — Inventory notice',
  url: null,
  note:
    'Within a reasonable time but not later than ninety days after ' +
    'termination of the interception, the issuing judge shall cause an ' +
    'inventory to be served on persons named in the order and other ' +
    'parties to intercepted communications.',
};

// ── ECPA / SCA / Pen Register / All Writs ───────────────────────────────

export const US_ECPA_1986: StatuteReference = {
  code: 'US_ECPA_1986',
  title: 'Electronic Communications Privacy Act of 1986',
  url: null,
  note:
    'Extended Title III to electronic communications. Combined with the ' +
    'SCA (Title II of ECPA) and Pen Register Act (Title III of ECPA).',
};

export const US_SCA_18USC_2701: StatuteReference = {
  code: 'US_SCA_18USC_2701',
  title: 'Stored Communications Act — 18 U.S.C. §§ 2701–2713',
  url: null,
  note:
    'Governs access to stored electronic communications and subscriber ' +
    'records held by electronic communication service and remote computing ' +
    'service providers. Distinct legal regime from real-time interception ' +
    'under Title III.',
};

export const US_PEN_REGISTER_18USC_3121: StatuteReference = {
  code: 'US_PEN_REGISTER_18USC_3121',
  title: 'Pen Register / Trap and Trace — 18 U.S.C. §§ 3121–3127',
  url: null,
  note:
    'Non-content dialing, routing, addressing, and signalling information. ' +
    'Lower standard than Title III content interception; cited for ' +
    'metadata-only collection paths.',
};

export const US_ALL_WRITS_28USC_1651: StatuteReference = {
  code: 'US_ALL_WRITS_28USC_1651',
  title: 'All Writs Act — 28 U.S.C. § 1651',
  url: null,
  note:
    'Residual authority for federal courts to issue writs necessary or ' +
    'appropriate in aid of their respective jurisdictions. Cited for ' +
    'CALEA-adjacent third-party compulsion when no statute directly ' +
    'authorizes the specific technical assistance sought.',
};

// ── Warrant procedure / release-conditions statutes ─────────────────────

export const US_FRCP_RULE_41: StatuteReference = {
  code: 'US_FRCP_RULE_41',
  title: 'Federal Rules of Criminal Procedure, Rule 41 — Search and Seizure',
  url: null,
  note:
    'Procedure for issuance of a federal search warrant: authority to ' +
    'issue, persons and property subject to search and seizure, execution ' +
    'and return, inventory.',
};

export const US_18USC_3142: StatuteReference = {
  code: 'US_18USC_3142',
  title: '18 U.S.C. § 3142 — Release or detention pending trial',
  url: null,
  note:
    'Court may impose the least restrictive further condition, or ' +
    'combination of conditions, that will reasonably assure the ' +
    'appearance of the person as required and the safety of any other ' +
    'person and the community. Basis for BAIL_CONDITION authorizations.',
};

export const US_18USC_3563: StatuteReference = {
  code: 'US_18USC_3563',
  title: '18 U.S.C. § 3563 — Conditions of probation',
  url: null,
  note:
    'Mandatory and discretionary conditions of probation. Basis for ' +
    'PROBATION_ORDER authorizations.',
};

// ── Out of prototype scope ──────────────────────────────────────────────

export const US_FISA_OUT_OF_SCOPE: StatuteReference = {
  code: 'US_FISA_OUT_OF_SCOPE',
  title: 'Foreign Intelligence Surveillance Act — 50 U.S.C. §§ 1801–1885',
  url: null,
  note:
    'TODO(FISA-OUT-OF-SCOPE) FISA authorities (Titles I, III, IV, V, VII) ' +
    'are intentionally out of scope for this prototype. Any FISA-derived ' +
    'authorization must be routed to a separate module with its own ' +
    'oversight framework.',
};

export const STATUTES = {
  US_CONST_4TH_AMENDMENT,
  US_BERGER_1967,
  US_KATZ_1967,
  US_RILEY_2014,
  US_TITLE_III_1968,
  US_18USC_2516,
  US_18USC_2518,
  US_18USC_2518_1_B,
  US_18USC_2518_5,
  US_18USC_2518_7,
  US_18USC_2518_8_A,
  US_18USC_2518_8_D,
  US_ECPA_1986,
  US_SCA_18USC_2701,
  US_PEN_REGISTER_18USC_3121,
  US_ALL_WRITS_28USC_1651,
  US_FRCP_RULE_41,
  US_18USC_3142,
  US_18USC_3563,
  US_FISA_OUT_OF_SCOPE,
} as const;

export type StatuteCode = keyof typeof STATUTES;

/**
 * Prefixes that identify NON-US jurisdictions. Any statuteReference on a
 * US authorization that begins with one of these is treated as
 * cross-jurisdiction contamination and rejected.
 *
 * See docs/LEGAL_FRAMEWORK_IN.md for the India-side codes.
 */
export const NON_US_STATUTE_PREFIXES: readonly string[] = [
  'IT_ACT_',
  'IT_RULES_',
  'BNSS_',
  'BNS_',
  'BSA_',
  'DPDPA_',
  'CONST_ART_21_PUTTASWAMY_',
  // TODO(UK-ADAPTER) add UK prefixes (e.g., RIPA_, IPA_) once the UK
  // adapter lands.
] as const;
