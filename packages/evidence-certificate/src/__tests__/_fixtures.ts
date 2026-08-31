/**
 * Shared fixture builder for the evidence-certificate tests. Kept in a
 * plain .ts helper (no default export magic) so node --test can pick it
 * up when we just import from it.
 */

import type { CertificateInput } from '../types.js';

// 64-hex SHA-256 stand-ins. Deliberately deterministic, not real digests.
const H = (seed: string): string => {
  // Repeat the seed until we have 64 hex chars.
  const hex = 'abcdef0123456789';
  let out = '';
  let i = 0;
  while (out.length < 64) {
    out += hex[(seed.charCodeAt(i % seed.length) + i) % 16];
    i++;
  }
  return out;
};

export function baseInput(): CertificateInput {
  return {
    certificateId: '11111111-2222-4333-8444-555555555555',
    issuedAt: '2026-01-15T09:30:00.000Z',
    issuedBy: {
      officerId: 'OFF-IN-0001',
      name: 'Insp. Priya Sharma',
      designation: 'Senior Inspector, Cyber Crime',
      organizationalUnit: 'Cyber Crime Cell, Mumbai Commissionerate',
    },
    caseRef: 'FIR-MH-CYB-2026-000042',
    authorizationRef: {
      warrantId: 'WARR-2026-000042',
      type: 'JUDICIAL_WARRANT',
      issuedOn: '2026-01-10T00:00:00.000Z',
      expiresOn: '2026-03-10T00:00:00.000Z',
      statuteReferences: ['IT_ACT_S69', 'IT_RULES_2009_R3'],
    },
    device: {
      deviceId: 'DEV-ANDROID-0001',
      platform: 'ANDROID',
      model: 'Pixel 8',
      os: 'Android 15',
      deviceFingerprint: 'deadbeefcafebabe',
      hardwareBackedPubKeyHex: 'aa11bb22cc33',
    },
    collection: {
      startedAt: '2026-01-11T00:00:00.000Z',
      endedAt: '2026-01-14T23:59:59.000Z',
      sessionId: 'SESS-0001',
      categories: ['KEYSTROKE_BATCH', 'APP_EVENT'],
    },
    evidence: {
      evidenceIds: ['EV-0001', 'EV-0002'],
      hashes: [H('one'), H('two')],
      aggregatedRootHash: H('root'),
    },
    integrity: {
      chainVerified: true,
      chainVerifiedAt: '2026-01-15T09:29:50.000Z',
      verifierRef: 'AUDIT-VERIFIER-01',
    },
    deviceOperationalStatement:
      'I certify that the identified device was operating properly during the collection window and that no known malfunction affected the electronic records produced.',
    statuteReferences: ['BSA_2023_S63', 'IT_ACT_S69', 'IT_RULES_2009_R3'],
  };
}
