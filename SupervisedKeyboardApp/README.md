# SupervisedKeyboardApp

Fork of SendWise `SafeKeyboardApp`. Prototype scaffold for the
SendWiseForensic Android IME. See
`/tmp/sw-work/SendWiseForensic/docs/PROTOTYPE_NOTICE.md` for what is
stubbed and what is not.

## Dual-mode operation

The keyboard runs in one of two modes, decided at runtime by
`CollectionGate` observing an `AuthorizationState` from an
`AuthorizationClient`:

1. **Privacy-preserving default (Inactive / Suspended / Expired / Revoked).**
   The IME behaves as the upstream SafeKeyboardApp: on-device toxicity
   analysis, pre-send warning overlay, no persistence, no upload. The
   Tier-1 detection stack (Random Forest + slur triggers + lexicon
   fallback) is unchanged.

2. **Judicial-supervision mode (Active).** A court-issued warrant has
   been provisioned and its scope is in effect. Data collection is
   permitted **only** for the categories, apps, and time windows named
   in `AuthorizationScope`, and only through the `CollectionGate` API.

Wire-level categories mirror the entity model
(`docs/ENTITY_MODEL.md` Evidence.category):

- `KEYSTROKE_BATCH`
- `APP_EVENT`
- `COMMS_METADATA`
- `RISK_DETECTION`

## CollectionGate invariant

`CollectionGate` is the **only** sanctioned persistence/upload gate. Every
code path that would write authorization-relevant data to disk or send
it over the network must call `CollectionGate.canCollect(category,
contextAppPackage)` first. Any bypass is a bug.

The gate returns `true` iff **all** of the following hold at the moment
of the call:

- state is `AuthorizationState.Active`;
- the current wall clock is before `state.expiresAt`;
- `category ∈ scope.dataCategories`;
- `scope.contextApps` is empty **or** the current foreground package is
  in it;
- `scope.timeWindows` is empty **or** at least one window contains the
  current UTC hour and day-of-week.

Internal state is a `StateFlow<AuthorizationState>`; reads are atomic.
See `docs/ENTITY_MODEL.md` §3 invariants 1 and 3 for the entity-level
constraint this mirrors.

This PR **lays** the gate. It does not yet wire evidence upload. The
upstream Tier-1 detection stays in place unchanged.

## SUPERVISED pill (IME candidate strip)

A small red pill labelled `SUPERVISED` renders above the suggestion
strip. It is bound to `CollectionGate.state` and is visible only while
the state is `Active`. The pill is informational; tapping it does
nothing (the persistent notification carries the tappable explanation).

## Persistent supervision notification

While `CollectionGate` is `Active`, `SupervisionForegroundService` runs
as a foreground service (`foregroundServiceType="dataSync"`) and posts
an ongoing (non-dismissible) notification:

- **Title:** `Judicial Supervision Active`
- **Subtitle:** `Warrant expires in <N> hours` — recomputed every minute
- **Priority:** LOW (no sound, no vibration)
- **Channel:** `supervision_active`, `IMPORTANCE_HIGH` on API 26+
- **Tap:** opens `SupervisionInfoActivity`, a placeholder screen
  explaining that the device is under judicial supervision.

The service stops on any non-Active transition (`Suspended`, `Expired`,
`Revoked`, `Inactive`) and when the process ends. Rationale for showing
the indicator by default is documented in
`docs/LEGAL_FRAMEWORK_IN.md` §9 open question 4.

## Package layout

```
com/sendwiseforensic/supervisedkeyboard/
  SupervisedKeyboardApplication.kt   // wires client -> gate -> fg service
  authorization/
    AuthorizationScope.kt            // scope + DataCategory enum
    AuthorizationState.kt            // sealed: Inactive/Active/Suspended/Expired/Revoked
    AuthorizationClient.kt           // interface: observeState / refresh / reportTamper
    StubAuthorizationClient.kt       // EncryptedSharedPreferences-backed stub
    CollectionGate.kt                // singleton gate, StateFlow-backed
    TimeWindow.kt                    // UTC hour + day-of-week bitmask, containsNow()
  notify/
    SupervisionForegroundService.kt  // persistent indicator service
    SupervisionInfoActivity.kt       // placeholder tap target
```

## What this PR does not do

- No real network client — `StubAuthorizationClient.refresh()` is tagged
  `TODO(WIRE-TO-FORENSIC-CONSOLE)` and only re-reads the persisted blob.
- No evidence signer, no tamper-detection integration — those land in
  follow-up PRs.
- No cosmetic rename of `SafeKeyboardIME` and related classes; that is a
  separate follow-up.
