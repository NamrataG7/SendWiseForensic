/**
 * Shared fixtures / helpers for the dummy-verification test suite.
 * Deterministic clocks so hashes and timestamps are reproducible.
 */

export const FIXED_NOW = new Date('2026-02-01T00:00:00.000Z');
export const fixedClock = () => FIXED_NOW;

export const FIXTURE_AADHAAR = '123456789012';
export const FIXTURE_NAME = 'Ravi Kumar';

export const FIXTURE_DOC_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf,
  0xd3, 0x0a,
]);
