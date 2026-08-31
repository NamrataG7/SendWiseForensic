/**
 * @deprecated Legacy from SendWise (parental-dashboard). Retained only to keep
 * the fork history bisectable. All new code MUST import from
 * `@/lib/forensic-store` and `@/lib/entities` instead.
 *
 * A later lane (see ENTITY_MODEL delivery order) will delete this file once
 * no imports remain. Do NOT extend it.
 *
 * TODO(WIRE-TO-SCHEMA): delete after audit-chain and warrant-gated ingest land.
 */

// Intentionally no runtime exports. Any parental read/write path that used to
// live here has been superseded by lib/forensic-store.ts. Attempting to import
// the old function names will fail loudly at build time — that is intended.

export {};
