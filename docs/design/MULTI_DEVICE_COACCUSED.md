# Design: Multi-Device / Co-Accused Cardinality

## Problem
Real cases have co-accused (multiple subjects) and multi-device subjects. Current schema: Case → Subject → Devices, one Authorization per Subject. Undefined: shared warrants, shared devices, scope splits.

## Design

### Cardinality (unchanged, formalised)
- Case 1—N Subject
- Subject 1—N Device
- Case 1—N Authorization
- Authorization N—1 Case
- **Authorization N—M Subject** (via new join `authorization_subject`)
- **Authorization N—M Device** (via new join `authorization_device`)

Rationale: one warrant may cover several co-accused OR several devices of one subject; each combination must be recorded explicitly so scope enforcement is unambiguous.

### New join tables
```
authorization_subject (auth_id, subject_id, PK)
authorization_device  (auth_id, device_id, PK)
```

### Scope enforcement update
`Authorization.scope.authorizedDeviceIds` becomes derived from `authorization_device`. RLS + CollectionGate check membership against the join, not a JSONB array.

### Shared devices (family tablet)
Add `device.sharedWithSubjectIds Text[]` metadata. On collection, on-device `PrivilegeHint` inspects foregrounded app's account-identifier if available; batches from a non-target account are auto-tagged `privilegeFlag = UNKNOWN` and quarantined for Filter Team review. Officer cannot see them until filter team releases.

### Co-accused
- One warrant per co-accused if statutes require (IN §69 practice: one order per subject); the UI groups them under a "warrant bundle" (view-only).
- Warrant bundle: `warrant_bundle (id, case_id)` + `authorization.bundle_id nullable`. Purely presentational.

## Reuse
- Keeps `Authorization`, `Subject`, `Device`.
- Reuses `p_append_audit` for any bundle/join mutation.
- Reuses RLS pattern (adds subquery through join).

## TODO tags
- `TODO(MULTI-DEVICE-SCHEMA)` — SQL for join tables.
- `TODO(SHARED-DEVICE-ACCOUNT-HINT)` — Android app foreground-account detection.
- `TODO(WARRANT-BUNDLE-UI)` — grouping view.

## Statute anchors
- IN: 2009 Rules R.3 (per-subject order); joint FIR under BNSS.
- US: §2518(1)(b)(iv) (identity of person committing offense — per-person particularity).
- UK: IPA §17 (persons who may apply) + §15 (subject-matter of warrants — can name multiple).
