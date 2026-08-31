/**
 * Thin wrapper over @sendwise-forensic/legal-framework so route handlers
 * and lib/authz do not import the barrel directly.
 *
 * Selection is ALWAYS by DB-recorded Case.jurisdiction; the console never
 * hands the officer a jurisdiction dropdown at authorization time.
 */

import {
  adapterFor as _adapterFor,
  JurisdictionNotSupportedError,
  Jurisdiction as LFJurisdiction,
} from '@sendwise-forensic/legal-framework';
import type { LegalFrameworkAdapter } from '@sendwise-forensic/legal-framework';
import type { Jurisdiction } from '@/lib/entities';

export { JurisdictionNotSupportedError };

/**
 * Resolve the adapter for a UI-shaped Jurisdiction string.
 * Throws JurisdictionNotSupportedError if none is registered — never
 * silently falls through to another jurisdiction's adapter.
 */
export function getAdapterFor(j: Jurisdiction): LegalFrameworkAdapter {
  const key = LFJurisdiction[j];
  if (!key) throw new JurisdictionNotSupportedError(String(j));
  return _adapterFor(key);
}
