# @sendwise-forensic/dummy-verification

Prototype-only dummy verification tokens for SendWiseForensic. Every
token this package emits is **visibly stamped** with a `prototypeMarker`
string and a `todoTag` matching `docs/PROTOTYPE_NOTICE.md`, so no dummy
verification can silently masquerade as a real one.

## What this package covers

Three of the eight prototype shortcuts enumerated in
`docs/PROTOTYPE_NOTICE.md`:

| Item | Real system | Prototype stub | `todoTag` |
|---|---|---|---|
| 1. Aadhaar / identity verification | UIDAI e-KYC | SHA-256 hash of a 12-digit input + `XXXX-XXXX-<last4>` masked identifier | `TODO(UIDAI-INTEGRATION)` |
| 2. Judicial signature on warrants | UIDAI e-Sign digital signature | SHA-256 of the uploaded document + form-field issuer name | `TODO(ESIGN-VERIFICATION)` |
| 3. §69 Review Committee (2009 Rules R.22) | Cabinet Secretary + Secretary Legal + Secretary Telecom quorum | Single-user approve; still emits a token but with `quorumMet=false` | `TODO(REVIEW-COMMITTEE-QUORUM)` |

## API surface

```ts
import {
  makeDummyAadhaarToken,           // identity.ts
  makeDummyESignToken,              // esign.ts   (async — uses crypto.subtle if present)
  makeDummyReviewCommitteeApproval, // review-committee.ts
  wrapWithDummyMarker,              // banners.ts — deep-freezes + adds _prototype
  PROTOTYPE_BANNER_TEXT,
  PROTOTYPE_BANNER_STRINGS,
  DummyIdentityTokenSchema,         // Zod
  DummyESignTokenSchema,
  DummyReviewCommitteeTokenSchema,
  CombinedDummyVerificationBundleSchema,
  DummyVerificationError,
} from '@sendwise-forensic/dummy-verification';
```

Every emitted token carries these fields **verbatim**:

- `DummyIdentityToken.prototypeMarker === 'DUMMY VERIFIED — PROTOTYPE ONLY'`,
  `todoTag === 'TODO(UIDAI-INTEGRATION)'`, `sourceStatute === 'UIDAI_ACT_STUB'`.
- `DummyESignToken.prototypeMarker === 'DUMMY E-SIGN — PROTOTYPE ONLY'`,
  `todoTag === 'TODO(ESIGN-VERIFICATION)'`.
- `DummyReviewCommitteeToken.prototypeMarker === 'DUMMY QUORUM — PROTOTYPE ONLY'`,
  `todoTag === 'TODO(REVIEW-COMMITTEE-QUORUM)'`,
  `statuteReference === 'IT_RULES_2009_R22'`.

## Behaviour highlights

- **Fail-closed** on malformed input via `DummyVerificationError` (mirrors
  `CertificateValidationError` from the evidence-certificate package).
- **Aadhaar is never stored raw** — only the SHA-256 hex hash + a masked
  identifier survive.
- **Deterministic** given an injected `clock: () => Date`. All three
  factories accept a clock so tests can snapshot the JSON output.
- **Async e-Sign** — `makeDummyESignToken` returns a Promise. It uses
  `globalThis.crypto.subtle` when available (edge / modern Node) and
  falls back to `node:crypto` otherwise. Both paths produce the same hex
  digest.
- **UI stamp helper** — `wrapWithDummyMarker(obj)` adds a top-level
  `_prototype: PROTOTYPE_BANNER_TEXT` field and deep-freezes the object.

## Consumer wiring

- `packages/legal-framework/src/india/index.ts::validateAuthorization`
  now demands a valid `DummyReviewCommitteeToken` for
  `JUDICIAL_WARRANT` authorizations. Missing / malformed => violation
  cites `IT_RULES_2009_R22`. `TODO(REVIEW-COMMITTEE-QUORUM)`.

Not yet wired: forensic-console UI. That is a follow-up.

## Tests

Node's built-in test runner via a compile-to-`dist/` step (matches the
sibling `packages/evidence-certificate`; rationale: `.js` import
specifiers do not resolve under Node's `--experimental-strip-types`
loader):

```bash
npm test --workspace @sendwise-forensic/dummy-verification
```

## Non-goals

- No real cryptographic signing. `TODO(ESIGN-VERIFICATION)`.
- No real UIDAI API. `TODO(UIDAI-INTEGRATION)`.
- No quorum enforcement inside the token factory (it only reports
  `quorumMet`). Enforcement is a downstream adapter concern —
  `packages/legal-framework` does it. `TODO(REVIEW-COMMITTEE-QUORUM)`.
