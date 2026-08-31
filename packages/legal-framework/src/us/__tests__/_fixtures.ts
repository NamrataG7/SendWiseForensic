/**
 * Shared US-adapter test fixtures.
 *
 * Builds a valid Authorization object per packages/legal-framework/src/schemas.ts.
 * Berger particularity criteria and §2518(1)(b) markers are embedded in
 * the proportionality-checklist notes (that's how the US adapter looks
 * for them without needing to grow US-specific fields on the shared
 * Authorization schema).
 */

import {
  AuthorizationStatus,
  AuthorizationType,
  DataCategory,
  LegitimateAimIN,
} from '../../types.js';
import type { Authorization } from '../../schemas.js';

const HEX64 =
  'a'.repeat(64);

export interface BuildAuthOptions {
  statuteReferences?: string[];
  issuingAuthorityId?: string;
  includeBergerAll?: boolean;
  include2518_1_b?: boolean;
  signedOrderDocumentHash?: string | null;
  type?: AuthorizationType;
}

export function buildUsJudicialWarrant(
  opts: BuildAuthOptions = {},
): Authorization {
  const bergerNote = opts.includeBergerAll === false
    ? 'no particularity recorded'
    : 'US_BERGER_PARTICULAR_OFFENSE US_BERGER_PARTICULAR_FACILITIES ' +
      'US_BERGER_PARTICULAR_COMMUNICATION_TYPE US_BERGER_PARTICULAR_PERSONS ' +
      '(4th Amendment particularity satisfied)';

  const s2518Note = opts.include2518_1_b === false
    ? 'no §2518 attestation'
    : 'Application per US_18USC_2518_1_B: probable cause, particular ' +
      'offense, particular facilities, particular type of communication, ' +
      'identity of person committing offense.';

  return {
    id: 'AUTH-US-0001',
    caseId: 'CASE-US-0001',
    subjectId: 'SUBJ-US-0001',
    type: opts.type ?? AuthorizationType.JUDICIAL_WARRANT,
    // NOTE: LegitimateAim currently expects a LegitimateAimIN value (the
    // shared Authorization schema was written India-first). We use an
    // India label here purely to satisfy Zod on the SHARED schema —
    // the US adapter's validateAuthorization does NOT read this field
    // as a Puttaswamy prong. A follow-up will make LegitimateAim
    // jurisdiction-tagged at the schema layer as well.
    legitimateAim: LegitimateAimIN.PUBLIC_ORDER,
    issuingAuthorityId: opts.issuingAuthorityId ?? 'US-DCJ-STUB-0001',
    issuedOn: '2026-01-10T00:00:00.000Z',
    expiresOn: '2026-02-09T00:00:00.000Z',
    scope: {
      dataCategories: [DataCategory.KEYSTROKE, DataCategory.COMMS_METADATA],
      devices: ['DEV-US-0001'],
    },
    proportionalityChecklist: {
      legality: { justified: true, note: bergerNote },
      legitimateAim: { justified: true, note: s2518Note },
      proportionality: {
        justified: true,
        note: 'Least intrusive means; minimization procedures per §2518(5).',
      },
      proceduralSafeguards: {
        justified: true,
        note: 'Judicial supervision + §2518(8)(d) 90-day inventory notice.',
      },
    },
    reviewCommitteeApproval: null,
    statuteReferences:
      opts.statuteReferences ?? [
        'US_TITLE_III_1968',
        'US_18USC_2518',
        'US_CONST_4TH_AMENDMENT',
      ],
    signedOrderDocumentHash:
      opts.signedOrderDocumentHash === undefined
        ? HEX64
        : opts.signedOrderDocumentHash,
    signedOrderDocumentRef: 'stub://us-warrant/AUTH-US-0001.pdf',
    dpdpaExemptionRef: null,
    status: AuthorizationStatus.PENDING_REVIEW,
    revocationLog: [],
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
  };
}
