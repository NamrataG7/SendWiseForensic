/**
 * @sendwise-forensic/legal-framework — barrel export.
 */

export * from './types.js';
export * from './schemas.js';
export * from './adapter.js';
export { indiaLegalFramework, IndiaLegalFramework } from './india/index.js';
export { STATUTES as IN_STATUTES } from './india/statutes.js';
export type { StatuteCode as INStatuteCode, StatuteReference } from './india/statutes.js';

// US adapter (Title III / ECPA / SCA / 4th Amendment).
export {
  usLegalFramework,
  UsLegalFramework,
  findNonUsStatuteReferences,
} from './us/index.js';
export {
  STATUTES as US_STATUTES,
  NON_US_STATUTE_PREFIXES,
} from './us/statutes.js';
export type { StatuteCode as USStatuteCode } from './us/statutes.js';

import { Jurisdiction } from './types.js';
import type { LegalFrameworkAdapter } from './adapter.js';
import { IndiaLegalFramework as _IndiaLegalFramework } from './india/index.js';
import { UsLegalFramework as _UsLegalFramework } from './us/index.js';

/**
 * Thrown when a caller requests an adapter for a jurisdiction that has
 * not been implemented / registered. Never silently fall through to
 * another jurisdiction's adapter — mixing law across jurisdictions is
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
 * Per-jurisdiction adapter registry. Sibling worker will add UK.
 */
export const AdapterRegistry = {
  [Jurisdiction.IN]: new _IndiaLegalFramework(),
  [Jurisdiction.US]: new _UsLegalFramework(),
  // TODO(UK-ADAPTER) — pending sibling PR.
} as const satisfies Partial<Record<Jurisdiction, LegalFrameworkAdapter>>;

export function adapterFor(j: Jurisdiction): LegalFrameworkAdapter {
  const a = (AdapterRegistry as Partial<Record<Jurisdiction, LegalFrameworkAdapter>>)[j];
  if (!a) {
    throw new JurisdictionNotSupportedError(String(j));
  }
  return a;
}
