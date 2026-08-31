# SendWiseForensic

**Court-Ordered Digital Supervision Platform** — a warrant-gated fork of [SendWise](https://github.com/NamrataG7/SendWise).

> ⚠️ **PROTOTYPE — NOT FOR PRODUCTION USE**
> This is an academic prototype. Aadhaar / UIDAI e-Sign / DigiLocker integrations are stubbed with dummy verification. Do not deploy against real subjects, real cases, or real evidence.

---

## What this is

SendWise is a privacy-preserving parental-awareness tool: message content never leaves the child's device; only anonymised metadata is sent to a dashboard.

**SendWiseForensic inverts that privacy model — but only when a valid judicial authorization scopes the inversion.** Without a valid, unexpired, in-scope authorization, the system behaves exactly like SendWise: no content leaves the device.

The primary user is **not the police**. The primary user is **the court-authorized case**. Police are executors of court orders through this platform, not originators of surveillance.

## Design principles

1. **Warrant-first, monitoring-second.** No collection without a valid authorization object attached to the subject.
2. **Illegal surveillance must be architecturally impossible**, not merely prohibited by policy.
3. **Scope is enforced at the database layer**, not just the UI.
4. **Everything is audit-logged** to a hash-chained, tamper-evident log.
5. **Privileged communications are auto-quarantined** (lawyer, doctor, clergy, spouse) and reviewed by an independent filter team, never by case investigators.
6. **Subject has rights** — via defense counsel, they can see the warrant scope, duration, and categories collected, and file objections.
7. **Auto-expiry is enforced by cron**, not by policy.

## Authorization pathways

| Pathway | Legal basis (India) | Who authorizes | Consent required |
|---|---|---|---|
| `JUDICIAL_WARRANT` | IT Act §69 + 2009 Interception Rules | Union/State Home Secretary + Review Committee | No |
| `BAIL_CONDITION` | BNSS bail provisions | Magistrate / Sessions Court | Court-imposed |
| `PROBATION_ORDER` | Probation of Offenders Act, 1958 | Court | Court-imposed |
| `PLEA_AGREEMENT` | BNSS Ch. XXIII (plea bargaining) | Court-recorded | Documented consent |
| `CORPORATE_INSIDER` | Employment contract + IT Act §43A | Employer + employee | Explicit, revocable |
| `VOLUNTARY_VICTIM` | DPDPA 2023 consent | Data principal | Explicit, revocable |

See [`docs/LEGAL_FRAMEWORK_IN.md`](docs/LEGAL_FRAMEWORK_IN.md) for the full India statute mapping.

## Jurisdiction branches

- `main` — shared core (entities, authorization engine, audit chain)
- `jurisdiction/india` — **primary**; IT Act §69, BNSS, BNS, BSA §63, DPDPA
- `jurisdiction/us` — 4th Amendment, Wiretap Act (Title III), ECPA, Stored Communications Act
- `jurisdiction/uk` — Investigatory Powers Act 2016 (RIPA legacy)

Each jurisdiction implements a common `LegalFrameworkAdapter` interface.

## Repository layout (inherited from SendWise, being adapted)

```
SendWiseForensic/
├── docs/
│   ├── LEGAL_FRAMEWORK_IN.md         # India statute → feature mapping
│   ├── ENTITY_MODEL.md               # ER model + role matrix
│   └── PROTOTYPE_NOTICE.md           # Prototype scope + Aadhaar stubs
├── forensic-console/                 # (formerly parental-dashboard)
├── SupervisedKeyboardApp/            # (formerly SafeKeyboardApp)
├── shared/detection-library/         # reused
└── model_training/                   # reused; taxonomy will expand
```

## MVP scope (academic deliverable)

- India jurisdiction only.
- `JUDICIAL_WARRANT` pathway only (other pathways scaffolded, not implemented).
- Entity model + warrant-gated ingest.
- Hash-chained audit log.
- Auto-generated BSA §63 evidence certificate on export.
- Subject portal (defense counsel view).
- Dummy Aadhaar / e-Sign with visible "PROTOTYPE" banner.

## Getting started

_TBD — scaffolding in progress. See `docs/ENTITY_MODEL.md` for the data model landing next._

## License

Inherits SendWise's MIT license. See `LICENSE`.
