/**
 * @sendwise-forensic/legal-framework - barrel export.
 */

import type { LegalFrameworkAdapter } from './adapter';
import { Jurisdiction } from './types';
import { IndiaLegalFramework, indiaLegalFramework } from './india/index';
import { UsLegalFramework, usLegalFramework } from './us/index';
import { UkLegalFramework, ukLegalFramework } from './uk/index';

export * from './types';
export * from './schemas';
export * from './adapter';

// --- IN ---
export { indiaLegalFramework, IndiaLegalFramework } from './india/index';
export { STATUTES as IN_STATUTES } from './india/statutes';
export type { StatuteCode as INStatuteCode, StatuteReference } from './india/statutes';
// --- end IN ---

// --- US (Title III / ECPA / SCA / 4th Amendment) ---
export {
  usLegalFramework,
  UsLegalFramework,
  findNonUsStatuteReferences,
} from './us/index';
export {
  STATUTES as US_STATUTES,
  NON_US_STATUTE_PREFIXES,
} from './us/statutes';
export type { StatuteCode as USStatuteCode } from './us/statutes';
// --- end US ---

// --- UK (IPA 2016 + ECHR Art. 8) ---
export { ukLegalFramework, UkLegalFramework } from './uk/index';
export type {
  UkCompetentAuthorities,
  UkPurgeSchedule,
} from './uk/index';
export { STATUTES as UK_STATUTES } from './uk/statutes';
export type { StatuteCode as UKStatuteCode } from './uk/statutes';
// --- end UK ---

/**
 * Thrown when a caller requests an adapter for a jurisdiction that has
 * not been implemented / registered. Never silently fall through to
 * another jurisdiction's adapter - mixing law across jurisdictions is
 * the exact class of bug we are engineering against.
 */
export class JurisdictionNotSupportedError extends Error {
  readonly jurisdiction: string;
  constructor(jurisdiction: string) {
    super(
      `No LegalFrameworkAdapter registered for jurisdiction '${jurisdiction}'. ` +
        `Registered: ${Object.keys(AdapterRegistry).join(', ')}.`,
    );
    this.name = 'JurisdictionNotSupportedError';
    this.jurisdiction = jurisdiction;
  }
}

/**
 * Per-jurisdiction adapter registry. Selection is by DB-recorded
 * Case.jurisdiction, never by user pick. Cross-jurisdiction contamination
 * is refused at both validation and certificate-generation time inside
 * each adapter.
 */
export const AdapterRegistry: Readonly<
  Partial<Record<Jurisdiction, LegalFrameworkAdapter>>
> = {
  [Jurisdiction.IN]: indiaLegalFramework,
  [Jurisdiction.US]: usLegalFramework,
  [Jurisdiction.UK]: ukLegalFramework,
};
void IndiaLegalFramework;
void UsLegalFramework;
void UkLegalFramework;

/**
 * Resolve the adapter for a jurisdiction. Throws
 * `JurisdictionNotSupportedError` rather than falling through to another
 * jurisdiction. `adapterFor` and `getAdapter` are aliases.
 */
export function adapterFor(j: Jurisdiction): LegalFrameworkAdapter {
  const a = AdapterRegistry[j];
  if (!a) throw new JurisdictionNotSupportedError(String(j));
  return a;
}
export const getAdapter = adapterFor;
