# SendWise → SendWiseForensic Inheritance Map

Purpose: make explicit which files came from upstream SendWise (`NamrataG7/SendWise`), which are edits on top, and which are genuinely new — so a reviewer can see this is a legitimate fork with domain adaptations, not a rewrite.

## Console (`forensic-console/` from `SendWise/parental-dashboard/`)

### Inherited (pattern preserved; edited for rebrand + domain)
- `utils/supabase/{client,server,middleware}.ts` — Supabase SSR pattern
- `lib/redis.ts`, `lib/parent-store.ts` (kept as `@deprecated`), `lib/types.ts`
- `middleware.ts` — auth-gating pattern
- `app/layout.tsx` — skeleton; extended with prototype banner + jurisdiction status bar
- `app/globals.css`, `tailwind.config.ts` — extended with jurisdiction accents
- `app/login/`, `app/auth/` — auth flow structure
- `package.json` — Next.js 14 + Supabase + Redis + Recharts + Zod stack

### New (no SendWise equivalent)
- `app/cases/`, `app/authorizations/`, `app/exports/`, `app/filter-team/`, `app/counsel/`, `app/audit/`, `app/onboarding/`, `app/subjects/`, `app/prototype-notice/`
- `app/api/authorizations/`, `app/api/cases/`, `app/api/exports/`, `app/api/filter-team/`, `app/api/audit/`, `app/api/counsel/`, `app/api/officer/`, `app/api/subjects/`
- `lib/{authz,db,api,adapter-selector,entities,jurisdiction-theme,view-jurisdiction}.ts`
- `components/{JurisdictionContext,JurisdictionPill,JurisdictionStatusBar,CaseJurisdictionRibbon,PrototypeBanner,StatuteRef,TopNav,Pill,PageHeader,EmptyRegister}.tsx`

## Android (`SupervisedKeyboardApp/` from `SendWise/SafeKeyboardApp/`)

### Inherited essentially intact
- `ime/SafeKeyboardIME.kt` (1008 lines) — kept, extended with EvidenceRecorder hooks + SUPERVISED pill
- `ime/SuggestionStripView.kt` — kept
- `nlp/` — Random Forest classifier, slur triggers, lexicon fallback
- `network/ViolationLogger.kt` — anonymised metadata channel (exempted pathway)
- `network/PairingActivity.kt`, `RetrofitClient.kt` — pairing infra
- `utils/PreferencesManager.kt`, `UserIdGenerator.kt`
- `ui/` — settings + pair screens
- `res/` — layouts, drawables, strings (strings extended with SUPERVISED pill label)
- Gradle scaffolding, `debug.keystore`, `proguard-rules.pro`

### New (no SendWise equivalent)
- `authorization/` — AuthorizationScope, AuthorizationState, AuthorizationClient, StubAuthorizationClient, CollectionGate, TimeWindow, DataCategory
- `notify/` — SupervisionForegroundService, SupervisionInfoActivity
- `evidence/` — EvidenceBatch, EvidenceSigner, EvidenceStore (Room), EvidenceRecorder, EvidenceUploader (WorkManager)
- `privilege/PrivilegeHint.kt`
- `tamper/{SelfTamperReceiver,RuntimeIntegrityChecker}.kt`
- `attestation/DeviceAttestation.kt`
- `SupervisedKeyboardApplication.kt`

## Model training (`model_training/`)
- Copied verbatim from SendWise. Not yet extended for forensic categories.

## Shared detection library (`shared/detection-library/`)
- Not copied in this fork. SendWise's shared library was not required because the Android app carries the classifier JSON directly.

## Genuinely new (no upstream)
- `packages/legal-framework/` — India/US/UK adapters, statutes, contamination guards
- `packages/evidence-certificate/` — BSA §63 JSON + PDF via pdf-lib
- `packages/dummy-verification/` — Aadhaar/e-Sign/Review Committee stubs
- `supabase/migrations/` — all 9 migrations (Case/Authorization/Evidence/AuditLog/Officer/Jurisdiction)
- `docs/` — ENTITY_MODEL, LEGAL_FRAMEWORK_{IN,US,UK}, PROTOTYPE_NOTICE, plus design docs under `docs/design/`

## Line-count summary
| Component | Upstream lines | Fork lines | Inherited / Extended / New |
|---|---|---|---|
| Console (TS/TSX) | 4,133 | 9,372 | ~4,100 inherited, ~5,300 new |
| Android (Kotlin) | 4,392 | 6,507 | ~4,400 inherited, ~2,100 new |
| Packages | 0 | ~2,500 | 100% new |
| Migrations | 0 | ~1,500 | 100% new |
| Docs | (SendWise README + minor) | ~2,000 | 100% new |

**Overall reuse ratio (line-weighted):** ~40% inherited, ~60% new. The parts SendWise did well (privacy-preserving IME, on-device classifier, Supabase SSR wiring) were kept; the parts SendWise doesn't do at all (warrants, adapters, evidence certificates, filter team, jurisdiction distinction) were built.
