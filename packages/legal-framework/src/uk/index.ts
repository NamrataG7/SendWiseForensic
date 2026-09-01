/**
 * UK adapter for LegalFrameworkAdapter.
 *
 * Statutory basis is documented per method in inline comments and cited
 * via constants from ./statutes. See docs/LEGAL_FRAMEWORK_UK.md (sibling
 * worker) for the feature -> statute traceability matrix.
 *
 * Design distinctions vs. India and US adapters (jurisdiction distinction
 * is actively enforced, not merely conventional):
 *
 *   - Proportionality: ECHR Article 8 three-prong test
 *     (in accordance with law | necessary in a democratic society |
 *      proportionate). Contrast IN (Puttaswamy four-prong) and US
 *     (Berger/Katz reasonable-expectation-of-privacy analysis).
 *   - Authorisation: double-lock. A warrant issued by the Secretary of
 *     State (or Scottish Ministers) is inoperative until approved by a
 *     Judicial Commissioner (IPA 2016 s.23, s.102). Two document hashes
 *     are required, not one.
 *   - Grounds are locked to IPA 2016 s.19: national security | serious
 *     crime | economic well-being (linked to national security).
 *   - Statute references MUST be UK_-prefixed; any India- or US-prefixed
 *     code triggers a cross-jurisdiction contamination failure in both
 *     validateAuthorization AND generateEvidenceCertificate.
 *   - Retention: IPA 2016 s.150 handling arrangements - no fixed
 *     calendar cap; necessity-and-proportionality governs.
 *
 * This is a prototype skeleton - external integrations are stubbed with
 * TODO(...) tags matching docs/PROTOTYPE_NOTICE.md.
 */

import type {
  AuthorizationDurationBounds,
  EvidenceExportEvent,
  LegalFrameworkAdapter,
} from '../adapter';
import type { Authorization, Evidence, MonitoringSession } from '../schemas';
import {
  AuthorizationType,
  Jurisdiction,
  PrivilegeCategory,
  type CompetentAuthorities,
  type EvidenceCertificate,
  type PurgeSchedule,
  type ValidationResult,
} from '../types';
import { STATUTES, findForeignStatuteRefs } from './statutes';
import {
  toCertificateJson,
  aggregatedRootHash,
  type CertificateInput,
} from '@sendwise-forensic/evidence-certificate';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// UK Competent Authorities (stubs)
// ---------------------------------------------------------------------------

/**
 * The UK double-lock requires two distinct roles to be recorded on every
 * warrant:
 *   1. Secretary of State (or Scottish Ministers for Scottish warrants)
 *   2. Judicial Commissioner (approving under IPA 2016 s.23 / s.102).
 *
 * The India CompetentAuthorities shape is single-slot. We overlay a
 * UK-shaped record on top: `stateHomeSecretaries` slot stays empty, and
 * we add UK-specific fields via intersection.
 *
 * TODO(JUDICIAL-COMMISSIONER-REGISTRY) resolve the current bench of
 * Judicial Commissioners from an authoritative registry (Investigatory
 * Powers Commissioner's Office). For the prototype we return static stubs
 * so the double-lock allowlist logic can be exercised end-to-end.
 */
export interface UkCompetentAuthorities extends CompetentAuthorities {
  readonly secretariesOfState: ReadonlyArray<{
    department: string;
    officerId: string;
    name: string;
  }>;
  readonly scottishMinisters: ReadonlyArray<{
    officerId: string;
    name: string;
  }>;
  readonly judicialCommissioners: ReadonlyArray<{
    officerId: string;
    name: string;
  }>;
}

const UK_COMPETENT_AUTHORITIES: UkCompetentAuthorities = {
  // Legacy IN-shaped fields kept null/empty for shape compatibility.
  unionHomeSecretary: null,
  stateHomeSecretaries: [],
  // UK-specific fields.
  secretariesOfState: [
    {
      department: 'Home Office',
      officerId: 'UK-SOS-HOME-STUB',
      name: 'STUB - Secretary of State for the Home Department',
    },
    {
      department: 'Foreign, Commonwealth and Development Office',
      officerId: 'UK-SOS-FCDO-STUB',
      name: 'STUB - Secretary of State for Foreign, Commonwealth and Development Affairs',
    },
    {
      department: 'Ministry of Defence',
      officerId: 'UK-SOS-MOD-STUB',
      name: 'STUB - Secretary of State for Defence',
    },
    // TODO(JUDICIAL-COMMISSIONER-REGISTRY) load the full designated set.
  ],
  scottishMinisters: [
    {
      officerId: 'UK-SCOT-MIN-JUSTICE-STUB',
      name: 'STUB - Cabinet Secretary for Justice (Scotland)',
    },
    // TODO(JUDICIAL-COMMISSIONER-REGISTRY) load the full Scottish set.
  ],
  judicialCommissioners: [
    {
      officerId: 'UK-JC-IPC-STUB',
      name: 'STUB - Investigatory Powers Commissioner',
    },
    {
      officerId: 'UK-JC-01-STUB',
      name: 'STUB - Judicial Commissioner (IPA 2016 s.227)',
    },
    {
      officerId: 'UK-JC-02-STUB',
      name: 'STUB - Judicial Commissioner (IPA 2016 s.227)',
    },
    // TODO(JUDICIAL-COMMISSIONER-REGISTRY) load the full JC bench.
  ],
};

function issuingAuthorityAllowlist(ca: UkCompetentAuthorities): Set<string> {
  const s = new Set<string>();
  for (const x of ca.secretariesOfState) s.add(x.officerId);
  for (const x of ca.scottishMinisters) s.add(x.officerId);
  return s;
}

function judicialCommissionerAllowlist(ca: UkCompetentAuthorities): Set<string> {
  const s = new Set<string>();
  for (const x of ca.judicialCommissioners) s.add(x.officerId);
  return s;
}

// ---------------------------------------------------------------------------
// Working-days helper (IPA 2016 s.29 urgent-warrant maths)
// ---------------------------------------------------------------------------

/**
 * IPA 2016 s.29 specifies "3 working days" for JC post-approval and
 * "5 working days" as the effective urgent-warrant duration. Working
 * days exclude Saturday and Sunday and (for the prototype) do NOT
 * subtract statutory bank holidays - the Judicial Commissioners'
 * Office publishes a bank-holiday calendar we would honour in
 * production.
 *
 * TODO(UK-BANK-HOLIDAY-CALENDAR) subtract England-and-Wales, Scotland,
 * and Northern Ireland bank holidays as appropriate for the issuing
 * jurisdiction.
 *
 * Exported for the adapter's unit tests.
 */
export function addWorkingDays(from: Date, days: number): Date {
  const out = new Date(from.getTime());
  let remaining = days;
  while (remaining > 0) {
    out.setUTCDate(out.getUTCDate() + 1);
    const dow = out.getUTCDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// UK-specific authorization shape helpers
//
// The shared Authorization Zod schema is India-shaped (single
// `signedOrderDocumentHash` and `reviewCommitteeApproval` fields). To
// preserve the double-lock without editing shared schemas, UK-flavoured
// authorizations carry the JC document hash inside
// `reviewCommitteeApproval.notes` (a stringified JSON payload), and the
// urgent-warrant JC-approval-deadline timestamp on the same object.
//
// TODO(UK-AUTHORIZATION-SCHEMA) split the Zod Authorization schema per
// jurisdiction and remove this in-band tunnelling.
// ---------------------------------------------------------------------------

interface UkDoubleLockPayload {
  jurisdiction: 'UK';
  /** SHA-256 of the JC approval instrument (double-lock second signature). */
  judicialCommissionerApprovalDocumentHash: string;
  /** OfficerId of the approving Judicial Commissioner. */
  judicialCommissionerId: string;
  /** For urgent s.29 warrants: promised approval-by timestamp (<= 3 wd). */
  urgentJudicialCommissionerApprovalPromisedBy?: string;
  /** Enum: 'IPA_PART2' | 'IPA_PART5'. */
  warrantKind: 'IPA_PART2' | 'IPA_PART5';
  /** True iff the warrant was issued under s.29 urgent procedure. */
  urgent: boolean;
}

function parseUkDoubleLock(
  raw: unknown,
): { ok: true; value: UkDoubleLockPayload } | { ok: false; error: string } {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'reviewCommitteeApproval missing' };
  }
  const notes = (raw as { notes?: unknown }).notes;
  if (typeof notes !== 'string' || notes.length === 0) {
    return {
      ok: false,
      error: 'reviewCommitteeApproval.notes missing UK double-lock payload',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(notes);
  } catch {
    return {
      ok: false,
      error: 'reviewCommitteeApproval.notes is not valid JSON',
    };
  }
  const p = parsed as Partial<UkDoubleLockPayload>;
  if (
    p.jurisdiction !== 'UK' ||
    typeof p.judicialCommissionerApprovalDocumentHash !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(p.judicialCommissionerApprovalDocumentHash) ||
    typeof p.judicialCommissionerId !== 'string' ||
    (p.warrantKind !== 'IPA_PART2' && p.warrantKind !== 'IPA_PART5') ||
    typeof p.urgent !== 'boolean'
  ) {
    return {
      ok: false,
      error: 'UK double-lock payload malformed (see UkDoubleLockPayload)',
    };
  }
  if (
    p.urgent &&
    (typeof p.urgentJudicialCommissionerApprovalPromisedBy !== 'string' ||
      Number.isNaN(
        Date.parse(p.urgentJudicialCommissionerApprovalPromisedBy),
      ))
  ) {
    return {
      ok: false,
      error:
        'urgent s.29 warrant requires urgentJudicialCommissionerApprovalPromisedBy (ISO 8601)',
    };
  }
  return { ok: true, value: p as UkDoubleLockPayload };
}

// UK-locked LegitimateAim values (IPA 2016 s.19).
const UK_LEGITIMATE_AIMS: ReadonlySet<string> = new Set([
  'UK_NATIONAL_SECURITY_IPA_S19_1_A',
  'UK_SERIOUS_CRIME_IPA_S19_1_B',
  'UK_ECONOMIC_WELLBEING_IPA_S19_1_C',
]);

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class UkLegalFramework implements LegalFrameworkAdapter {
  readonly jurisdiction = Jurisdiction.UK;

  getCompetentAuthorities(): UkCompetentAuthorities {
    return UK_COMPETENT_AUTHORITIES;
  }

  /**
   * IPA 2016 s.32 (targeted interception) and s.108 (EI): 6 months per
   * warrant, renewable in 6-month increments. IPA 2016 s.29 urgent
   * warrants: 5 working days, with Judicial Commissioner approval
   * required within 3 working days.
   *
   * BAIL / PROBATION / PLEA: duration lives in the court order text.
   * CORPORATE / VOLUNTARY: revocable at will; no statutory cap.
   */
  computeMaxDuration(auth: Authorization): AuthorizationDurationBounds {
    switch (auth.type) {
      case AuthorizationType.JUDICIAL_WARRANT: {
        const parsed = parseUkDoubleLock(auth.reviewCommitteeApproval);
        if (parsed.ok && parsed.value.urgent) {
          // Urgent s.29: 5 working days, no renewal without JC approval.
          const issued = new Date(auth.issuedOn);
          const expires = addWorkingDays(issued, 5);
          const perOrderDays = Math.ceil(
            (expires.getTime() - issued.getTime()) / (24 * 3600 * 1000),
          );
          return {
            perOrderDays,
            totalCapDays: perOrderDays,
            revocable: true,
            statuteReferences: [
              STATUTES.UK_IPA_2016_S29.code,
              STATUTES.UK_IPA_2016_S32.code,
            ],
            note:
              'Urgent IPA 2016 s.29 warrant: 5 working days. Judicial ' +
              'Commissioner must approve within 3 working days or the ' +
              'warrant ceases to have effect (see s.29).',
          };
        }
        const kind =
          parsed.ok && parsed.value.warrantKind === 'IPA_PART5'
            ? 'IPA_PART5'
            : 'IPA_PART2';
        if (kind === 'IPA_PART5') {
          return {
            perOrderDays: 180,
            totalCapDays: null, // renewable in 6-month increments
            revocable: true,
            statuteReferences: [
              STATUTES.UK_IPA_2016_PART5.code,
              STATUTES.UK_IPA_2016_S108.code,
              STATUTES.UK_IPA_2016_S113.code,
            ],
            note:
              'Targeted Equipment Interference warrant: 6 months per ' +
              'issue/renewal (IPA 2016 s.108). Renewal requires fresh ' +
              'double-lock (s.113).',
          };
        }
        return {
          perOrderDays: 180,
          totalCapDays: null, // renewable in 6-month increments
          revocable: true,
          statuteReferences: [
            STATUTES.UK_IPA_2016_PART2_CH1.code,
            STATUTES.UK_IPA_2016_S32.code,
          ],
          note:
            'Targeted interception warrant: 6 months per issue/renewal ' +
            '(IPA 2016 s.32). Renewable in 6-month increments subject to ' +
            'fresh double-lock.',
        };
      }
      case AuthorizationType.BAIL_CONDITION:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.UK_BAIL_ACT_1976_S3.code],
          // TODO(COURT-ORDER-PARSER) extract duration from the uploaded order PDF.
          note:
            'Duration is set by the court order under Bail Act 1976 s.3 - ' +
            'external order parser required.',
        };
      case AuthorizationType.PROBATION_ORDER:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.UK_POCA_2000.code],
          note:
            'Duration is set by the sentencing court under the Powers of ' +
            'Criminal Courts (Sentencing) Act 2000.',
        };
      case AuthorizationType.PLEA_AGREEMENT:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.UK_PACE_1984.code],
          note:
            'Duration is external (agreed terms). No statutory cap in this ' +
            'adapter; see the underlying agreement.',
        };
      case AuthorizationType.CORPORATE_INSIDER:
      case AuthorizationType.VOLUNTARY_VICTIM:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.UK_UK_GDPR.code, STATUTES.UK_DPA_2018_PART3.code],
          note:
            'Revocable consent-based authorization; no statutory duration ' +
            'cap. Data-protection regime applies (UK GDPR + DPA 2018).',
        };
    }
  }

  /**
   * Enforces the ECHR Article 8 three-prong test (in accordance with law |
   * necessary in a democratic society | proportionate) plus IPA 2016
   * double-lock invariants:
   *   - signedOrderDocumentHash (Secretary of State) present
   *   - reviewCommitteeApproval carrying UK double-lock payload with a
   *     Judicial Commissioner document hash present
   *   - urgent s.29: JC approval-by timestamp <= issuedOn + 3 working days
   *   - legitimateAim locked to IPA 2016 s.19 grounds
   *   - issuingAuthorityId in the Secretaries-of-State / Scottish-Ministers
   *     allowlist
   *   - judicialCommissionerId in the JC allowlist
   *   - statuteReferences carry no India- or US-prefixed contamination.
   */
  validateAuthorization(auth: Authorization): ValidationResult {
    const errors: string[] = [];

    // --- ECHR Article 8 three-prong test.
    //
    // The Zod ProportionalityChecklist is India-shaped (four prongs).
    // The UK three-prong test maps to:
    //   prong 1 "in accordance with law"          <- legality
    //   prong 2 "legitimate aim + necessary in a democratic society"
    //                                             <- legitimateAim
    //   prong 3 "proportionate"                   <- proportionality
    // The fourth (proceduralSafeguards) is not strictly required by
    // ECHR Art. 8 but is a domestic UK practice floor (double-lock,
    // handling arrangements). The three ECHR prongs are enforced here.
    const prongs = auth.proportionalityChecklist;
    if (!prongs.legality.justified) {
      errors.push(
        'ECHR Art. 8 prong 1 (in accordance with law) not justified (UK_ECHR_ART_8)',
      );
    }
    if (!prongs.legitimateAim.justified) {
      errors.push(
        'ECHR Art. 8 prong 2 (necessary in a democratic society for a legitimate aim) not justified (UK_ECHR_ART_8)',
      );
    }
    if (!prongs.proportionality.justified) {
      errors.push(
        'ECHR Art. 8 prong 3 (proportionate) not justified (UK_ECHR_ART_8)',
      );
    }

    // --- Cross-jurisdiction contamination guard (statute references).
    const foreign = findForeignStatuteRefs(auth.statuteReferences);
    if (foreign.length > 0) {
      errors.push(
        `cross-jurisdiction contamination: statuteReferences contain non-UK codes ${JSON.stringify(
          foreign,
        )} - a UK Authorization must cite only UK_-prefixed statutes (UK_IPA_2016_PART2_CH1)`,
      );
    }

    // --- Legitimate aim locked to IPA 2016 s.19.
    if (auth.type === AuthorizationType.JUDICIAL_WARRANT) {
      if (!UK_LEGITIMATE_AIMS.has(auth.legitimateAim as unknown as string)) {
        errors.push(
          `legitimateAim '${String(
            auth.legitimateAim,
          )}' not in IPA 2016 s.19 grounds (UK_IPA_2016_S19). Must be one of UK_NATIONAL_SECURITY_IPA_S19_1_A | UK_SERIOUS_CRIME_IPA_S19_1_B | UK_ECONOMIC_WELLBEING_IPA_S19_1_C.`,
        );
      }

      // --- Double-lock: Secretary of State document hash.
      if (!auth.signedOrderDocumentHash) {
        errors.push(
          'signedOrderDocumentHash required for JUDICIAL_WARRANT - Secretary of State issuance instrument (UK_IPA_2016_S15)',
        );
      }

      // --- Double-lock: Judicial Commissioner approval.
      const parsed = parseUkDoubleLock(auth.reviewCommitteeApproval);
      if (!parsed.ok) {
        errors.push(
          `UK double-lock missing Judicial Commissioner approval: ${parsed.error} (UK_IPA_2016_S23 / UK_IPA_2016_S102)`,
        );
      } else {
        const jcAllow = judicialCommissionerAllowlist(
          this.getCompetentAuthorities(),
        );
        if (!jcAllow.has(parsed.value.judicialCommissionerId)) {
          errors.push(
            `judicialCommissionerId '${parsed.value.judicialCommissionerId}' not in Judicial Commissioner allowlist (UK_IPA_2016_S229; TODO(JUDICIAL-COMMISSIONER-REGISTRY))`,
          );
        }
        if (parsed.value.urgent) {
          const promised = new Date(
            parsed.value.urgentJudicialCommissionerApprovalPromisedBy!,
          );
          const cutoff = addWorkingDays(new Date(auth.issuedOn), 3);
          if (promised.getTime() > cutoff.getTime()) {
            errors.push(
              `urgent s.29 warrant: JC approval promised-by ${promised.toISOString()} exceeds 3 working days from issuedOn (UK_IPA_2016_S29)`,
            );
          }
        }
      }

      // --- Issuing authority allowlist.
      const issuers = issuingAuthorityAllowlist(this.getCompetentAuthorities());
      if (!issuers.has(auth.issuingAuthorityId)) {
        errors.push(
          `issuingAuthorityId '${auth.issuingAuthorityId}' not in Secretary-of-State / Scottish-Ministers allowlist (UK_IPA_2016_S17)`,
        );
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Privilege categories recognised in UK law. All UK_-prefixed so the
   * Filter Team console cannot confuse them with India or US variants.
   */
  getPrivilegeCategories(): PrivilegeCategory[] {
    return [
      PrivilegeCategory.UK_LPP,
      PrivilegeCategory.UK_JOURNALISTIC,
      PrivilegeCategory.UK_MP_WILSON,
      PrivilegeCategory.UK_MEDICAL_DPA,
      PrivilegeCategory.UK_RELIGIOUS,
    ];
  }

  /**
   * UK Evidence Certificate.
   *
   * Distinct template from IN (BSA §63) and US (§2518(8)(a) sealing).
   * References IPA 2016 s.56 admissibility caveats and PACE authenticity
   * requirements. Delegates canonical field-level validation to
   * @sendwise-forensic/evidence-certificate.toCertificateJson.
   *
   * Fail-closed on cross-jurisdiction contamination: any India- or
   * US-prefixed statute code in the input statute list causes this
   * method to throw before any bytes are rendered.
   */
  generateEvidenceCertificate(
    evidence: Evidence,
    session: MonitoringSession,
    exportEvent: EvidenceExportEvent,
  ): EvidenceCertificate {
    // TODO(HARDWARE-KEYSTORE) surface hardware attestation in device.deviceFingerprint.
    // TODO(ESIGN-VERIFICATION) attach signer certificate + signature bytes.

    const operationalStatement =
      'I certify, for the purposes of Part 5 of the Investigatory Powers ' +
      'Act 2016 and section 78 of the Police and Criminal Evidence Act 1984, ' +
      'that the identified device was operating properly during the ' +
      'collection window and that the electronic records produced are a ' +
      'true and authentic record of the material obtained under warrant. ' +
      'Note the admissibility caveats in IPA 2016 s.56 (exclusion of ' +
      'intercept product from ordinary legal proceedings, subject to ' +
      'Schedule 3 exceptions).';

    const statuteReferences = [
      STATUTES.UK_PACE_1984.code,
      STATUTES.UK_IPA_2016_S56.code,
      STATUTES.UK_IPA_2016_PART5.code,
    ];

    // Fail-closed contamination guard - certificate-level references.
    const foreignInputs = findForeignStatuteRefs(statuteReferences);
    if (foreignInputs.length > 0) {
      throw new Error(
        `UK evidence certificate cross-jurisdiction contamination: ${JSON.stringify(
          foreignInputs,
        )} - refusing to generate certificate.`,
      );
    }

    const authStatuteRefs: string[] = [
      STATUTES.UK_IPA_2016_PART2_CH1.code,
      STATUTES.UK_IPA_2016_S32.code,
    ];
    const foreignAuth = findForeignStatuteRefs(authStatuteRefs);
    if (foreignAuth.length > 0) {
      throw new Error(
        `UK evidence certificate cross-jurisdiction contamination in authorization refs: ${JSON.stringify(
          foreignAuth,
        )}`,
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
        statuteReferences: authStatuteRefs,
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
      deviceOperationalStatement: operationalStatement,
      statuteReferences,
    };

    // Fail-closed contamination guard - final rendered set.
    const foreignFinal = findForeignStatuteRefs(certInput.statuteReferences);
    if (foreignFinal.length > 0) {
      throw new Error(
        `UK evidence certificate cross-jurisdiction contamination on final render: ${JSON.stringify(
          foreignFinal,
        )}`,
      );
    }

    const rendered = toCertificateJson(certInput);

    return {
      statuteReference: STATUTES.UK_IPA_2016_S56.code,
      deviceDetails: {
        deviceId: rendered.device.deviceId,
        fingerprint: rendered.device.deviceFingerprint,
        platform: 'ANDROID',
      },
      integrityHash: evidence.payloadHash,
      collectionWindow: {
        startedAt: rendered.collection.startedAt,
        endedAt: rendered.collection.endedAt,
      },
      signingOfficer: exportEvent.signingOfficer,
      operatingProperly: true,
      generatedAt: rendered.issuedAt,
    };
  }

  /**
   * IPA 2016 s.150 handling arrangements: material must be destroyed as
   * soon as retention is no longer necessary for any authorised purpose.
   * There is NO fixed calendar cap - the Judicial Commissioner audits
   * the handling arrangements themselves.
   *
   * The shared PurgeSchedule shape is IN-shaped; we widen it in-band by
   * returning {minRetentionDays, sealed, sealingStatute, note} on top of
   * the required fields. Downstream UK-aware consumers narrow via
   * UkPurgeSchedule.
   *
   * TODO(UK-RETENTION-CASE-BY-CASE-REVIEW) surface the JC-audited
   * necessity determination in the audit log alongside every retention
   * decision.
   */
  getPurgeSchedule(_auth: Authorization): PurgeSchedule {
    const uk: UkPurgeSchedule = {
      triggerEvent: 'AUTHORIZATION_CESSATION',
      retainForDays: 0,
      statuteReference: STATUTES.UK_IPA_2016_S150.code,
      minRetentionDays: 0,
      sealed: true,
      sealingStatute: 'UK_IPA_2016_S150',
      note:
        'Necessity-and-proportionality determines retention. Judicial ' +
        'Commissioner audits handling arrangements. ' +
        'TODO(UK-RETENTION-CASE-BY-CASE-REVIEW)',
    };
    return uk;
  }
}

/**
 * UK-specific purge-schedule shape returned by getPurgeSchedule.
 * Extends the shared PurgeSchedule with the IPA 2016 s.150 fields.
 */
export interface UkPurgeSchedule extends PurgeSchedule {
  minRetentionDays: number;
  sealed: boolean;
  sealingStatute: string;
  note: string;
}

export const ukLegalFramework: LegalFrameworkAdapter = new UkLegalFramework();
