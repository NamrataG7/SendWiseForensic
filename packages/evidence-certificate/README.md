# @sendwise-forensic/evidence-certificate

BSA 2023 §63 evidence-certificate renderer for SendWiseForensic. Produces
the actual India-admissibility artefact for electronic records collected
via the supervised-keyboard pipeline.

## Statutory basis

- **Bharatiya Sakshya Adhiniyam, 2023 §63** (replaces old Indian Evidence
  Act §65B). Electronic records are admissible when accompanied by a
  certificate signed by a person in a responsible official position that
  identifies the record, the device, the manner of production, and states
  that the device was operating properly during the relevant period.
- **Information Technology Act, 2000 §69** and the **IT (Procedure and
  Safeguards for Interception, Monitoring and Decryption) Rules, 2009 R.3**
  are cited on the authorization block.
- See [`docs/LEGAL_FRAMEWORK_IN.md` §4](../../docs/LEGAL_FRAMEWORK_IN.md)
  for the full traceability table.

## Consumers

- **forensic-console** (Node runtime on Vercel) — evidence export flow.
- **Android upload-receipt** component (future) — shares `types.ts`,
  `schema.ts`, and `integrity.ts` (the JSON and PDF renderers are
  Node-only paths for now).

## API surface

```ts
import {
  toCertificateJson,        // strict Zod-validated JSON renderer
  toCertificatePdf,          // pdf-lib register-style A4 renderer
  canonicalStringify,        // deterministic JSON for hashing/signing
  sha256Hex,                 // integrity primitive
  verifyHashChain,           // audit-log + evidence chain check
  aggregatedRootHash,        // evidence.aggregatedRootHash builder
  CertificateInputSchema,    // Zod
  CertificateValidationError,
  SEC63_REQUIRED_FIELDS,     // canonical statute-cited required-field list
} from '@sendwise-forensic/evidence-certificate';
```

`toCertificateJson(input)` **fails closed**: if any BSA §63 required field
is missing or empty, it throws `CertificateValidationError` carrying a
machine-readable `missingFields[]` list with `{ path, label, statute,
clause }` per missing field. No partial certificates are ever produced.

The rendered JSON has a fixed property order (see `render-json.ts`) so the
serialized bytes are stable across runs — the JSON is what downstream code
hashes and signs. Bumping the field order requires bumping
`schemaVersion`.

## PDF renderer notes

- A4 portrait, `pdf-lib` `StandardFonts.TimesRoman` family, high contrast,
  no decorative elements — this is an official-register document.
- `prototypeMode: true` on the input stamps a red **DUMMY VERIFIED —
  PROTOTYPE** watermark. Every prototype build MUST set this until a real
  signer certificate is wired up
  (`TODO(ESIGN-VERIFICATION)`).
- The footer carries an anti-tamper SHA-256 of `canonicalStringify(rendered)`.
- `pdf-lib` is imported dynamically so the JSON path (used by
  `packages/legal-framework`) can be type-checked and executed on a fresh
  clone without needing `pdf-lib` installed. Consumers that call
  `toCertificatePdf` must `npm install` at the workspace root first.

## Tests

Uses Node's built-in test runner. No vitest, no jest.

```bash
npm test --workspace @sendwise-forensic/evidence-certificate
```

We chose **compile-to-`dist/` then `node --test`** over
`--experimental-strip-types` because:

1. The package's source files use the same `.js` import extensions the
   rest of the SendWiseForensic monorepo uses (matching
   `packages/legal-framework`). Node's type-stripping loader does not
   rewrite `.js` specifiers back to `.ts` files, so raw
   `node --test src/**/*.ts` fails to resolve intra-package imports.
2. A single `tsc -p tsconfig.test.json` step is unambiguous, works on
   every Node LTS from 20 onwards, and produces the same layout
   downstream tooling expects.

`dist/` is `.gitignore`d.

## What this package does NOT do

- It does not sign the certificate. That is a
  `TODO(ESIGN-VERIFICATION)` — see `docs/PROTOTYPE_NOTICE.md`.
- It does not decide who is a "person in a responsible official position"
  — the caller must already have authenticated the officer.
- It does not persist certificates. Storage is the caller's concern.
