# Design: Warrant Extension Flow

## Problem
IN §69/Rules R.11: 60d/order, 180d cap. US §2518(5): 30d, renewable indefinitely. UK IPA §32: 6 months, renewable 6 months. Current schema has one `Authorization` per warrant. No design for extensions.

## Design

### New Authorization states
Add to `AuthorizationStatus`:
- `EXTENSION_REQUESTED` — officer filed extension before expiry
- `EXTENSION_APPROVED` — Review Committee (IN) / Judge (US) / Judicial Commissioner (UK) approved
- `EXTENSION_DENIED` — denied; parent authorization proceeds to expiry
- `SUPERSEDED` — replaced by a new authorization with extended scope

### New entity: `AuthorizationExtension`
```
AuthorizationExtension
├─ id
├─ parentAuthorizationId (FK)
├─ requestedBy (Officer FK)
├─ requestedAt
├─ requestedNewExpiresOn
├─ justification (text — "why this extension is necessary")
├─ proportionalityRefresh (JSONB — the Puttaswamy/Berger/ECHR checklist re-evaluated)
├─ decisionStatus (PENDING | APPROVED | DENIED)
├─ decidedBy (Officer FK, nullable)
├─ decidedAt (nullable)
├─ decisionReason (text)
└─ statuteReference (per-jurisdiction: IN_IT_RULES_2009_R11, US_18USC_2518_5, UK_IPA_2016_S32)
```

### Per-jurisdiction cap enforcement (adapter method)
Add to `LegalFrameworkAdapter`:
```ts
computeCumulativeCapRemaining(parentAuth, priorExtensions): {
  remainingDays: number | null; // null = no statutory cap
  statuteReference: string;
}
```
- IN: sum(durations of parent + all approved extensions) ≤ 180 days.
- US: null (no statutory cap; each 30d renewal is a new judicial decision).
- UK: 6 months per grant, no absolute cap in statute (but proportionality bites).

### Trigger
DB trigger `authorization_extension_within_cap` on `AuthorizationExtension` INSERT with `decisionStatus='APPROVED'`: raises exception if adapter's cap is exceeded.

### UI (deferred implementation)
- `/authorizations/[id]/extend` — new client form.
- Extension request card on `/authorizations/[id]` when officer role & status=ACTIVE & ≥15 days to expiry.
- Review Committee dashboard (item 5) surfaces pending extension requests.

### Audit
Every state transition + extension decision → `p_append_audit` with `EXTENSION_*` actions.

## Reuse
- Reuses `AuthorizationStatus` enum (add values, no rename).
- Reuses `p_append_audit` hash chain.
- Reuses adapter interface pattern; adds one method.

## TODO tags
- `TODO(EXTENSION-UI)` — form + review workflow (deferred).
- `TODO(EXTENSION-CAP-TRIGGER-SQL)` — DB trigger (deferred).
- `TODO(EXTENSION-ADAPTER-METHOD)` — cumulative-cap calc per adapter (deferred).

## Statute mapping
| Jurisdiction | Section | Cap |
|---|---|---|
| IN | IT Rules 2009 R.11 | 60/order, 180 total |
| US | 18 U.S.C. §2518(5) | 30/order, no total |
| UK | IPA 2016 §32 (interception) / §108 (EI) | 6mo/order, no absolute |
