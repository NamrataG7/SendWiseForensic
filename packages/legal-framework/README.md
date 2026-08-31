# @sendwise-forensic/legal-framework

Pluggable jurisdiction adapter package for SendWiseForensic.

Every jurisdiction supplies one implementation of `LegalFrameworkAdapter`
(see `src/adapter.ts`). The adapter is the single boundary through which
the rest of the system asks legal questions:

- Is this authorization valid? (`validateAuthorization`)
- How long can it run? (`computeMaxDuration`)
- Who is allowed to issue one? (`getCompetentAuthorities`)
- What certificate does an evidence export need? (`generateEvidenceCertificate`)
- Which contact categories are privileged? (`getPrivilegeCategories`)
- When must records be purged? (`getPurgeSchedule`)

## Implementations

- **India** (primary) — `src/india/`. Implements IT Act §69 + IT Rules 2009,
  BNSS 2023, BSA 2023 §63, DPDPA 2023 §17, and the Puttaswamy (2017)
  four-prong proportionality checklist. Statute constants live in
  `src/india/statutes.ts`; see `docs/LEGAL_FRAMEWORK_IN.md` for the full
  feature→statute traceability matrix.
- **US / UK** — not implemented. Placeholders in the shared `LegitimateAim`
  union are marked with `TODO(US-ADAPTER)` / `TODO(UK-ADAPTER)`.

## Status

Prototype skeleton. External integrations (UIDAI e-KYC / e-Sign,
Play Integrity, hardware keystore, Review Committee quorum, external
timestamping) are stubbed with `TODO(...)` tags matching
`docs/PROTOTYPE_NOTICE.md`. Not fit for use against real subjects.

## Consumption

TypeScript-only (no build step). Consumers import via ts-paths:

```ts
import { indiaLegalFramework } from '@sendwise-forensic/legal-framework';
```

Peer dependency: `zod` `^3.23.8` (matches the upstream SendWise stack).
