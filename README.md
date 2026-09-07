# SendWiseForensic

**Court-Ordered Digital Supervision Platform** — a warrant-gated fork of [SendWise](https://github.com/NamrataG7/SendWise).

> ⚠️ **PROTOTYPE — NOT FOR PRODUCTION USE**
> This is an academic prototype. Aadhaar / UIDAI e-Sign / DigiLocker integrations are stubbed with dummy verification. Do not deploy against real subjects, real cases, or real evidence.

---

## What this is

SendWise is a privacy-preserving on-device supervision tool: message content never leaves the device; only anonymised metadata is sent to a dashboard.

**SendWiseForensic inverts that privacy model — but only when a valid judicial authorization scopes the inversion.** Without a valid, unexpired, in-scope authorization, the system behaves exactly like SendWise: content stays on the device.

The primary user is **not the police**. The primary user is **the court-authorized case**. Police act as executors of court orders through this platform, not originators of surveillance.

---

## Methodology

The platform is built on four disciplines applied together. Understanding them is the fastest way to understand the codebase.

### 1. Trunk-based, adapter-driven architecture

Single long-lived branch (`main`). Jurisdiction-specific behaviour lives in **pluggable adapters** under `packages/legal-framework/src/{india,us,uk}/`, each implementing a common `LegalFrameworkAdapter` interface (`packages/legal-framework/src/adapter.ts`).

Adapter selection is **not** a user choice. The adapter is resolved server-side from the DB-recorded `case.jurisdiction` field. Officers never pick a jurisdiction at authorization time.

Deployment topology is a **config choice**, not a code choice: a single-jurisdiction pilot registers one adapter; a federated multi-tenant deployment registers all three.

### 2. Warrant-first, defense-in-depth enforcement

Nothing is collected without a valid `Authorization` row. Every collection call passes through a `CollectionGate` that reads its permission from the DB, not from configuration.

Cross-jurisdiction contamination (e.g., citing Title III on an Indian warrant, or attaching UK §32 duration to a US authorization) is refused at **nine independent architectural layers**:

| Layer | Mechanism | Location |
|---|---|---|
| L1 | `case.jurisdiction` DB CHECK + immutability trigger | `supabase/migrations/20260831120000_*.sql` |
| L2 | `authorization.jurisdiction = case.jurisdiction` trigger | `supabase/migrations/20260831120000_*.sql` |
| L3 | `statute_references` prefix-matches-jurisdiction trigger | `supabase/migrations/20260831120000_*.sql` |
| L4 | Adapter `validateAuthorization()` refuses non-matching prefixes | `packages/legal-framework/src/*/index.ts` |
| L5 | Adapter `generateEvidenceCertificate()` refuses cross-prefix mix | `packages/legal-framework/src/*/index.ts` |
| L6 | RLS scopes reads to officer's `home_jurisdiction` (+ explicit grants) | `supabase/migrations/20260831110906_*.sql`, `20260831120000_*.sql` |
| L7 | Per-jurisdiction UI theming (register style, header, accent) | `forensic-console/lib/jurisdiction-theme.ts` |
| L8 | Case jurisdiction is set at creation only; wizard shows locked pill | `forensic-console/app/authorizations/new/wizard-client.tsx` |
| L9 | Audit chain-root anchored hourly to OpenTimestamps (external, immutable) | `supabase/migrations/20260904000000_*.sql`, `scripts/anchor-audit-root.ts` |

Layers 1–3 are enforced *before* any application code runs (Postgres triggers). Layers 4–5 are enforced in TypeScript adapter code. Layer 6 is enforced at read time by RLS. Layers 7–8 prevent honest human error at the officer level. Layer 9 (added most recently) closes a rogue-service-role tamper channel by publishing chain-root commitments to a public timestamping authority.

Per-jurisdiction warrant-extension caps are enforced by both an adapter method (`computeCumulativeCapRemaining()`) and a DB trigger (`authorization_extension_within_cap`). India §69 caps at 180 days cumulative (IT Rules 2009 R.11); US Title III and UK IPA are statute-silent on cumulative caps and return null.

### 3. Dual-control and role separation

Administrative and judicial actions require two-person authorization by design:

- **Officer provisioning:** two admins must co-approve every officer invitation (`supabase/migrations/20260902000200_*.sql`). Admins are scoped to a single jurisdiction; the ADMIN role itself is not invitable through the console and can only be bootstrapped via SQL (`docs/ADMIN_BOOTSTRAP.md`) — segregation of duties.
- **Warrant issuance:** Review Committee sign-off is a first-class column on `authorization` (`review_status`, `review_approved_by`, `review_approved_at`), implementing IT Rules 2009 R.22.
- **Evidence export:** dual-officer approval on `evidence_export`; the certificate renderer refuses to run without both approvals.
- **Filter Team:** privileged communications (attorney-client, medical, clergy, spousal) are quarantined to a dedicated `FILTER_TEAM` role, organizationally distinct from case investigators.
- **Subject rights:** defense counsel can request magic-link access to case metadata via `/counsel` and file objections that route to the Review Committee.

### 4. Reused-not-reinvented

SendWiseForensic is a fork; it inherits from three upstream/sibling codebases and builds only what is new:

| Reused from | Component |
|---|---|
| [SendWise](https://github.com/NamrataG7/SendWise) | On-device Random Forest cyberbullying classifier + Android IME + hardcoded slur lexicon (`SupervisedKeyboardApp/`, adapted with `CollectionGate` overlay) |
| SendWise `parental-dashboard` | Next.js 14 + Supabase SSR + Zod validation stack; forked into `forensic-console/` and re-scoped for warrants/officers/subjects |
| DDD Bounded Contexts (Evans 2003) | The `LegalFrameworkAdapter` pattern is Bounded Contexts applied to legal-regulatory diversity |
| OpenTimestamps (Todd 2016) | Bitcoin-anchored audit-chain publication for Layer L9 |
| Compliance-as-code frameworks (OPA, Chef InSpec) | The prefix-tagged statute enum + adapter validation approach |

What is genuinely new: (a) the dual-mode on-device design (privacy-preserving default; warrant-scoped inversion under an authorization record), (b) the adapter pattern applied to *surveillance* statutes with cross-jurisdiction contamination refusal, and (c) the encoding of constitutional proportionality tests (Puttaswamy four-prong, Berger particularity, ECHR Art. 8 three-prong) as machine-checked data-schema constraints.

---

## Authorization pathways

| Pathway | Legal basis (India) | Who authorizes | Consent required |
|---|---|---|---|
| `JUDICIAL_WARRANT` | IT Act §69 + IT Rules 2009 | Union/State Home Secretary + Review Committee | No |
| `BAIL_CONDITION` | BNSS bail provisions | Magistrate / Sessions Court | Court-imposed |
| `PROBATION_ORDER` | Probation of Offenders Act 1958 | Court | Court-imposed |
| `PLEA_AGREEMENT` | BNSS Ch. XXIII (plea bargaining) | Court-recorded | Documented consent |
| `CORPORATE_INSIDER` | Employment contract + IT Act §43A | Employer + employee | Explicit, revocable |
| `VOLUNTARY_VICTIM` | DPDPA 2023 consent | Data principal | Explicit, revocable |

See [`docs/LEGAL_FRAMEWORK_IN.md`](docs/LEGAL_FRAMEWORK_IN.md), [`docs/LEGAL_FRAMEWORK_US.md`](docs/LEGAL_FRAMEWORK_US.md), and [`docs/LEGAL_FRAMEWORK_UK.md`](docs/LEGAL_FRAMEWORK_UK.md) for the full per-jurisdiction statute mappings.

---

## Repository layout

```
SendWiseForensic/
├── docs/
│   ├── LEGAL_FRAMEWORK_IN.md         # India statute → feature mapping
│   ├── LEGAL_FRAMEWORK_US.md         # US statute → feature mapping
│   ├── LEGAL_FRAMEWORK_UK.md         # UK statute → feature mapping
│   ├── ENTITY_MODEL.md               # ER model + role matrix
│   ├── ADMIN_BOOTSTRAP.md            # One-time SQL to seed admins
│   ├── DEPLOY.md                     # Vercel + Supabase deployment guide
│   ├── PROTOTYPE_NOTICE.md           # Prototype scope + honest stubs list
│   ├── INHERITANCE_MAP.md            # What is reused from SendWise vs. new
│   └── design/                       # Design-only docs for future work
├── forensic-console/                 # Next.js 14 admin/officer/counsel console
├── packages/
│   ├── legal-framework/              # IN / US / UK adapters, statute enums, validators
│   ├── evidence-certificate/         # BSA §63 / §2518 / IPA §56 renderers
│   └── dummy-verification/           # Prototype-only identity + e-Sign stubs
├── SupervisedKeyboardApp/            # Android IME with CollectionGate + Evidence pipeline
├── supabase/migrations/              # Schema, RLS, triggers, audit chain, cron
└── scripts/                          # Bench + L9 anchor + operational scripts
```

---

## Getting started

Deploying a fresh instance takes ~1 hour on free tiers:

1. **Read** [`docs/PROTOTYPE_NOTICE.md`](docs/PROTOTYPE_NOTICE.md) so you know what is real vs. stubbed.
2. **Follow** [`docs/DEPLOY.md`](docs/DEPLOY.md) — provisions Supabase, applies all migrations in filename order, deploys the console to Vercel.
3. **Bootstrap** two admins per [`docs/ADMIN_BOOTSTRAP.md`](docs/ADMIN_BOOTSTRAP.md) (SQL only — dual-control).
4. **Invite** officers via the admin console (`/admin/officers/new`), which requires the second admin's co-approval before the magic-link email is sent.
5. **Follow** the end-to-end verification checklist in [`docs/paper/DEPLOY_REPRODUCIBILITY.md`](docs/paper/DEPLOY_REPRODUCIBILITY.md) to confirm the deployment.

For the Android app, `SupervisedKeyboardApp/` builds via `./gradlew assembleDebug`; a signed debug APK is also produced automatically by the `Build SupervisedKeyboardApp APK` GitHub Actions workflow on every push.

---

## Design docs

Deeper reading, all under `docs/`:

- **`ENTITY_MODEL.md`** — data model, role matrix, RLS invariants, threat classes.
- **`LEGAL_FRAMEWORK_IN.md` / `_US.md` / `_UK.md`** — per-jurisdiction statute mapping.
- **`ADMIN_BOOTSTRAP.md`** — SQL-only admin provisioning (segregation of duties).
- **`DEPLOY.md`** — end-to-end deployment.
- **`INHERITANCE_MAP.md`** — reuse map: what is inherited from SendWise vs. new.
- **`design/`** — extension design docs (warrant extensions, retention lifecycle, multi-device, oversight dashboard) for work not yet in the MVP.

---

## Licence

Inherits SendWise's MIT licence. See [`LICENSE`](LICENSE).
