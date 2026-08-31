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

## Jurisdiction adapters

SendWiseForensic is **trunk-based**. There is a single long-lived branch (`main`); there are no long-lived `jurisdiction/*` branches. Jurisdiction-specific behaviour is implemented as **pluggable adapters** that all live in the trunk:

- `packages/legal-framework/src/india/` — primary; IT Act §69 + 2009 Rules, BNSS, BNS, BSA §63, DPDPA 2023.
- `packages/legal-framework/src/us/` — 4th Amendment, Title III (18 U.S.C. §§2510–2523), ECPA, SCA, Pen/Trap.
- `packages/legal-framework/src/uk/` — Investigatory Powers Act 2016 (double-lock, §56), RIPA legacy, DPA 2018 Part 3, PACE 1984.

Each adapter implements a common `LegalFrameworkAdapter` interface. **Adapter selection is not a user choice.** It is derived from the DB-recorded `jurisdiction` field on the `Case` (and echoed on every `Authorization`). An officer cannot pick a jurisdiction at authorization time — the field is inherited from the case, and the case's jurisdiction is immutable after creation.

Cross-jurisdiction contamination (e.g., issuing a Title III order under an Indian case, or attaching a UK IPA §32 duration to a US authorization) is refused **twice**: once at authorization-validation time by the adapter, and again at certificate-generation time by the renderer. Belt-and-braces.

Deployment topology is a **config choice**, not a code choice:

- **Single-jurisdiction deployment** (e.g., an India-only academic pilot) — only the `india` adapter is registered; the ENUM still carries `US`/`UK` values but no adapter answers to them, and the API rejects case creation for unregistered jurisdictions.
- **Multi-jurisdiction / federated tenants** — all three adapters are registered; each tenant is pinned to one jurisdiction; officers are assigned a home jurisdiction and (rarely) explicit cross-jurisdiction grants.

See [`docs/LEGAL_FRAMEWORK_IN.md`](docs/LEGAL_FRAMEWORK_IN.md), [`docs/LEGAL_FRAMEWORK_US.md`](docs/LEGAL_FRAMEWORK_US.md), and [`docs/LEGAL_FRAMEWORK_UK.md`](docs/LEGAL_FRAMEWORK_UK.md) for the per-jurisdiction statute mappings.

### Jurisdiction distinction — how confusion is prevented

Confusion between jurisdictions is not merely discouraged by documentation; it is prevented by eight independent technical mechanisms:

1. **Immutable jurisdiction on Case and Subject.** Every `case` and `subject` row carries a `jurisdiction` column enforced by a DB `CHECK` (via the `jurisdiction` ENUM) plus an `UPDATE` trigger that raises an exception on any attempt to change it after insert.
2. **Authorization inherits Case.jurisdiction.** Every `authorization` row carries its own `jurisdiction` column, and a trigger refuses any INSERT/UPDATE where `authorization.jurisdiction` does not equal `(SELECT jurisdiction FROM case WHERE id = authorization.case_id)`. Defense in depth against a rogue service bug.
3. **Adapter selection is by DB field, never by user pick.** The `AdapterRegistry` in `packages/legal-framework` resolves the adapter from `case.jurisdiction`. There is no "choose your jurisdiction" control in the officer UI at authorization time.
4. **Statute references are jurisdiction-prefixed.** Every code in `authorization.statute_references` must begin with `IN_`, `US_`, or `UK_`. A DB trigger rejects any element whose prefix does not match the row's jurisdiction. Cross-prefix contamination is impossible at the storage layer.
5. **RLS filters cases by officer's assigned jurisdiction.** An officer sees `case`/`authorization`/`evidence` rows only where the row's jurisdiction matches the officer's `home_jurisdiction`, or where an explicit `officer_jurisdiction_grant` row exists.
6. **Distinct visual identity per jurisdiction in the console.** Each jurisdiction has its own register style, header text, and colour accent, so an officer cannot mistake one workspace for another at a glance.
7. **Distinct certificate templates.** BSA §63 (India), Title III §2518 (US), and IPA 2016 §56 (UK) certificates are separate templates; the renderer refuses to mix statute language across jurisdictions and refuses to render at all if the authorization's jurisdiction does not match the case's.
8. **Distinct dummy-verification providers per jurisdiction.** The India adapter stubs Aadhaar / UIDAI e-Sign / DigiLocker; the US adapter stubs a DOJ/FRCP Rule 41 signature stub; the UK adapter stubs an IPC / Judicial Commissioner double-lock stub. Providers are wired per-adapter, never shared.

Mechanisms 1, 2, 4, and 5 are implemented in `supabase/migrations/`. Mechanisms 3, 6, 7, and 8 are implemented in `packages/legal-framework/` and `forensic-console/`.

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
