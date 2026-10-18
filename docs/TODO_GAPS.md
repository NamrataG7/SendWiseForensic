# SendWiseForensic — Gap / To-Do List

Compiled by grepping every `TODO(...)` tag across the codebase (code, SQL,
docs) plus everything flagged during this session's build-out. Organized by
severity so you can pick up wherever makes sense when you resume.

> Status snapshot at time of writing: Phases 1–3 (device enrollment, authority
> approval UI, Chrome extension) are built, gated, deployed (Vercel + Supabase),
> and CI is green. Per-subject dashboard with charts/CSV is live. Everything
> below is **not yet done**.

---

## P0 — Should fix before this touches anything resembling a real case

These are the gaps that most directly undermine the "this is a legal
evidentiary system" premise, not just a missing feature.

- [ ] **`TODO(AUDIT-ATOMICITY)`** — appears in ~15 places (`authorizations/route.ts`,
  `authorizations/[id]/review/route.ts`, `authorizations/[id]/revoke/route.ts`,
  `extensions/[id]/decide/route.ts`, `cases/route.ts`, `evidence/ingest/route.ts`,
  `exports/*/route.ts`, `filter-team/reviews/route.ts`, `officer/accept-invite/route.ts`,
  `officer/home-jurisdiction/route.ts`, `subjects/route.ts`). The row mutation
  and its `appendAudit()` call are two separate round-trips; if the audit
  write fails after the mutation succeeds, you get a real state change with
  no audit record (or vice versa with some compensating-delete attempts that
  themselves aren't transactional). Real fix: wrap each in a single plpgsql
  function so both commit or neither does. This is the single most-repeated
  gap in the whole codebase — worth doing as one focused pass across all
  call sites rather than one at a time.
- [ ] **`TODO(REVIEW-COMMITTEE-QUORUM)`** — India §69 warrants require a real
  quorum (Cabinet Secretary + Secretary Legal Affairs + Secretary
  Telecommunications per IT Rules 2009 R.22); prototype allows single-user
  approval (`packages/dummy-verification/src/review-committee.ts`,
  `packages/legal-framework/src/india/index.ts`). Already labeled
  `quorumMet=false` in the dummy token, so at least it's honestly flagged —
  but single-signature approval is currently load-bearing for the entire
  "warrant is ACTIVE" gate.
- [ ] **`TODO(ESIGN-VERIFICATION)`** — no uploaded signed-order PDF (India,
  US, or UK) is cryptographically verified against the issuing authority's
  actual signing certificate. Only the SHA-256 hash of whatever file is
  uploaded gets stored (`authorization.signed_order_document_hash`). Anyone
  could upload any PDF today.
- [ ] **`TODO(FILTER-TEAM-INDEPENDENCE)`** — nothing technically stops the
  same officer from holding both an investigating role and `FILTER_TEAM`,
  which defeats the entire point of independent privilege review. Flagged
  in 6+ places (`lib/db.ts`, `lib/api.ts`, `middleware.ts`, `filter-team/*`,
  `role` table comment, Android's `PrivilegeHint.kt`).
- [ ] **`TODO(HARDWARE-KEYSTORE)` / `TODO(PLAY-INTEGRITY)`** — evidence
  signatures and device attestation are both software-only stubs (Android
  falls back to a TEE-backed key if StrongBox isn't available; the Chrome
  extension is honestly marked `UNATTESTED`). Accepted as a documented
  prototype gap, but worth tracking as the single biggest blocker to BSA §63
  admissibility in an actual court.
- [ ] **`TODO(UIDAI-INTEGRATION)`** — subject identity verification
  (`officer.identity_verified`, `subject.identity_refs`) is a dummy flag, not
  a real Aadhaar e-KYC call.

## P1 — Real functional/UX gaps worth closing soon

- [ ] **No reject path for initial warrant approval** (documented in
  `docs/PROCESS_FLOW.md`) — `/api/authorizations/[id]/review` only
  implements unconditional approve. A bad draft can only sit in
  `PENDING_REVIEW` forever, never be formally rejected.
- [ ] **R.22 periodic 2-monthly re-review has no audit trail** —
  `review-approve/route.ts` never calls `appendAudit`. Also has no UI yet
  (API-only). Related to the AUDIT-ATOMICITY item above but distinct: this
  one is a complete miss, not a race condition.
- [ ] **`TODO(SUPPORT-HOME-JURISDICTION-CHANGE-VIA-ADMIN)` /
  `TODO(SUPPORT-JURISDICTION-CHANGE-VIA-ADMIN-GRANT)`** — an officer's home
  jurisdiction is set once at onboarding and then effectively permanent;
  there's no admin-grant workflow to change it (`officer/me/route.ts`,
  `officer/home-jurisdiction/route.ts`, onboarding page).
- [ ] **`TODO(OFFICER-JURISDICTION-GRANT-REQUEST-UI)`** — the backend
  supports cross-jurisdiction grants (`officer_jurisdiction_grant` table,
  used throughout RLS) but there's no UI for an officer to request one —
  shows as a disabled/TODO button in `authorizations/page.tsx` and
  `filter-team/page.tsx` (2 places).
- [ ] **`TODO(CROSS-JURISDICTION-FILTER-UI)`** — `cases/page.tsx` has a
  disabled filter control waiting on the above.
- [ ] **`TODO(OFFENCE-TAXONOMIES)`** — case creation's "Offences" field is
  free text; no searchable per-jurisdiction taxonomy picker
  (`cases/new/create-form.tsx`).
- [ ] **`TODO(COUNSEL-PORTAL)`** — defense counsel's objection filing
  (`counsel/objections/route.ts`) currently accepts *any* token as a stub
  magic-link — not validated against a real signed short-lived JWT yet.
  This is a real auth gap on a route meant to be externally reachable.
- [ ] **No case-level offense taxonomy / per-subject Filter Team visibility
  in UI** — partially closed this session (added a "pending Filter Team
  review" count + link on the subject dashboard), but the Filter Team
  independence enforcement itself (see P0) remains open.
- [ ] **Android: ack-then-advance chain fragility** — flagged during Phase 3's
  design gate: `EvidenceRecorder.kt` advances its local hash-chain tail
  immediately on record, before the upload succeeds (and that tail is
  in-memory only, lost on process death). The new Chrome extension correctly
  implements the safer ack-then-advance pattern; Android was not retrofitted
  this session.
- [ ] **`TODO(INGEST-TOKEN-REFRESH)`** — if a device's ingest token is ever
  revoked/rotated, there's no automatic re-enrollment recovery path; it'll
  just loop on 401 until someone notices and manually re-enrolls the device.

## P2 — Deferred-by-design, lower urgency

- [ ] **`TODO(EVIDENCE-PAYLOAD-STORAGE)`** — evidence payloads aren't
  actually moved to cold storage yet; `payload_ref` is currently always
  `null` in the ingest route.
- [ ] **`TODO(EXTERNAL-ANCHORING)`** — the audit-chain Merkle-root anchoring
  to an external timestamping authority (OpenTimestamps/Bitcoin or a
  govt-notified registry) has the DB-side storage/verification functions
  built (`audit_anchor` table, `create_audit_anchor()`,
  `verify_audit_anchor()`) but the actual scheduled POST to an external
  service (`scripts/anchor-audit-root.ts`) doesn't exist yet.
- [ ] **`TODO(NIGHTLY-SEAL)`** — no nightly job moves evidence under
  expired/revoked authorizations into sealed cold storage.
- [ ] **`TODO(US-OVERSIGHT-DIRECTORY)` / `TODO(UK-JUDICIAL-COMMISSIONER-DIRECTORY)`**
  — the Competent Authority allowlist for US judges / UK Judicial
  Commissioners is a hardcoded stub list, not a real resolved directory.
- [ ] **`TODO(JUDICIAL-DIRECTORY-INTEGRATION)`** — same gap, US adapter side.
- [ ] **US/UK legal-framework scope gaps**, all explicitly out-of-scope and
  guarded against (adapter refuses these authorization types), tracked for
  future: `TODO(US-FISA-OUT-OF-SCOPE-GUARD)`, `TODO(UK-BULK-POWERS-OUT-OF-SCOPE-GUARD)`,
  `TODO(US-STATE-WIRETAP-OVERLAY)`, `TODO(US-STATE-PRIVACY-OVERLAY)`,
  `TODO(UK-SCOTLAND-NI-OVERLAY)`.
- [ ] **`TODO(UK-S56-CLOSED-MATERIAL-PACKET)`** — UK IPA §56 requires a
  closed-material handling packet (intercept material is generally
  inadmissible in open court) instead of the normal export certificate;
  placeholder branch exists, template needs Home Office sign-off.
- [ ] **`TODO(US-SORN-REGISTRATION)` / `TODO(US-SCA-PARALLEL-PROCESS)`** —
  US federal-agency System of Records Notice and Stored Communications Act
  parallel-process tracking, both out of scope for MVP.
- [ ] **`TODO(PRIVILEGE-REGISTRY-VERIFICATION)`** — Android's on-device
  privilege-contact hints aren't verified against the server registry yet
  (`PrivilegeHint.kt`, 3 occurrences).
- [ ] **`TODO(COURT-ORDER-PARSER)`** — duration/scope isn't auto-extracted
  from the uploaded court order PDF in any jurisdiction adapter; officer
  enters it manually.
- [ ] **`TODO(STATUTE-URLS)`** — statute citations don't link to canonical
  India Code / U.S. Code / legislation.gov.uk URLs yet.
- [ ] **`TODO(RLS-JURISDICTION-DENORM)`** — evidence rows don't carry their
  own jurisdiction column; it's resolved via a join to the parent
  authorization every time. Flagged as a possible future performance
  optimization, not a correctness bug.
- [ ] **`TODO(RLS-INGEST-ROLE)`** — the evidence-ingest service runs as
  generic `service_role`/SYSTEM rather than a dedicated INGEST role with
  narrower RLS grants.
- [ ] **`TODO(WIRE-TO-FORENSIC-CONSOLE)`** on the Android side — several
  stub clients (`AuthorizationClient`, `StubAuthorizationClient`,
  `TimeWindow`, `SupervisionForegroundService`, `SelfTamperReceiver`) still
  need to be wired to live forensic-console endpoints rather than stub
  responses — worth auditing as part of Phase 4 (mobile parity pass).
- [ ] **Two-person admin creation / admin MFA** (`docs/ADMIN_BOOTSTRAP.md`):
  `TODO(TWO-PERSON-ADMIN-CREATION)` is actually already enforced for officer
  *invitations* (2-admin co-approval, built and verified this session) —
  but creating a **new ADMIN** account itself still has no equivalent
  dual-control, and `TODO(ADMIN-MFA)` (2FA/hardware key for ADMIN role) is
  fully open.
- [ ] **Multi-device / co-accused support** (`docs/design/MULTI_DEVICE_COACCUSED.md`)
  — join-table schema, shared-device foreground-account detection, and a
  warrant-bundle grouping UI are all designed but not built.
- [ ] **Oversight dashboard** (`docs/design/OVERSIGHT_DASHBOARD.md`) — only
  2 of its 6 planned views exist today (pending-authorization-approvals,
  pending-extension-decisions, both built in Phase 2). Still missing:
  active-warrants view, expiring-soon view, expired/revoked register,
  anomaly-detection panel, PDF report template, materialized-view refresh
  job.
- [ ] **Device failure-mode handling** (`docs/design/DEVICE_FAILURE_MODES.md`)
  — heartbeat cron, bail-violation court-notification channel,
  re-enrollment ceremony after factory reset, cross-jurisdiction roaming/MLA
  handling — all designed, none built.
- [ ] **Retention sealing** (`docs/design/RETENTION_SEALING.md`) — key-wrapping
  design for sealed evidence, three-key unsealing-order ceremony UI, and the
  retention cron SQL migration are all still design-only.
- [ ] **Subject notification** (`docs/design/SUBJECT_NOTIFICATION.md`) —
  currently a `MAGIC_LINK_STUB` delivery method only; real registered-post +
  email + counsel-portal delivery channels aren't built, nor is US
  judicial-delay-order support for postponing notification.

## P3 — Chrome extension (Phase 3) follow-ups, already flagged at build time

- [ ] Real browser-activity capture (`KEYSTROKE_BATCH`/`APP_EVENT`/
  `COMMS_METADATA`) — the extension currently only proves the submission
  pipeline against a placeholder input (marked `synthetic: true`, blocked
  from legal export). This is net-new surveillance capability with no
  Campus precedent and needs its own dedicated design gate before any code
  is written — do not casually bolt this on.
- [ ] Privilege-flag heuristic — currently hardcoded `UNKNOWN` always by
  deliberate Oracle-reviewed decision (a false negative there is worse than
  the Filter Team queue-volume cost of always quarantining). Revisit only
  if queue volume becomes an operational problem.
- [ ] Case-evidence list UI doesn't yet visually badge `synthetic: true` rows
  outside the subject dashboard (subject dashboard does this already) —
  minor, non-blocking per Oracle's last review.

## Housekeeping / documentation-only (cheap to close, low risk)

- [ ] `TODO(AUDIT-ACTIONS)` — `cases/route.ts` reuses `AUTH_ISSUE` as the
  audit action for case creation; a first-class `CASE_OPEN` action would be
  more accurate.
- [ ] `TODO(WIRE-TO-SCHEMA)` references in `lib/entities.ts`,
  `lib/parent-store.ts` (the latter is explicitly marked "delete after
  audit-chain and warrant-gated ingest land" — both have landed; this file
  may be dead code worth removing).
- [ ] `TODO(SUBJECT-FORM)` comment in `cases/[caseId]/subjects/new/page.tsx`
  suggests the subject registration form itself may need a review pass for
  completeness.
- [ ] `TODO(TAMPER-EVENT-STORAGE)` — tamper events don't have a dedicated
  `device_lifecycle_event` table yet.
- [ ] `TODO(BAR-COUNCIL-FEED)` — the privilege-contact registry's "legal"
  category isn't verified against a real bar council feed.

---

## Suggested order of attack (my recommendation, not mandatory)

1. **AUDIT-ATOMICITY pass** — highest leverage, same fix pattern repeated
   ~15 times, directly strengthens the "trustworthy audit trail" premise
   the whole system is built on.
2. **No-reject-path for initial approval** + **R.22 audit gap** — both
   already scoped from earlier conversation, both small, both close real
   process holes.
3. **FILTER-TEAM-INDEPENDENCE enforcement** — a real RLS/role-design
   problem, not just a missing feature; worth an Oracle design gate before
   touching it given how many places reference it.
4. **Phase 4**: mobile app end-to-end parity pass — audit all the
   `TODO(WIRE-TO-FORENSIC-CONSOLE)` stub clients against what's now live in
   production.
5. Everything else, roughly in the P1 → P2 → P3 order above.
