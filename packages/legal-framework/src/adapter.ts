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

export interface LegalFrameworkAdapter {
  readonly jurisdiction: Jurisdiction;

  validateAuthorization(auth: Authorization): ValidationResult;

  computeMaxDuration(auth: Authorization): AuthorizationDurationBounds;

  getCompetentAuthorities(): CompetentAuthorities;

  generateEvidenceCertificate(
    evidence: Evidence,
    session: MonitoringSession,
    exportEvent: EvidenceExportEvent,
  ): EvidenceCertificate;

  getPrivilegeCategories(): PrivilegeCategory[];

  getPurgeSchedule(auth: Authorization): PurgeSchedule;
}
