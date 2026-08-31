# forensic-console

**SendWiseForensic — Court-Ordered Digital Supervision Console**

> **PROTOTYPE — NOT FOR PRODUCTION USE.** Aadhaar / UIDAI e-Sign / DigiLocker
> verifications are dummy stubs. Do not deploy against real subjects, real
> cases, or real evidence. See [`../docs/PROTOTYPE_NOTICE.md`](../docs/PROTOTYPE_NOTICE.md).

This app is the officer-, counsel-, and auditor-facing web console for
SendWiseForensic. It is a fork of SendWise&rsquo;s `parental-dashboard`
rebranded and rescoped for court-ordered digital supervision under Indian
law (IT Act §69 + 2009 Interception Rules, BNSS, BSA §63, DPDPA 2023).

The primary user is **not the police** — it is the **court-authorized case**.
Police act as executors of Competent Authority directions through this
console, never as originators of surveillance.

## Design intent

- Reads as a judicial register, not a SaaS app: serif titles, uppercase
  eyebrows, hairline rules, generous whitespace.
- Single indigo accent for actionable state; deep red reserved for the
  prototype banner and destructive actions; emerald reserved for
  successfully-issued authorizations.
- Every dummy verification renders a visible pill, never a subtle tooltip.
- Every field in the authorization wizard cites the statute that governs it.

## Route map

| Route | Purpose |
|---|---|
| `/` | Landing; redirects to `/cases` (authenticated) or `/login`. |
| `/login` | Officer Sign-In. Secondary link to Counsel / Auditor portal. |
| `/cases` | Assigned-cases docket for the signed-in officer. |
| `/cases/[caseId]` | Case detail with tabs: Overview, Authorizations, Subjects, Evidence (metadata), Audit Trail. |
| `/authorizations/new` | 7-step warrant issuance wizard with per-field statute citations. |
| `/authorizations/[id]` | Read-only warrant summary with dummy-verified pill, status timeline, revoke action. |
| `/counsel` | Defense-counsel / Judicial-Auditor landing; explains scope and objection filing. |
| `/audit` | Judicial-Auditor read-only view of the hash-chained audit log. |
| `/prototype-notice` | Renders `docs/PROTOTYPE_NOTICE.md`. |

## Getting started

```bash
cd forensic-console
npm install
npm run dev
```

Then visit http://localhost:3000. All data is fixture data from
`lib/forensic-store.ts` — no Supabase tables are wired yet. Search for
`TODO(WIRE-TO-SCHEMA)` for the handoff points to the schema lane.

## Environment

| Var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PROTOTYPE` | `true` | Renders the persistent red prototype banner. Set to `false` only in a properly cleared production build. |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Supabase anon key. |

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase SSR · Zod ·
Recharts. No new dependencies were added on top of SendWise&rsquo;s
`parental-dashboard`.

## What is deliberately not here

- Real API routes wired to the forensic entity model. `lib/forensic-store.ts`
  returns fixture data; the schema lane will replace it.
- `lib/parent-store.ts` and `lib/types.ts` are marked `@deprecated` and
  retained only for one commit to keep the fork history bisectable.
- Real Aadhaar / e-Sign verification. See the prototype notice.
