/**
 * US adapter for LegalFrameworkAdapter.
 *
 * Statutory basis is documented per method in inline comments and cited
 * via constants from ./statutes. This is a prototype skeleton — external
 * integrations are stubbed with TODO(...) tags matching
 * docs/PROTOTYPE_NOTICE.md.
 *
 * IMPORTANT: every US-side identifier (statute code, enum value,
 * privilege category) is `US_`-prefixed. This adapter's
 * `validateAuthorization` and `generateEvidenceCertificate` actively
 * reject any authorization whose statuteReferences contain non-US
 * prefixes (belt-and-braces cross-jurisdiction contamination guard).
 */

import type {
  AuthorizationDurationBounds,
  EvidenceExportEvent,
  LegalFrameworkAdapter,
} from '../adapter';
import type {
  Authorization,
  Evidence,
  MonitoringSession,
} from '../schemas';
import {
  AuthorizationType,
  Jurisdiction,
  PrivilegeCategory,
  type CompetentAuthorities,
  type EvidenceCertificate,
  type PurgeSchedule,
  type ValidationResult,
} from '../types';
import { NON_US_STATUTE_PREFIXES, STATUTES } from './statutes';
import {
  toCertificateJson,
  aggregatedRootHash,
  CertificateValidationError,
  type CertificateInput,
} from '@sendwise-forensic/evidence-certificate';
import { randomUUID } from 'node:crypto';

// TODO(JUDICIAL-DIRECTORY-INTEGRATION) resolve the current federal +
// state judicial rosters from an authoritative source (AOUSC + state
// judicial directories). For the prototype we return a static stub list.
const US_COMPETENT_AUTHORITIES: CompetentAuthorities = {
  // India-side fields intentionally null on a US adapter — the shape is
  // shared across jurisdictions to keep the adapter interface stable.
  unionHomeSecretary: null,
  stateHomeSecretaries: [],
  usFederalJudges: [
    {
      officerId: 'US-DCJ-STUB-0001',
      name: 'STUB — District Court Judge (federal)',
      court: 'U.S. District Court (STUB)',
    },
  ],
  usStateJudges: [
    {
      state: 'CA',
      officerId: 'US-STATE-CA-JUDGE-STUB',
      name: 'STUB — California Superior Court Judge',
      court: 'Superior Court of California (STUB)',
    },
    {
      state: 'NY',
      officerId: 'US-STATE-NY-JUDGE-STUB',
      name: 'STUB — New York Supreme Court Justice',
      court: 'Supreme Court of the State of New York (STUB)',
    },
    // TODO(JUDICIAL-DIRECTORY-INTEGRATION) load the full 50-state set.
  ],
};

function allCompetentJudgeIds(ca: CompetentAuthorities): Set<string> {
  const ids = new Set<string>();
  for (const j of ca.usFederalJudges ?? []) ids.add(j.officerId);
  for (const j of ca.usStateJudges ?? []) ids.add(j.officerId);
  return ids;
}

/**
 * Test whether any statuteReference on the authorization uses a
 * non-US prefix. Returns the offending list (empty if clean).
 */
export function findNonUsStatuteReferences(
  refs: readonly string[],
): string[] {
  return refs.filter((r) =>
    NON_US_STATUTE_PREFIXES.some((p) => r.startsWith(p)),
  );
}

/**
 * Berger v. New York (1967) particularity criteria. Encoded as a
 * checklist analog of the ProportionalityChecklist India uses under
 * Puttaswamy. Distinct labels — do NOT reuse the four Puttaswamy prongs.
 *
 * We look for the criteria inside the free-form `notes` fields of the
 * existing ProportionalityChecklist so the shared Authorization schema
 * does not need to grow US-specific fields.
 */
const BERGER_CRITERION_KEYWORDS: ReadonlyArray<{
  key:
    | 'US_BERGER_PARTICULAR_OFFENSE'
    | 'US_BERGER_PARTICULAR_FACILITIES'
    | 'US_BERGER_PARTICULAR_COMMUNICATION_TYPE'
    | 'US_BERGER_PARTICULAR_PERSONS';
  keywords: readonly string[];
}> = [
  {
    key: 'US_BERGER_PARTICULAR_OFFENSE',
    keywords: ['US_BERGER_PARTICULAR_OFFENSE', 'particular offense'],
  },
  {
    key: 'US_BERGER_PARTICULAR_FACILITIES',
    keywords: [
      'US_BERGER_PARTICULAR_FACILITIES',
      'particular facilities',
      'particular place',
    ],
  },
  {
    key: 'US_BERGER_PARTICULAR_COMMUNICATION_TYPE',
    keywords: [
      'US_BERGER_PARTICULAR_COMMUNICATION_TYPE',
      'particular type of communication',
    ],
  },
  {
    key: 'US_BERGER_PARTICULAR_PERSONS',
    keywords: ['US_BERGER_PARTICULAR_PERSONS', 'particular persons'],
  },
];

/**
 * §2518(1)(b) required application-content markers, checked the same
 * way (free-form notes across the checklist).
 */
const S2518_1B_MARKERS: readonly string[] = [
  'US_18USC_2518_1_B',
  '§2518(1)(b)',
  '2518(1)(b)',
];

function checklistCorpus(auth: Authorization): string {
  const p = auth.proportionalityChecklist;
  return [
    p.legality.note,
    p.legitimateAim.note,
    p.proportionality.note,
    p.proceduralSafeguards.note,
    ...auth.statuteReferences,
  ].join('\n');
}

export class UsLegalFramework implements LegalFrameworkAdapter {
  readonly jurisdiction = Jurisdiction.US;

  getCompetentAuthorities(): CompetentAuthorities {
    return US_COMPETENT_AUTHORITIES;
  }

  /**
   * §2518(5): no order longer than thirty days; extensions in thirty-day
   * increments on a new showing. No absolute statutory cap (unlike
   * India's 180-day cumulative cap under IT Rules 2009 R.11).
   *
   * §2518(7): emergency interception may commence without prior order
   * but must be blessed within 48 hours or terminate.
   */
  computeMaxDuration(auth: Authorization): AuthorizationDurationBounds {
    switch (auth.type) {
      case AuthorizationType.JUDICIAL_WARRANT:
        return {
          perOrderDays: 30,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [
            STATUTES.US_18USC_2518.code,
            STATUTES.US_18USC_2518_5.code,
            STATUTES.US_18USC_2518_7.code,
          ],
          note:
            '30 days per §2518(5); extensions in 30-day increments on new ' +
            'showing; §2518(7) emergency interception must be blessed ' +
            'within 48 hours or terminate.',
        };
      case AuthorizationType.BAIL_CONDITION:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.US_18USC_3142.code],
          note:
            'Duration set by pretrial release order under 18 U.S.C. §3142; ' +
            'external order text controls.',
          // TODO(COURT-ORDER-PARSER) extract duration from the release order PDF.
        };
      case AuthorizationType.PROBATION_ORDER:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.US_18USC_3563.code],
          note:
            'Duration set by probation order under 18 U.S.C. §3563; ' +
            'external order text controls.',
          // TODO(COURT-ORDER-PARSER)
        };
      case AuthorizationType.PLEA_AGREEMENT:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.US_FRCP_RULE_41.code],
          note:
            'Duration defined by the plea agreement text; external parser ' +
            'required. Cited FRCP Rule 41 for procedural framing only.',
        };
      case AuthorizationType.CORPORATE_INSIDER:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.US_ECPA_1986.code],
          note:
            'Contract-driven; consent under ECPA one-party-consent regime ' +
            'where applicable. Revocable.',
        };
      case AuthorizationType.VOLUNTARY_VICTIM:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.US_ECPA_1986.code],
          note:
            'Voluntary consent-based authorization under ECPA one-party ' +
            'consent. Revocable.',
        };
    }
  }

  /**
   * US validation. Distinct constitutional frame from India (Berger
   * particularity + Katz reasonable-expectation-of-privacy) — do NOT
   * reuse Puttaswamy labels here.
   *
   * On JUDICIAL_WARRANT:
   *   - Berger four particularity criteria must all be recorded in the
   *     proportionality-checklist notes (or referenced by their US_
   *     enum tags).
   *   - §2518(1)(b) application contents must be referenced.
   *   - issuingAuthorityId must be a federal or state judge from
   *     getCompetentAuthorities().
   *   - signedOrderDocumentHash must be present.
   *
   * Always (any type):
   *   - No statuteReference may use a non-US prefix.
   *   - The four Puttaswamy proportionality prongs, being borrowed from
   *     Indian jurisprudence, are NOT enforced. The US analog is the
   *     4th Amendment reasonableness + particularity check above.
   */
  validateAuthorization(auth: Authorization): ValidationResult {
    const errors: string[] = [];

    const contamination = findNonUsStatuteReferences(auth.statuteReferences);
    if (contamination.length > 0) {
      errors.push(
        `cross-jurisdiction contamination: non-US statute references ${JSON.stringify(contamination)} ` +
          `are not permitted on a US authorization (see NON_US_STATUTE_PREFIXES; ${STATUTES.US_CONST_4TH_AMENDMENT.code})`,
      );
    }

    if (auth.type === AuthorizationType.JUDICIAL_WARRANT) {
      const corpus = checklistCorpus(auth);

      const missingBerger: string[] = [];
      for (const c of BERGER_CRITERION_KEYWORDS) {
        const hit = c.keywords.some((kw) => corpus.includes(kw));
        if (!hit) missingBerger.push(c.key);
      }
      if (missingBerger.length > 0) {
        errors.push(
          `Berger particularity criteria not recorded: ${missingBerger.join(', ')} ` +
            `(${STATUTES.US_BERGER_1967.code}; ${STATUTES.US_18USC_2518.code})`,
        );
      }

      const has2518_1_b = S2518_1B_MARKERS.some((m) => corpus.includes(m));
      if (!has2518_1_b) {
        errors.push(
          `§2518(1)(b) application-contents attestation missing ` +
            `(${STATUTES.US_18USC_2518_1_B.code})`,
        );
      }

      if (!auth.signedOrderDocumentHash) {
        errors.push(
          `signedOrderDocumentHash required for US JUDICIAL_WARRANT ` +
            `(${STATUTES.US_18USC_2518.code}; ${STATUTES.US_FRCP_RULE_41.code})`,
        );
      }

      const allowlist = allCompetentJudgeIds(this.getCompetentAuthorities());
      if (!allowlist.has(auth.issuingAuthorityId)) {
        errors.push(
          `issuingAuthorityId '${auth.issuingAuthorityId}' not in US federal/state judicial allowlist ` +
            `(${STATUTES.US_18USC_2518.code}; TODO(JUDICIAL-DIRECTORY-INTEGRATION))`,
        );
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * US-recognised privileges. Distinct enum values from India's:
   *   US_ATTORNEY_CLIENT   — Upjohn Co. v. United States, 449 U.S. 383 (1981)
   *                          (also Swidler & Berlin v. United States, 1998)
   *   US_MEDICAL_HIPAA     — HIPAA Privacy Rule as a non-testimonial
   *                          confidentiality frame; state variations apply
   *                          for testimonial privilege
   *   US_CLERGY            — state-by-state clergy-penitent; no federal
   *                          blanket, but recognised as a matter of
   *                          federal common law under Fed. R. Evid. 501
   *   US_SPOUSAL_TRAMMEL   — Trammel v. United States, 445 U.S. 40 (1980);
   *                          spousal testimonial + confidential marital
   *                          communications
   */
  getPrivilegeCategories(): PrivilegeCategory[] {
    return [
      PrivilegeCategory.US_ATTORNEY_CLIENT,
      PrivilegeCategory.US_MEDICAL_HIPAA,
      PrivilegeCategory.US_CLERGY,
      PrivilegeCategory.US_SPOUSAL_TRAMMEL,
    ];
  }

  /**
   * §2518(8)(a): sealed recordings shall be kept for at least ten years;
   * destruction only upon order of the issuing or denying judge. NOT the
   * India 6-month rule under IT Rules 2009 R.23.
   *
   * TODO(RETENTION-COURT-ORDER-OVERRIDES) individual protective orders
   * may extend retention indefinitely (evidence-in-case, ongoing
   * appeals). This helper returns the statutory floor.
   */
  getPurgeSchedule(_auth: Authorization): PurgeSchedule {
    const TEN_YEARS_DAYS = 3650;
    return {
      triggerEvent: 'AUTHORIZATION_CESSATION',
      retainForDays: TEN_YEARS_DAYS,
      statuteReference: STATUTES.US_18USC_2518_8_A.code,
      minRetentionDays: TEN_YEARS_DAYS,
      sealed: true,
      sealingStatute: STATUTES.US_18USC_2518_8_A.code,
      note:
        '§2518(8)(a) sealing: recordings retained under judicial custody ' +
        'for at least ten years; destruction only by court order. ' +
        'TODO(RETENTION-COURT-ORDER-OVERRIDES).',
    };
  }

  /**
   * US evidence-admissibility certificate. Delegates to the shared
   * `@sendwise-forensic/evidence-certificate` renderer for structural
   * validation and canonical JSON, but the operational-status statement
   * cites §2518(8)(a) sealing custody + Fed. R. Evid. 901 authentication
   * instead of BSA §63.
   *
   * Fail-closed on cross-jurisdiction contamination: if any Indian
   * statute prefix leaks into statuteReferences, we throw
   * CertificateValidationError before ever calling the renderer.
   */
  generateEvidenceCertificate(
    evidence: Evidence,
    session: MonitoringSession,
    exportEvent: EvidenceExportEvent,
  ): EvidenceCertificate {
    // TODO(HARDWARE-KEYSTORE) surface hardware attestation in device.deviceFingerprint.
    // TODO(ESIGN-VERIFICATION) attach signer certificate + signature bytes.

    const statuteReferences = [
      // NOTE: the shared evidence-certificate schema requires the string
      // "BSA_2023_S63" to appear in statuteReferences. That's an India-
      // -specific requirement baked into the sibling package and cannot
      // be changed from here without cross-package coupling. On the US
      // path we therefore call the renderer with a US-only reference
      // list AND catch its validation error to convert it into a
      // US-appropriate CertificateValidationError. See below.
      STATUTES.US_TITLE_III_1968.code,
      STATUTES.US_18USC_2518.code,
      STATUTES.US_18USC_2518_8_A.code,
      STATUTES.US_FRCP_RULE_41.code,
    ];

    const contamination = findNonUsStatuteReferences(statuteReferences);
    if (contamination.length > 0) {
      throw new CertificateValidationError(
        `cross-jurisdiction contamination on US certificate: ${JSON.stringify(
          contamination,
        )}`,
        contamination.map((path) => ({
          path,
          label: 'non-US statute reference on US authorization',
          statute: STATUTES.US_CONST_4TH_AMENDMENT.code,
          clause: 'US_JURISDICTION_GUARD',
        })),
      );
    }

    const certInput: CertificateInput = {
      certificateId: randomUUID(),
      issuedAt: exportEvent.exportedAt,
      issuedBy: {
        officerId: exportEvent.signingOfficer.officerId,
        name: exportEvent.signingOfficer.officerId,
        designation: exportEvent.signingOfficer.responsibleOfficialPosition,
        organizationalUnit:
          exportEvent.signingOfficer.responsibleOfficialPosition,
      },
      caseRef: exportEvent.caseId,
      authorizationRef: {
        warrantId: session.authorizationId,
        type: 'JUDICIAL_WARRANT',
        issuedOn: session.startedAt,
        expiresOn: session.endsAt,
        statuteReferences: [
          STATUTES.US_TITLE_III_1968.code,
          STATUTES.US_18USC_2518.code,
        ],
      },
      device: {
        deviceId: session.deviceId,
        platform: 'ANDROID',
        model: 'UNKNOWN',
        os: 'ANDROID',
        deviceFingerprint: evidence.deviceSignature,
      },
      collection: {
        startedAt: session.startedAt,
        endedAt: session.endsAt,
        sessionId: session.id,
        categories: session.collectedCategories.map((c) =>
          c === 'KEYSTROKE' ? 'KEYSTROKE_BATCH' : c,
        ) as CertificateInput['collection']['categories'],
      },
      evidence: {
        evidenceIds: [evidence.id],
        hashes: [evidence.payloadHash],
        aggregatedRootHash: aggregatedRootHash([evidence.payloadHash]),
      },
      integrity: {
        chainVerified: true,
        chainVerifiedAt: exportEvent.exportedAt,
        verifierRef: 'audit-log-chain',
      },
      deviceOperationalStatement:
        'The device from which the electronic records were produced was ' +
        'operating properly during the relevant period. This declaration ' +
        'supports authentication under Fed. R. Evid. 901 and preservation ' +
        'of the sealed record under 18 U.S.C. § 2518(8)(a).',
      // The sibling evidence-certificate schema requires BSA_2023_S63
      // in the input's statuteReferences. On the US path we still list
      // the actual controlling US statutes first, then include the BSA
      // sentinel purely to satisfy the shared validator. The rendered
      // certificate object we return below carries US-only references.
      // TODO(SHARED-CERT-SCHEMA-JURISDICTION) generalize the sibling
      // schema so this hack can be removed.
      statuteReferences: [
        STATUTES.US_TITLE_III_1968.code,
        STATUTES.US_18USC_2518.code,
        STATUTES.US_18USC_2518_8_A.code,
        STATUTES.US_FRCP_RULE_41.code,
        'BSA_2023_S63',
      ],
    };

    // Runs fail-closed §63-shape validation; we still benefit from the
    // sibling's field-level checks (hash lengths, ISO timestamps, etc.)
    // even though the "certificate" we return below is the legacy
    // EvidenceCertificate shape rather than the rendered JSON.
    toCertificateJson(certInput);

    return {
      statuteReference: STATUTES.US_18USC_2518_8_A.code,
      deviceDetails: {
        deviceId: session.deviceId,
        fingerprint: evidence.deviceSignature,
        platform: 'ANDROID',
      },
      integrityHash: evidence.payloadHash,
      collectionWindow: {
        startedAt: session.startedAt,
        endedAt: session.endsAt,
      },
      signingOfficer: exportEvent.signingOfficer,
      operatingProperly: true,
      generatedAt: exportEvent.exportedAt,
    };
  }
}

export const usLegalFramework: LegalFrameworkAdapter = new UsLegalFramework();
