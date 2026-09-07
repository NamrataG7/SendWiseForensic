/**
 * LegalFrameworkAdapter — pluggable per-jurisdiction interface.
 *
 * Shape derived directly from docs/ENTITY_MODEL.md section 1:
 *   validateAuthorization, computeMaxDuration, getCompetentAuthorities,
 *   generateEvidenceCertificate, getPrivilegeCategories, getPurgeSchedule.
 *
 * One implementation per jurisdiction (see src/india for the India adapter).
 */

import type { Authorization, Evidence, MonitoringSession } from './schemas';
import type {
  CompetentAuthorities,
  EvidenceCertificate,
  Jurisdiction,
  PrivilegeCategory,
  PurgeSchedule,
  ValidationResult,
} from './types';

export interface EvidenceExportEvent {
  exportId: string;
  caseId: string;
  requestedBy: string;
  approvedBy: string[];
  purpose: 'COURT_SUBMISSION' | 'INTERNAL_REVIEW' | 'DEFENSE_DISCLOSURE';
  exportedAt: string;
  signingOfficer: {
    officerId: string;
    responsibleOfficialPosition: string;
  };
}

export interface AuthorizationDurationBounds {
  /** Maximum duration per single order, in days. `null` = statute silent / defer to order text. */
  perOrderDays: number | null;
  /** Maximum cumulative duration across extensions, in days. `null` = no statutory cap. */
  totalCapDays: number | null;
  /** Whether the authorization is revocable without duration cap. */
  revocable: boolean;
  statuteReferences: string[];
  note: string;
}

/**
 * Per-jurisdiction warrant-extension cap calculation. Used by
 * /api/authorizations/extensions and by the DB trigger enforcing that
 * an APPROVED extension cannot push the parent authorization's cumulative
 * duration beyond the statutory cap (e.g., IT Rules 2009 R.11's 180-day
 * cap for India §69 warrants).
 */
export interface CumulativeCapAssessment {
  /**
   * Days remaining under the statutory cap. `null` = no statutory cap (US
   * Title III renewals; UK IPA renewals are proportionality-bounded, not
   * hard-capped). Negative means the requested extension exceeds the cap.
   */
  remainingDays: number | null;
  /** Cumulative days already consumed by parent + approved extensions. */
  consumedDays: number;
  /** Statute references cited in any rejection. */
  statuteReferences: string[];
  /** Human-readable message for UI + audit. */
  note: string;
}

export interface LegalFrameworkAdapter {
  readonly jurisdiction: Jurisdiction;

  validateAuthorization(auth: Authorization): ValidationResult;

  computeMaxDuration(auth: Authorization): AuthorizationDurationBounds;

  /**
   * Given a parent authorization and its already-approved extension
   * durations (in days), compute the remaining days under the statutory
   * cap. Called at extension-request time and at extension-approval time.
   */
  computeCumulativeCapRemaining(
    parentAuth: Authorization,
    priorApprovedExtensionDurationsDays: number[],
  ): CumulativeCapAssessment;

  getCompetentAuthorities(): CompetentAuthorities;

  generateEvidenceCertificate(
    evidence: Evidence,
    session: MonitoringSession,
    exportEvent: EvidenceExportEvent,
  ): EvidenceCertificate;

  getPrivilegeCategories(): PrivilegeCategory[];

  getPurgeSchedule(auth: Authorization): PurgeSchedule;
}
