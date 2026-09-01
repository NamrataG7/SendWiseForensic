# Design: Retention & Sealing Lifecycle

## Problem
Cron flips `EXPIRED` but "sealed" is undefined. IN R.23: purge 6mo post-cessation. US §2518(8)(a): sealed by court, 10-yr floor. UK IPA §§150–152: proportionate-necessity, IPC audits.

## Lifecycle
`ACTIVE → EXPIRED/REVOKED → COOLDOWN → SEALED → PURGED`

Per authorization:
- **COOLDOWN**: evidence stays queryable by case-officers only; new export requests blocked.
  - IN: 30d (2009 Rules practice)
  - US: 90d (aligned with §2518(8)(d) inventory notice window)
  - UK: 30d
- **SEALED**: raw payloads moved to cold storage; read requires an `unsealing_order`.
- **PURGED**: raw payloads destroyed; only metadata + BSA §63 certificates + hash chain retained.
  - IN: at 180d post-cessation (R.23) unless "functional requirement" flag set.
  - US: 10y minimum then court-directed.
  - UK: on necessity-review by IPC; no fixed date.

## Sealing = technical definition
- Raw payload row moved to `sealed_evidence` (append-only, encrypted at rest with a jurisdiction-scoped key held by the DB).
- Sealed key wrapped by **two officer keys** (dual control) + one judicial oversight key.
- To unseal: `unsealing_order` row with all three keyholder signatures + reason + statute cite; verified by trigger before decryption is allowed.
- Every unsealing is a first-class audit event.

## New entities
```
sealed_evidence         (evidence_id PK, sealed_at, wrapped_key_bytes, algorithm)
unsealing_order         (id, authorization_id, reason, statute_ref, approvals JSONB[], granted, granted_at)
retention_schedule      (authorization_id, cooldown_ends_at, seal_at, purge_at) — derived from adapter.getPurgeSchedule
```

## Cron jobs
- `advance_retention_lifecycle()` nightly:
  - `EXPIRED/REVOKED` past cooldown → SEALED (move payloads).
  - `SEALED` past purge → PURGED (delete payloads, keep certificate + hash chain).
- Every transition writes to `audit_log`.

## Adapter method (extend)
```ts
getRetentionSchedule(auth): {
  cooldownDays, sealDays, purgeDays | null, sealingStatute, purgeStatute
}
```
IN: {30, 30, 180, IT_RULES_2009_R23, IT_RULES_2009_R23}
US: {90, 90, 3650, US_18USC_2518_8_A, null}  // null = judicial order
UK: {30, 30, null, UK_IPA_2016_S150, UK_IPA_2016_S152}  // null = IPC-driven

## Reuse
- Reuses `getPurgeSchedule` shape from adapter.
- Reuses `p_append_audit`.
- Reuses cron pattern from `expire_authorizations()`.

## TODO tags
- `TODO(SEALED-EVIDENCE-CRYPTO)` — key-wrapping design.
- `TODO(UNSEALING-ORDER-UI)` — three-key ceremony form.
- `TODO(RETENTION-CRON-SQL)` — migration.
