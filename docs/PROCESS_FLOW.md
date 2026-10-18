# SendWiseForensic — End-to-End Process Flow

How a case moves from creation to evidence export, who does what, and how many
approvals are required at each gate. This reflects what is actually
implemented in code (`forensic-console/app/api/**`), not just the design docs.

> Jump to: [Roles](#roles) · [Step-by-step flow](#step-by-step-flow) ·
> [Approval-count summary table](#approval-count-summary) ·
> [Device/evidence pipeline](#device-enrollment--evidence-pipeline-separate-track) ·
> [Known gaps](#known-gaps--prototype-limitations)

---

## Roles

Ten roles exist (`role` table, seeded in `20260831110901_officers_and_roles.sql`).
One officer can hold more than one role (`officer_role` is many-to-many).

| Role | Purpose |
|---|---|
| `INVESTIGATING_OFFICER` | Case officer. Files warrant requests, creates cases/subjects, reviews in-scope evidence, issues device-enrollment codes, requests extensions. |
| `SUPERVISING_OFFICER` | Signs off before a request leaves the police organization. Can do everything an Investigating Officer can, plus approve exports/revoke. |
| `COMPETENT_AUTHORITY` | IT_ACT_S69: Union/State Home Secretary or delegate. Legally issues §69 authorizations (the actual warrant-granting power, outside this system — see "Known gaps"). Can revoke. |
| `REVIEW_COMMITTEE` | IT_RULES_2009_R22: the in-app approval gate for a drafted warrant, the 2-monthly periodic re-review, and warrant-extension decisions. |
| `FILTER_TEAM` | Independent reviewers of privilege-flagged content (attorney-client, medical, clergy, spousal) before investigators can see it. |
| `PROSECUTOR` | Read-only, case-scoped. Sees exports directed to prosecution. |
| `DEFENSE_COUNSEL` | Subject-side. Sees warrant scope/metadata (not raw evidence), can file objections. Must request access first (see Counsel flow). |
| `JUDICIAL_AUDITOR` | Cross-case, read-only oversight (judge / notified authority). |
| `DPO` | Data Protection Officer. Grievances, DPDPA compliance. |
| `ADMIN` | Account management only — invites/removes officers, co-approves other admins' invitations. **Cannot** draft or approve warrants itself (separation of duties). |
| `SYSTEM` | Automated jobs only (expiry sweep, quarantine routing, audit-chain anchoring). Not a human role. |

---

## Step-by-step flow

### 0. Officer onboarding (one-time, per officer)
1. An **ADMIN** invites a new officer (`POST /api/admin/officers/invite`) — sets name, email, designation, and **exactly one role** from the list above (not ADMIN itself via this form).
2. A **second, different ADMIN in the same jurisdiction** must co-approve the invitation (`POST /api/admin/officers/coapprove`) — an admin cannot approve their own invite (enforced by DB trigger + code check). This is a **2-admin dual-control** step.
3. Only after co-approval does the magic-link invite email actually fire.
4. New officer logs in, sets `home_jurisdiction` (`/onboarding/jurisdiction`) — this single value gates almost everything downstream (RLS jurisdiction scoping via `current_officer_jurisdictions()`).

**Approvals needed: 2 distinct ADMIN accounts** (not the same person twice).

---

### 1. Case + subject creation
1. `INVESTIGATING_OFFICER` or `SUPERVISING_OFFICER` creates a **case** (`/cases/new`) — external case reference, jurisdiction.
2. Same roles create a **subject** under that case (`/subjects/new` or `cases/[caseId]/subjects/new`) — the actual monitored individual.

**Approvals needed: 0** — single officer, no second sign-off at this stage.

---

### 2. Authorization (warrant) drafting
1. `INVESTIGATING_OFFICER` or `SUPERVISING_OFFICER` drafts the authorization (`/authorizations/new`) for a subject: statute references (e.g. `IT_ACT_S69`, `IT_RULES_2009_R3`, `IT_RULES_2009_R11`), data-category scope, proportionality checklist, signed-order PDF upload (prototype: only the SHA-256 hash is stored — real signature verification is a documented TODO), expiry date.
2. This is **this is why your ADMIN-only account was rejected earlier** — ADMIN is deliberately excluded from this step.
3. On submit, the row is created with `status = PENDING_REVIEW`.

**Approvals needed so far: 0** (drafting is a single-officer action; the gate is the next step).

---

### 3. Initial warrant approval
1. A `REVIEW_COMMITTEE` member opens the pending-approval queue (`/authorizations`) and approves (`POST /api/authorizations/[id]/review`).
2. This flips `status: PENDING_REVIEW → ACTIVE`. Only once `ACTIVE` can collection legally begin.
3. **No reject path currently exists** for this step (known, documented gap — see below) — a bad draft can only be left pending, not formally rejected, today.

**Approvals needed: 1 REVIEW_COMMITTEE member.**

---

### 4. Device enrollment (can happen any time after the warrant is `ACTIVE`)
See the [separate pipeline section](#device-enrollment--evidence-pipeline-separate-track) below — this is a different officer/device interaction, not a committee approval step.

---

### 5. Ongoing: periodic 2-monthly re-review (IT Rules 2009 R.22)
1. Every 2 months, a `REVIEW_COMMITTEE` member re-reviews the still-active warrant (`POST /api/authorizations/[id]/review-approve`), approve or reject with reason.
2. This updates a **separate** `review_status` column (distinct from the warrant's main `status`) — it's a recurring compliance check, not a one-time gate.
3. **Known gap:** this route does not yet call the audit-log append function (`appendAudit`) — flagged, deferred, not yet fixed (tracked in `.slim/deepwork/forensic-port.md`). No UI exists for it yet either (API-only today).

**Approvals needed: 1 REVIEW_COMMITTEE member, recurring every 2 months.**

---

### 6. Warrant extension (only if more time is needed before expiry)
1. Any officer (role-wise: whoever is assigned to the case) can **request** an extension (`POST /api/authorizations/extensions`) — new expiry date, justification, refreshed proportionality, statute reference.
2. A `REVIEW_COMMITTEE` member **decides** (`POST /api/authorizations/extensions/[id]/decide`) — approve (extends `expires_on`) or deny (reason required).
3. India-specific: a DB trigger hard-caps cumulative extended duration at **180 days total** (IT Rules 2009 R.11) for §69 judicial warrants — the decide route itself will fail if this is exceeded. No such cap for US/UK warrant types (no statutory equivalent).

**Approvals needed: 1 REVIEW_COMMITTEE member per extension request.**

---

### 7. Revocation (can happen at any point, ends collection immediately)
1. Can be triggered by `REVIEW_COMMITTEE`, `SUPERVISING_OFFICER`, or `COMPETENT_AUTHORITY` (any one of the three — not all three).
2. Immediately stops all evidence ingestion for that warrant (enforced server-side on every evidence submission, not just at the UI level).

**Approvals needed: 1**, from any of those 3 roles.

---

### 8. Privileged-content filtering (only for evidence flagged non-`NONE`)
1. Evidence batches tagged `privilegeFlag ≠ NONE` (LEGAL / MEDICAL / CLERGY / SPOUSAL / UNKNOWN) are auto-quarantined (`quarantine_status: PENDING_FILTER`) the moment they're ingested — before any investigator can see them.
2. A `FILTER_TEAM` member reviews the quarantined queue (`/filter-team`) and releases or suppresses each item (`POST /api/filter-team/reviews`).
3. **Known gap:** "Filter Team organizational independence" from the investigating team is a documented, not-yet-enforced invariant (`TODO(FILTER-TEAM-INDEPENDENCE)`) — today nothing technically stops the same officer from also holding `FILTER_TEAM`.

**Approvals needed: 1 FILTER_TEAM member per quarantined item.**

---

### 9. Defense counsel access (parallel track, not required for the case to proceed)
1. An external defense counsel **requests** access themselves (`POST /api/counsel/request-access`, public endpoint — name, bar council ID, email, case ref, jurisdiction, reason).
2. An `ADMIN` in that jurisdiction **approves or rejects** (`POST /api/counsel/decide`) — approval presumably triggers an invite (mirrors the officer-invite flow).
3. Once granted, counsel can view warrant scope/metadata and file objections (`POST /api/counsel/objections`) — not raw evidence content.

**Approvals needed: 1 ADMIN** (no dual-control here, unlike officer invites).

---

### 10. Evidence export (for court submission — the highest-stakes step)
1. An export request is created, then:
   - **Approve** (`POST /api/exports/[id]/approve`): `INVESTIGATING_OFFICER` or `SUPERVISING_OFFICER`. The `evidence_export.approved_by` array requires **at least 2 distinct approvers, with at least 1 being a `SUPERVISING_OFFICER`** (DB-level CHECK constraint — a single approver, or two Investigating Officers with no Supervising Officer, is rejected).
   - **Generate the BSA §63 certificate** (`POST /api/exports/[id]/generate`): `INVESTIGATING_OFFICER` or `SUPERVISING_OFFICER`, only after the export is `APPROVED`. This hard-rejects if any included evidence row is still quarantined or marked `synthetic` (pipeline-test data, never real evidence — see Phase 3 notes).
2. The generated certificate includes the full verified hash chain, device platform/signing info, and signing officer identity.

**Approvals needed: ≥ 2 total (at least 1 must be SUPERVISING_OFFICER) to approve, then 1 of the same two roles to generate the final certificate.** This is the strictest gate in the whole system.

---

## Approval-count summary

| Step | Who | How many |
|---|---|---|
| Officer invitation | 2 different ADMINs (same jurisdiction) | 2 |
| Case / subject creation | 1 Investigating/Supervising Officer | 1 (no second sign-off) |
| Warrant drafting | 1 Investigating/Supervising Officer | 1 (no second sign-off) |
| **Initial warrant approval** | 1 Review Committee member | **1** |
| Periodic 2-monthly re-review | 1 Review Committee member, recurring | 1 per cycle |
| Extension request → decision | 1 officer requests, 1 Review Committee member decides | 1 |
| Revocation | 1 of {Review Committee, Supervising Officer, Competent Authority} | 1 |
| Privileged-content release | 1 Filter Team member per item | 1 |
| Counsel access grant | 1 ADMIN | 1 |
| **Export approval** | ≥2 officers, ≥1 must be Supervising Officer | **2+** |
| Export certificate generation | 1 Investigating/Supervising Officer (post-approval) | 1 |

---

## Device enrollment + evidence pipeline (separate track)

This runs independently of the committee-approval chain above, once a warrant is `ACTIVE`:

1. `INVESTIGATING_OFFICER`/`SUPERVISING_OFFICER` issues a single-use, 30-minute enrollment code bound to that specific active warrant + subject (`/authorizations/[id]` page → enrollment-code form).
2. The officer installing the Android app types that code in (`EnrollmentActivity`) → app calls `POST /api/devices/enroll` → server issues a per-device ingest token (shown once, never retrievable again) and binds the device to the subject.
3. The app then continuously records evidence, hash-chains it locally, signs it, and uploads via `POST /api/evidence/ingest` (Bearer-token authenticated). The server re-validates the warrant is still `ACTIVE` and within its time window on **every single submission** — a revocation or expiry stops ingestion immediately, not just at next login.
4. The Chrome extension (Phase 3, separate from the Android flow) follows the same enroll → sign → hash-chain → submit pattern but currently only proves the pipeline works (placeholder `RISK_DETECTION` classification input, marked `synthetic: true`, permanently barred from ever appearing in a court export).

No committee approval is needed per-enrollment or per-evidence-batch — the warrant's own `ACTIVE` status + expiry window is the sole ongoing gate.

---

## Known gaps / prototype limitations

- No formal **reject** path for initial warrant approval (step 3) — only approve exists server-side.
- Periodic R.22 review (step 5) doesn't yet write an audit-log entry — a real integrity gap, flagged, not fixed.
- Filter Team organizational independence (step 8) is not technically enforced — nothing stops overlap with the investigating team today.
- `COMPETENT_AUTHORITY`'s actual legal signing authority (the real warrant-issuing power under IT_ACT_S69) happens **outside** this system — the signed-order PDF upload only stores a hash of whatever document is uploaded; real digital-signature verification is a documented TODO, not yet built.
- Device/app attestation (Play Integrity on Android, any attestation on the Chrome extension) is an accepted, explicitly-documented prototype gap — both report honest "unattested/software" stubs rather than faking a hardware-backed guarantee.
