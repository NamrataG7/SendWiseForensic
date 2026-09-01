/**
 * UK adapter tests. Run with:
 *   node --test --experimental-strip-types packages/legal-framework/src/uk/__tests__/*.test.ts
 *
 * Verifies:
 *   - ECHR Art. 8 three-prong happy path + double-lock
 *   - Missing Judicial Commissioner approval -> violation
 *   - Cross-jurisdiction contamination (IN prefix) -> violation
 *   - Cross-jurisdiction contamination (US prefix) -> violation
 *   - computeMaxDuration standard JUDICIAL_WARRANT -> 180 days
 *   - computeMaxDuration urgent s.29 -> 5 working days (working-day helper)
 *   - generateEvidenceCertificate contamination guard
 *   - purge schedule shape (s.150)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  UkLegalFramework,
  addWorkingDays,
  type UkPurgeSchedule,
} from '../index';
import {
  AuthorizationStatus,
  AuthorizationType,
  DataCategory,
  Jurisdiction,
} from '../../types.js';
import type { Authorization, Evidence, MonitoringSession } from '../../schemas.js';
import type { EvidenceExportEvent } from '../../adapter.js';

// A 64-hex SHA-256 stand-in.
const H = (seed: string): string => {
  const hex = 'abcdef0123456789';
  let out = '';
  let i = 0;
  while (out.length < 64) {
    out += hex[(seed.charCodeAt(i % seed.length) + i) % 16];
    i++;
  }
  return out;
};

function ukDoubleLockNotes(opts: {
  urgent?: boolean;
  warrantKind?: 'IPA_PART2' | 'IPA_PART5';
  jcId?: string;
  jcDocHash?: string;
  urgentPromisedBy?: string;
}): string {
  return JSON.stringify({
    jurisdiction: 'UK',
    judicialCommissionerApprovalDocumentHash:
      opts.jcDocHash ?? H('jc-approval-doc'),
    judicialCommissionerId: opts.jcId ?? 'UK-JC-IPC-STUB',
    warrantKind: opts.warrantKind ?? 'IPA_PART2',
    urgent: opts.urgent ?? false,
    ...(opts.urgent
      ? {
          urgentJudicialCommissionerApprovalPromisedBy:
            opts.urgentPromisedBy ?? '2026-01-13T09:00:00.000Z',
        }
      : {}),
  });
}

function baseUkWarrant(
  overrides: Partial<Authorization> = {},
): Authorization {
  const auth: Authorization = {
    id: 'AUTH-UK-0001',
    caseId: 'CASE-UK-0001',
    subjectId: 'SUBJ-UK-0001',
    type: AuthorizationType.JUDICIAL_WARRANT,
    // Cast: shared Zod enum is IN-locked; UK adapter treats it as a string.
    legitimateAim:
      'UK_SERIOUS_CRIME_IPA_S19_1_B' as unknown as Authorization['legitimateAim'],
    issuingAuthorityId: 'UK-SOS-HOME-STUB',
    issuedOn: '2026-01-12T10:00:00.000Z', // Monday
    expiresOn: '2026-07-12T10:00:00.000Z',
    scope: {
      dataCategories: [DataCategory.KEYSTROKE],
      devices: ['DEV-UK-0001'],
    },
    proportionalityChecklist: {
      legality: { justified: true, note: 'IPA 2016 s.15 + s.19' },
      legitimateAim: {
        justified: true,
        note: 'Serious crime (IPA 2016 s.19(1)(b))',
      },
      proportionality: {
        justified: true,
        note: 'Least intrusive - targeted per-device supervision',
      },
      proceduralSafeguards: {
        justified: true,
        note: 'Double-lock + IPC oversight',
      },
    },
    reviewCommitteeApproval: {
      approvers: ['UK-JC-IPC-STUB'],
      approvedAt: '2026-01-12T14:00:00.000Z',
      notes: ukDoubleLockNotes({}),
    },
    statuteReferences: [
      'UK_IPA_2016_PART2_CH1',
      'UK_IPA_2016_S15',
      'UK_IPA_2016_S19',
      'UK_IPA_2016_S23',
      'UK_ECHR_ART_8',
    ],
    signedOrderDocumentHash: H('sos-order'),
    signedOrderDocumentRef: 'sos-order-ref-0001',
    dpdpaExemptionRef: null,
    status: AuthorizationStatus.ACTIVE,
    revocationLog: [],
    createdAt: '2026-01-12T09:00:00.000Z',
    updatedAt: '2026-01-12T14:00:00.000Z',
    ...overrides,
  };
  return auth;
}

// ---------------------------------------------------------------------------

test('adapter identifies as UK jurisdiction', () => {
  const uk = new UkLegalFramework();
  assert.equal(uk.jurisdiction, Jurisdiction.UK);
});

test('validateAuthorization: happy path (ECHR three-prong + s.19 + double-lock)', () => {
  const uk = new UkLegalFramework();
  const result = uk.validateAuthorization(baseUkWarrant());
  assert.deepEqual(result.errors, [], JSON.stringify(result.errors));
  assert.equal(result.ok, true);
});

test('validateAuthorization: missing Judicial Commissioner approval -> violation', () => {
  const uk = new UkLegalFramework();
  const auth = baseUkWarrant({ reviewCommitteeApproval: null });
  const result = uk.validateAuthorization(auth);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (e) => /double-lock/i.test(e) && /Judicial Commissioner/i.test(e),
    ),
    `expected JC-missing error, got: ${JSON.stringify(result.errors)}`,
  );
});

test('validateAuthorization: cross-jurisdiction contamination (IN prefix IT_ACT_S69)', () => {
  const uk = new UkLegalFramework();
  const auth = baseUkWarrant({
    statuteReferences: ['UK_IPA_2016_PART2_CH1', 'IT_ACT_S69'],
  });
  const result = uk.validateAuthorization(auth);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (e) => /contamination/i.test(e) && e.includes('IT_ACT_S69'),
    ),
    `expected IN-contamination error, got: ${JSON.stringify(result.errors)}`,
  );
});

test('validateAuthorization: cross-jurisdiction contamination (US prefix US_18USC_2518)', () => {
  const uk = new UkLegalFramework();
  const auth = baseUkWarrant({
    statuteReferences: ['UK_IPA_2016_PART2_CH1', 'US_18USC_2518'],
  });
  const result = uk.validateAuthorization(auth);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (e) => /contamination/i.test(e) && e.includes('US_18USC_2518'),
    ),
    `expected US-contamination error, got: ${JSON.stringify(result.errors)}`,
  );
});

test('validateAuthorization: non-s.19 legitimateAim rejected', () => {
  const uk = new UkLegalFramework();
  const auth = baseUkWarrant({
    legitimateAim: 'PUBLIC_ORDER' as unknown as Authorization['legitimateAim'],
  });
  const result = uk.validateAuthorization(auth);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => /IPA 2016 s\.19/i.test(e)),
    `expected s.19-grounds error, got: ${JSON.stringify(result.errors)}`,
  );
});

test('computeMaxDuration: standard JUDICIAL_WARRANT -> 180 days (6 months, IPA s.32)', () => {
  const uk = new UkLegalFramework();
  const bounds = uk.computeMaxDuration(baseUkWarrant());
  assert.equal(bounds.perOrderDays, 180);
  assert.ok(bounds.statuteReferences.includes('UK_IPA_2016_S32'));
});

test('computeMaxDuration: urgent s.29 -> 5 working days', () => {
  const uk = new UkLegalFramework();
  // 2026-01-12 is a Monday. 5 working days -> Monday 2026-01-19.
  const auth = baseUkWarrant({
    reviewCommitteeApproval: {
      approvers: ['UK-JC-IPC-STUB'],
      approvedAt: '2026-01-12T14:00:00.000Z',
      notes: ukDoubleLockNotes({ urgent: true }),
    },
  });
  const bounds = uk.computeMaxDuration(auth);
  // Mon -> next Mon = 7 calendar days; perOrderDays should be 7.
  assert.equal(bounds.perOrderDays, 7, 'Mon + 5 working days = next Mon (7 cal days)');
  assert.ok(bounds.statuteReferences.includes('UK_IPA_2016_S29'));
  assert.match(bounds.note, /5 working days/);
});

test('addWorkingDays helper: Fri + 5 = next Fri (skips weekend)', () => {
  // 2026-01-16 is a Friday.
  const fri = new Date('2026-01-16T00:00:00.000Z');
  const plus5 = addWorkingDays(fri, 5);
  // Fri -> Mon(1) Tue(2) Wed(3) Thu(4) Fri(5) = 2026-01-23 (Friday).
  assert.equal(plus5.toISOString().slice(0, 10), '2026-01-23');
  const plus3 = addWorkingDays(fri, 3);
  // Fri -> Mon Tue Wed = 2026-01-21 (Wednesday).
  assert.equal(plus3.toISOString().slice(0, 10), '2026-01-21');
});

test('validateAuthorization: urgent s.29 with JC promise > 3 wd -> violation', () => {
  const uk = new UkLegalFramework();
  const auth = baseUkWarrant({
    // issuedOn 2026-01-12 (Mon); 3 wd -> Thu 2026-01-15. Promise 2026-01-19 exceeds.
    reviewCommitteeApproval: {
      approvers: ['UK-JC-IPC-STUB'],
      approvedAt: '2026-01-12T14:00:00.000Z',
      notes: ukDoubleLockNotes({
        urgent: true,
        urgentPromisedBy: '2026-01-19T09:00:00.000Z',
      }),
    },
  });
  const result = uk.validateAuthorization(auth);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => /s\.29/i.test(e) && /3 working days/i.test(e)),
    `expected s.29 promise-by error, got: ${JSON.stringify(result.errors)}`,
  );
});

test('getPurgeSchedule: s.150 shape (minRetentionDays 0, sealed, sealingStatute)', () => {
  const uk = new UkLegalFramework();
  const schedule = uk.getPurgeSchedule(baseUkWarrant()) as UkPurgeSchedule;
  assert.equal(schedule.minRetentionDays, 0);
  assert.equal(schedule.sealed, true);
  assert.equal(schedule.sealingStatute, 'UK_IPA_2016_S150');
  assert.equal(schedule.statuteReference, 'UK_IPA_2016_S150');
  assert.match(schedule.note, /TODO\(UK-RETENTION-CASE-BY-CASE-REVIEW\)/);
});

test('getPrivilegeCategories: only UK_-prefixed values', () => {
  const uk = new UkLegalFramework();
  const cats = uk.getPrivilegeCategories();
  assert.ok(cats.length >= 5);
  for (const c of cats) {
    assert.match(String(c), /^UK_/, `non-UK-prefixed category leaked: ${c}`);
  }
});

test('generateEvidenceCertificate: happy path renders with UK statutes only', () => {
  const uk = new UkLegalFramework();
  const evidence: Evidence = {
    id: 'EV-UK-0001',
    sessionId: 'SESS-UK-0001',
    category: 'KEYSTROKE_BATCH',
    capturedAt: '2026-01-13T10:00:00.000Z',
    payloadHash: H('payload'),
    payloadRef: 'blob://uk/ev-0001',
    deviceSignature: 'uk-device-sig-0001',
    prevEvidenceHash: null,
    privilegeFlag: 'NONE',
    quarantineStatus: null,
    redactionsApplied: [],
    createdAt: '2026-01-13T10:00:00.000Z',
  };
  const session: MonitoringSession = {
    id: 'SESS-UK-0001',
    authorizationId: 'AUTH-UK-0001',
    deviceId: 'DEV-UK-0001',
    startedAt: '2026-01-12T10:00:00.000Z',
    endsAt: '2026-01-15T10:00:00.000Z',
    collectedCategories: [DataCategory.KEYSTROKE],
    autoTerminationTriggers: {
      onExpiry: true,
      onRevocation: true,
      onTamper: true,
    },
    status: 'ACTIVE',
  };
  const exportEvent: EvidenceExportEvent = {
    exportId: 'EXP-UK-0001',
    caseId: 'CASE-UK-0001',
    requestedBy: 'OFF-UK-0001',
    approvedBy: ['OFF-UK-0002', 'OFF-UK-0003'],
    purpose: 'COURT_SUBMISSION',
    exportedAt: '2026-01-15T12:00:00.000Z',
    signingOfficer: {
      officerId: 'OFF-UK-0001',
      responsibleOfficialPosition: 'Detective Inspector, SO15',
    },
  };
  const cert = uk.generateEvidenceCertificate(evidence, session, exportEvent);
  assert.equal(cert.statuteReference, 'UK_IPA_2016_S56');
  assert.equal(cert.operatingProperly, true);
  assert.equal(cert.deviceDetails.platform, 'ANDROID');
});

test('contamination guard function rejects US and IN prefixes', async () => {
  const { findForeignStatuteRefs } = await import('../statutes.js');
  assert.deepEqual(findForeignStatuteRefs(['UK_IPA_2016_S56']), []);
  assert.deepEqual(
    findForeignStatuteRefs(['IT_ACT_S69', 'UK_IPA_2016_S56']),
    ['IT_ACT_S69'],
  );
  assert.deepEqual(
    findForeignStatuteRefs(['US_18USC_2518', 'UK_IPA_2016_S56']),
    ['US_18USC_2518'],
  );
  assert.deepEqual(
    findForeignStatuteRefs(['BSA_2023_S63', 'US_TITLE_III_2510']),
    ['BSA_2023_S63', 'US_TITLE_III_2510'],
  );
});
