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

## Evidence pipeline

The evidence pipeline exists only to satisfy an active warrant. In every
non-Active state it is dormant — the gate short-circuits every entry
point before any hash, signature, database write, or network call
happens.

Flow:

```
IME event
  -> EvidenceRecorder.record(category, payloadProducer, contextAppPackage)
     -> CollectionGate.canCollect(category, contextAppPackage)   [DENY -> return]
     -> PrivilegeHint.classify(package, recipientHash)
     -> hash chain: SHA-256(prevHash || payload || canonical meta)
     -> EvidenceSigner.sign(payload || batchHash)   [RSA-2048, StrongBox preferred]
     -> EvidenceStore.evidenceDao().insert(EvidenceRow)          [Room]
     -> WorkManager enqueue EvidenceUploader (unique work, KEEP)
        -> DeviceAttestation.check()                              [Play Integrity stub]
        -> POST ${BACKEND_URL}/api/evidence/ingest
           -> 2xx  -> markUploaded
           -> 4xx (non-401) -> markDeadLettered
           -> 401 / 5xx / net -> bumpAttempt + WorkManager retry
```

The **CollectionGate invariant** is: no persistence and no upload of
authorization-relevant data may happen without a matching
`CollectionGate.canCollect()` returning true. This is enforced by
routing every evidence path through `EvidenceRecorder`, which calls the
gate first. Every persistence/upload function is annotated
`// COLLECTION_GATE_ONLY`.

### `// COLLECTION_GATE_ONLY` inventory

- `EvidenceRecorder.record(...)` — the sole recorder entry point;
  consults `CollectionGate` before doing anything.
- `EvidenceRecorder.enqueueUploadWorker()` — only invoked from `record`
  after a successful gate check.
- `EvidenceDao.insert(...)` — Room DAO insert; only called from
  `EvidenceRecorder`.
- `EvidenceUploader.doWork()` — WorkManager worker; only enqueued from
  `EvidenceRecorder.enqueueUploadWorker`.
- `SelfTamperReceiver.postTamperEventBestEffort(...)` — only called from
  the receiver's `onReceive` after checking
  `CollectionGate.currentState() is Active`.
- The IME's KEYSTROKE_BATCH / APP_EVENT / RISK_DETECTION emits — each
  wrapped in `EvidenceRecorder.record(...)`; the gate blocks in
  non-Active modes.

### Anonymised-risk-metadata pathway (upstream, exempted)

`ViolationLogger.logViolation(...)` is the pre-existing privacy-first
path that uploads only opaque `category / severity / action` counters
tied to a hashed device id. It carries no content, no recipient, no
package. It is not authorization-relevant and therefore is not gated on
`CollectionGate`. Its three IME call sites are annotated
`// COLLECTION_GATE_ONLY (anonymised-risk-metadata exempted pathway)` to
make the intent explicit at review time. Every warrant-scoped risk event
that flows through this path is *also* emitted via
`EvidenceRecorder.record(DataCategory.RISK_DETECTION, ...)`, which the
gate silently drops when supervision is not Active.

### Package layout added by this PR

```
com/sendwiseforensic/supervisedkeyboard/
  evidence/
    EvidenceBatch.kt        // data class + PrivilegeFlag enum
    EvidenceSigner.kt       // StrongBox-first RSA-2048 signing key
    EvidenceStore.kt        // Room DB, DAO (COLLECTION_GATE_ONLY insert)
    EvidenceRecorder.kt     // sole recorder entry point (COLLECTION_GATE_ONLY)
    EvidenceUploader.kt     // WorkManager worker (COLLECTION_GATE_ONLY)
  privilege/
    PrivilegeHint.kt        // hashed-contact + app-package classifier
  tamper/
    RuntimeIntegrityChecker.kt  // emulator / root probe
    SelfTamperReceiver.kt       // uninstall / package-change broadcast
  attestation/
    DeviceAttestation.kt        // Play Integrity stub
```

### Prototype stubs (all TODO-tagged)

- `TODO(WIRE-TO-FORENSIC-CONSOLE)` — real evidence-ingest client, real
  authorization refresh, real privilege registry sync, real tamper-event
  outbox, real refresh signing.
- `TODO(PLAY-INTEGRITY)` — `DeviceAttestation` returns a stub verdict;
  `RuntimeIntegrityChecker` is a cheap substitute only.
- `TODO(HARDWARE-KEYSTORE)` — `EvidenceSigner` falls back to a TEE-backed
  key when StrongBox is unavailable; production must gate on
  hardware attestation.
- `TODO(PRIVILEGE-REGISTRY-VERIFICATION)` — the hard-coded legal /
  medical app allowlist is not verified against statutory registries.
- `TODO(FILTER-TEAM-INDEPENDENCE)` — on-device privilege flags are
  hints; the authoritative decision belongs to the independent Filter
  Team server-side.
