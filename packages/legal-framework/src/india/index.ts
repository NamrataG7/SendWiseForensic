/**
 * India adapter for LegalFrameworkAdapter.
 *
 * Statutory basis is documented per method in inline comments and cited
 * via constants from ./statutes. See docs/LEGAL_FRAMEWORK_IN.md.
 *
 * This is a prototype skeleton — external integrations are stubbed with
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
import { STATUTES } from './statutes';
import {
  toCertificateJson,
  aggregatedRootHash,
  type CertificateInput,
} from '@sendwise-forensic/evidence-certificate';
import { DummyReviewCommitteeTokenSchema } from '@sendwise-forensic/dummy-verification';
import { randomUUID } from 'node:crypto';

// TODO(UIDAI-INTEGRATION) resolve the current Union/State Home Secretary set
// from an authoritative registry (e.g. eGazette + DoPT). For the prototype
// we return a static stub list so the allowlist logic can be exercised end-to-end.
const IN_COMPETENT_AUTHORITIES: CompetentAuthorities = {
  unionHomeSecretary: {
    officerId: 'IN-UNION-HS-STUB',
    name: 'STUB — Union Home Secretary',
  },
  stateHomeSecretaries: [
    { state: 'MH', officerId: 'IN-STATE-HS-MH-STUB', name: 'STUB — Maharashtra Home Secretary' },
    { state: 'KA', officerId: 'IN-STATE-HS-KA-STUB', name: 'STUB — Karnataka Home Secretary' },
    { state: 'DL', officerId: 'IN-STATE-HS-DL-STUB', name: 'STUB — Delhi Home Secretary' },
    // TODO(UIDAI-INTEGRATION) load the full 28+8 set from a notified registry.
  ],
};

function allCompetentAuthorityIds(ca: CompetentAuthorities): Set<string> {
  const ids = new Set<string>();
  if (ca.unionHomeSecretary) ids.add(ca.unionHomeSecretary.officerId);
  for (const s of ca.stateHomeSecretaries) ids.add(s.officerId);
  return ids;
}

export class IndiaLegalFramework implements LegalFrameworkAdapter {
  readonly jurisdiction = Jurisdiction.IN;

  getCompetentAuthorities(): CompetentAuthorities {
    return IN_COMPETENT_AUTHORITIES;
  }

  /**
   * IT Rules 2009 R.11: 60 days per order, 180 days total cap for §69.
   * BAIL / PROBATION / PLEA: duration lives in the court order text —
   * we return null to signal "defer to external order document".
   * CORPORATE / VOLUNTARY: revocable at will; no statutory cap.
   */
  computeMaxDuration(auth: Authorization): AuthorizationDurationBounds {
    switch (auth.type) {
      case AuthorizationType.JUDICIAL_WARRANT:
        return {
          perOrderDays: 60,
          totalCapDays: 180,
          revocable: true,
          statuteReferences: [STATUTES.IT_ACT_S69.code, STATUTES.IT_RULES_2009_R11.code],
          note: '60 days per order; 180 days cumulative cap (IT Rules 2009 R.11).',
        };
      case AuthorizationType.BAIL_CONDITION:
      case AuthorizationType.PROBATION_ORDER:
      case AuthorizationType.PLEA_AGREEMENT:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.BNSS_2023.code],
          // TODO(COURT-ORDER-PARSER) extract duration from the uploaded court order PDF.
          note: 'Duration is defined by the court order text — external parser required.',
        };
      case AuthorizationType.CORPORATE_INSIDER:
      case AuthorizationType.VOLUNTARY_VICTIM:
        return {
          perOrderDays: null,
          totalCapDays: null,
          revocable: true,
          statuteReferences: [STATUTES.DPDPA_2023_S17.code],
          note: 'Revocable consent-based authorization; no statutory duration cap.',
        };
    }
  }

  /**
   * Enforces the Puttaswamy (2017) four-prong proportionality checklist
   * on every authorization, plus additional JUDICIAL_WARRANT invariants
   * from ENTITY_MODEL.md §3 invariant #6:
   *   - signedOrderDocumentHash present
   *   - Review Committee approval object present
   *   - issuingAuthorityId ∈ getCompetentAuthorities() allowlist.
   */
  validateAuthorization(auth: Authorization): ValidationResult {
    const errors: string[] = [];

    const prongs = auth.proportionalityChecklist;
    if (!prongs.legality.justified) errors.push('proportionality.legality not justified (Puttaswamy prong 1)');
    if (!prongs.legitimateAim.justified) errors.push('proportionality.legitimateAim not justified (Puttaswamy prong 2)');
    if (!prongs.proportionality.justified) errors.push('proportionality.proportionality not justified (Puttaswamy prong 3)');
    if (!prongs.proceduralSafeguards.justified) errors.push('proportionality.proceduralSafeguards not justified (Puttaswamy prong 4)');

    if (auth.type === AuthorizationType.JUDICIAL_WARRANT) {
      if (!auth.signedOrderDocumentHash) {
        errors.push('signedOrderDocumentHash required for JUDICIAL_WARRANT (IT Act §69 + 2009 Rules R.3)');
      }
      if (!auth.reviewCommitteeApproval) {
        errors.push('reviewCommitteeApproval required for JUDICIAL_WARRANT (IT Rules 2009 R.22)');
      } else {
        // TODO(REVIEW-COMMITTEE-QUORUM) — for the prototype, the
        // reviewCommitteeApproval object must additionally carry a
        // @sendwise-forensic/dummy-verification DummyReviewCommitteeToken
        // (visibly stamped "DUMMY QUORUM — PROTOTYPE ONLY"). Once a real
        // quorum record is available this check is replaced with proper
        // credential verification. See docs/PROTOTYPE_NOTICE.md item 3.
        const dummy = DummyReviewCommitteeTokenSchema.safeParse(
          auth.reviewCommitteeApproval,
        );
        if (!dummy.success) {
          errors.push(
            'reviewCommitteeApproval must be a DummyReviewCommitteeToken from @sendwise-forensic/dummy-verification (IT Rules 2009 R.22; TODO(REVIEW-COMMITTEE-QUORUM))',
          );
        } else if (!dummy.data.quorumMet) {
          errors.push(
            'reviewCommitteeApproval.quorumMet is false — full Cabinet Secretary + Secretary Legal + Secretary Telecom quorum required (IT Rules 2009 R.22; TODO(REVIEW-COMMITTEE-QUORUM))',
          );
        }
      }
      const allowlist = allCompetentAuthorityIds(this.getCompetentAuthorities());
      if (!allowlist.has(auth.issuingAuthorityId)) {
        errors.push(
          `issuingAuthorityId '${auth.issuingAuthorityId}' not in Competent Authority allowlist (IT Rules 2009 R.3)`,
        );
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Privilege categories recognised in Indian law:
   *   LEGAL   — attorney-client (Bharatiya Sakshya Adhiniyam, advocate-client privilege; cf. old IEA §126)
   *   MEDICAL — doctor-patient duty of confidence (professional codes; case law)
   *   CLERGY  — priest-penitent (customary; cf. general privilege doctrine)
   *   SPOUSAL — spousal communications (BSA — cf. old IEA §122)
   * See docs/LEGAL_FRAMEWORK_IN.md §7 (privilege quarantine row).
   */
  getPrivilegeCategories(): PrivilegeCategory[] {
    return [
      PrivilegeCategory.LEGAL,
      PrivilegeCategory.MEDICAL,
      PrivilegeCategory.CLERGY,
      PrivilegeCategory.SPOUSAL,
    ];
  }

  /**
   * BSA §63 (2023) certificate — replaces old Evidence Act §65B.
   * Must identify record, device, manner of production, and state that
   * the device was operating properly.
   *
   * Delegates all field-level validation and canonical rendering to
   * `@sendwise-forensic/evidence-certificate.toCertificateJson`. That call
   * fails closed (throws CertificateValidationError) if any §63 required
   * field is missing, so this adapter method surfaces the same guarantee
   * to the forensic-console export flow. The return shape stays the
   * legacy `EvidenceCertificate` object for backwards compatibility with
   * existing consumers; the richer canonical JSON is available directly
   * from the new package for callers that want it.
   */
  generateEvidenceCertificate(
    evidence: Evidence,
    session: MonitoringSession,
    exportEvent: EvidenceExportEvent,
  ): EvidenceCertificate {
    // TODO(HARDWARE-KEYSTORE) surface hardware attestation in device.deviceFingerprint.
    // TODO(ESIGN-VERIFICATION) attach signer certificate + signature bytes.
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
          STATUTES.IT_ACT_S69.code,
          STATUTES.IT_RULES_2009_R3.code,
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
        // Map the jurisdiction-neutral DataCategory enum onto the
        // evidence-certificate DataCategory literal union. KEYSTROKE ->
        // KEYSTROKE_BATCH tracks the schemas.ts EvidenceSchema.category
        // vocabulary used elsewhere in the pipeline.
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
        'The device was operating properly during the relevant period; no known malfunction affected the electronic record identified above.',
      statuteReferences: [
        STATUTES.BSA_2023_S63.code,
        STATUTES.IT_ACT_S69.code,
      ],
    };

    // Fail-closed §63 validation happens here.
    const rendered = toCertificateJson(certInput);

    return {
      statuteReference: STATUTES.BSA_2023_S63.code,
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
   * IT Rules 2009 R.23: records to be destroyed within 6 months of cessation
   * of the interception/monitoring/decryption direction.
   */
  getPurgeSchedule(_auth: Authorization): PurgeSchedule {
    return {
      triggerEvent: 'AUTHORIZATION_CESSATION',
      retainForDays: 30 * 6,
      statuteReference: STATUTES.IT_RULES_2009_R23.code,
    };
  }
}

export const indiaLegalFramework: LegalFrameworkAdapter = new IndiaLegalFramework();
