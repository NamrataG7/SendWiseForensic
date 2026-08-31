/**
 * Node built-in test runner. Run with:
 *   node --test --experimental-strip-types src/__tests__/*.ts
 * See README.md for rationale (type-stripping over compile-to-dist).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toCertificateJson,
  canonicalStringify,
} from '../render-json.js';
import { CertificateValidationError } from '../types.js';
import { baseInput } from './_fixtures.js';

test('happy path: toCertificateJson returns a rendered §63 certificate', () => {
  const out = toCertificateJson(baseInput());
  assert.equal(out.schemaVersion, '1.0.0');
  assert.equal(out.certificateId, '11111111-2222-4333-8444-555555555555');
  assert.deepEqual(out.evidence.evidenceIds, ['EV-0001', 'EV-0002']);
  assert.equal(out.statuteReferences.includes('BSA_2023_S63'), true);
  // Roundtrip stable through canonicalStringify.
  const s1 = canonicalStringify(out);
  const s2 = canonicalStringify(JSON.parse(s1));
  assert.equal(s1, s2);
});

test('fail closed: missing deviceOperationalStatement cites BSA_2023_S63', () => {
  const bad = baseInput();
  bad.deviceOperationalStatement = '';
  try {
    toCertificateJson(bad);
    assert.fail('expected CertificateValidationError');
  } catch (err) {
    assert.ok(err instanceof CertificateValidationError);
    const paths = err.missingFields.map((m) => m.path);
    assert.ok(paths.includes('deviceOperationalStatement'));
    const missing = err.missingFields.find(
      (m) => m.path === 'deviceOperationalStatement',
    );
    assert.ok(missing);
    assert.equal(missing.statute, 'BSA_2023_S63');
    assert.equal(missing.clause, '63(d)');
  }
});

test('fail closed: missing evidence.hashes cites BSA §63', () => {
  const bad = baseInput();
  bad.evidence.hashes = [];
  try {
    toCertificateJson(bad);
    assert.fail('expected CertificateValidationError');
  } catch (err) {
    assert.ok(err instanceof CertificateValidationError);
    const paths = err.missingFields.map((m) => m.path);
    assert.ok(paths.includes('evidence.hashes'));
  }
});

test('deterministic key order: canonicalStringify matches known snapshot', () => {
  const out = toCertificateJson(baseInput());
  const canonical = canonicalStringify(out);
  const expected = JSON.stringify({
    authorizationRef: {
      expiresOn: '2026-03-10T00:00:00.000Z',
      issuedOn: '2026-01-10T00:00:00.000Z',
      statuteReferences: ['IT_ACT_S69', 'IT_RULES_2009_R3'],
      type: 'JUDICIAL_WARRANT',
      warrantId: 'WARR-2026-000042',
    },
    caseRef: 'FIR-MH-CYB-2026-000042',
    certificateId: '11111111-2222-4333-8444-555555555555',
    collection: {
      categories: ['KEYSTROKE_BATCH', 'APP_EVENT'],
      endedAt: '2026-01-14T23:59:59.000Z',
      sessionId: 'SESS-0001',
      startedAt: '2026-01-11T00:00:00.000Z',
    },
    device: {
      deviceFingerprint: 'deadbeefcafebabe',
      deviceId: 'DEV-ANDROID-0001',
      hardwareBackedPubKeyHex: 'aa11bb22cc33',
      model: 'Pixel 8',
      os: 'Android 15',
      platform: 'ANDROID',
    },
    deviceOperationalStatement:
      'I certify that the identified device was operating properly during the collection window and that no known malfunction affected the electronic records produced.',
    evidence: {
      aggregatedRootHash:
        'cab10ef54239867dcab10ef54239867dcab10ef54239867dcab10ef54239867d',
      evidenceIds: ['EV-0001', 'EV-0002'],
      hashes: [
        '991cc4ff722a55d880bb3ee611944c77faa2dd500833b66e991cc4ff722a55d8',
        'e2b15e4817b4ae7d1a04d3706a39d6c09f3c26f5928c5bf8e2b15e4817b4ae7d',
      ],
    },
    integrity: {
      chainVerified: true,
      chainVerifiedAt: '2026-01-15T09:29:50.000Z',
      verifierRef: 'AUDIT-VERIFIER-01',
    },
    issuedAt: '2026-01-15T09:30:00.000Z',
    issuedBy: {
      designation: 'Senior Inspector, Cyber Crime',
      name: 'Insp. Priya Sharma',
      officerId: 'OFF-IN-0001',
      organizationalUnit: 'Cyber Crime Cell, Mumbai Commissionerate',
    },
    remarks: '',
    schemaVersion: '1.0.0',
    statuteReferences: ['BSA_2023_S63', 'IT_ACT_S69', 'IT_RULES_2009_R3'],
  });
  assert.equal(canonical, expected);
});
