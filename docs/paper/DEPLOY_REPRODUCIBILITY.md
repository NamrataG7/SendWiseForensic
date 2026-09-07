# Deploy & Reproducibility — SendWiseForensic

> One-page reproducibility appendix for the paper. Every step verified. Extends `docs/DEPLOY.md` with exact verification checkpoints so a reviewer can rebuild the system in ~1 hour from a clean laptop.

---

## 1. What "reproducible" means for this paper

Reviewers expect that they (or an evaluator) can:

1. Clone the repo.
2. Provision the infrastructure (Supabase + Vercel free tiers).
3. Reach a running instance with the same behavior described in the paper.
4. Run the micro-benchmark and get the paper's numeric results ± noise.
5. Follow the scenario walkthrough and see the same UI states.

We claim reproducibility for (1) - (5). Not reproducible for: real magic-link email delivery (rate-limited by Supabase free tier — documented) and hardware-backed Android Keystore (StrongBox required, ships only on Pixel and Samsung — documented).

---

## 2. Prerequisites (evaluator's laptop)

| Requirement | Version | Purpose |
|---|---|---|
| Node.js | 20.x | Runtime for Next.js console and packages |
| npm | 10.x | Package manager |
| Docker | 24.x | Local Postgres for benchmark (optional if using cloud Supabase) |
| Git | any | Clone repo |
| `gh` CLI | any (optional) | If reviewer wants to open PRs |
| Free Vercel account | — | Console hosting |
| Free Supabase account | — | Postgres + auth |
| Android Studio | 2023.1+ (optional) | Only if reviewer builds the Android APK from source |
| A Chromium browser | any recent | Console access |

Cummins/reviewers should have all of this. Docker is only needed if the reviewer wants to run the micro-benchmark against a local Postgres instead of their own Supabase.

Total install time on a clean laptop: ~30 minutes.

---

## 3. Reproduction steps — verified

### Step A — Clone repo

```bash
git clone https://github.com/NamrataG7/SendWiseForensic.git
cd SendWiseForensic
```

**Verification checkpoint A:** `ls docs/paper/` shows 5 files (this doc + 4 others).

### Step B — Create Supabase project

1. Sign in at https://supabase.com/dashboard.
2. Create a new project. Note down `NEXT_PUBLIC_SUPABASE_URL` (Settings → API → Project URL), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon public), `SUPABASE_SECRET_KEY` (service_role secret; mark sensitive).

**Verification checkpoint B:** Project provisions in ~2 minutes. All three keys visible in the API tab.

### Step C — Apply migrations in order

In Supabase SQL Editor (or via `psql` with the direct connection string), run these files **in filename order**. Note that migration 10 was split into two files (10a `_admin_enum.sql` runs alone, 10b `_admin_role_and_invitations.sql` runs after):

```
supabase/migrations/20260831110900_enums.sql
supabase/migrations/20260831110901_officers_and_roles.sql
supabase/migrations/20260831110902_case_subject_device.sql
supabase/migrations/20260831110903_authorization.sql
supabase/migrations/20260831110904_monitoring_session_evidence.sql
supabase/migrations/20260831110905_audit_log.sql
supabase/migrations/20260831110906_rls_and_query_gates.sql
supabase/migrations/20260831110907_auto_expiry.sql
supabase/migrations/20260831120000_jurisdiction_fields.sql
supabase/migrations/20260901000000_admin_enum.sql            (run alone)
supabase/migrations/20260901000001_admin_role_and_invitations.sql
supabase/migrations/20260902000000_officer_self_read_rls.sql
supabase/migrations/20260902000100_officer_invitation_admin_rls.sql
supabase/migrations/20260902000200_scoped_admin_and_coapproval.sql
supabase/migrations/20260903000000_counsel_review_extension.sql
```

Then apply `supabase/seed.sql` (base roles only after PR #32).

**Verification checkpoint C:** `SELECT COUNT(*) FROM role;` returns 10. `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'role_name'::regtype;` includes `'ADMIN'`.

### Step D — Configure Supabase Auth

1. Authentication → URL Configuration:
   - Site URL: `https://<your-vercel-domain>` (no trailing slash, no path)
   - Redirect URLs: add `https://<your-vercel-domain>/**` as wildcard
2. Authentication → Email Auth → set "Email link expiry" to 3600 seconds.

**Verification checkpoint D:** Both settings saved successfully.

### Step E — Bootstrap two admins (dual-control)

Follow `docs/ADMIN_BOOTSTRAP.md`:

1. Supabase Dashboard → Authentication → Users → Add user (Auto Confirm ON) — create two admin emails.
2. Copy each user's UID.
3. Run the SQL block from `docs/ADMIN_BOOTSTRAP.md` twice (once per admin) with UIDs substituted.

**Verification checkpoint E:**

```sql
SELECT o.email, o.full_name, r.name AS role
FROM officer o
JOIN officer_role orl ON orl.officer_id = o.id
JOIN role r ON r.id = orl.role_id
WHERE r.name = 'ADMIN';
```

Returns exactly 2 rows.

### Step F — Deploy console to Vercel

1. `gh repo fork NamrataG7/SendWiseForensic --clone=false` OR use your own fork.
2. Import the fork in Vercel → New Project.
3. Set env vars:

| Env var | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL | Production + Preview + Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon public key | All |
| `NEXT_PUBLIC_PROTOTYPE` | `true` | All |
| `SUPABASE_SECRET_KEY` | Service role secret | Production + Preview (Sensitive) |

4. Set Root Directory to `forensic-console`. Framework: Next.js. Node: 20.x.
5. Deploy.

**Verification checkpoint F:** Vercel deployment succeeds. Visit `https://<domain>/` — sees the landing page with three sign-in cards + PROTOTYPE red banner + JURISDICTION status bar.

### Step G — Sign in as admin

Visit `https://<domain>/admin/login`. Sign in with one admin. Lands at `/admin` with officer management interface.

**Verification checkpoint G:** Officers table empty; TopNav shows "Officers | Invite Officer | Counsel Requests | Sign out".

### Step H — Invite officer (dual-control demo)

Follow `docs/paper/SCENARIO_WALKTHROUGH.md` steps 1-4.

**Verification checkpoint H:** Officer receives magic-link (may hit Supabase free-tier rate limit — this is documented as reproducibility caveat).

### Step I — Complete scenario walkthrough

Follow `docs/paper/SCENARIO_WALKTHROUGH.md` steps 1-24.

**Verification checkpoint I:** All 23 screenshots captured; all steps land on expected screens.

### Step J — Run micro-benchmark

Local Postgres path:

```bash
docker run --name swf-bench -e POSTGRES_PASSWORD=bench -p 5432:5432 -d postgres:16
sleep 5
for f in supabase/migrations/*.sql; do
  psql "postgres://postgres:bench@localhost:5432/postgres" -f "$f"
done
psql "postgres://postgres:bench@localhost:5432/postgres" -f supabase/seed.sql
npm install -g tsx
tsx scripts/benchmark-enforcement-layers.ts > docs/paper/results/benchmark.md
```

**Verification checkpoint J:** `docs/paper/results/benchmark.md` produced. Each layer (L1-L5) shows TNR = 100%, FPR = 0%. Sub-2 ms median latency.

### Step K — (Optional) Build Android APK

```bash
cd SupervisedKeyboardApp
./gradlew assembleDebug
```

APK at `app/build/outputs/apk/debug/app-debug.apk`. Sideload to Android device (API 26+).

**Verification checkpoint K:** APK builds without errors. Alternatively, download prebuilt APK from GitHub Actions.

---

## 4. Reproducibility limitations (state honestly in paper)

1. **Supabase free-tier email rate limits** (3-4 emails/hour). For > 3 magic-link invitations per hour, configure custom SMTP (Resend / SendGrid) — instructions in `docs/DEPLOY.md`.
2. **StrongBox hardware-backed Keystore** — requires physical Pixel or Samsung device. Emulator falls back to software key with logged warning. Documented as prototype stub.
3. **Play Integrity API** — requires Google Play publishing. Prototype logs stub verdict `PLAY_INTEGRITY_STUB`.
4. **UIDAI / Aadhaar / e-Sign** — none of these are real integrations. All are labeled with visible DUMMY banners.
5. **Judicial-signature verification** — accepts uploaded PDF + SHA-256 hash; no cryptographic verification of signing cert.
6. **Real user testing** — not performed; ethics-board approval not obtained (paper is a design paper; expert-review substitute is documented in `EXPERT_REVIEW_PROTOCOL.md`).

---

## 5. Materials for peer reviewers

Reviewers requesting to evaluate the artifact should receive:

- Repository URL: https://github.com/NamrataG7/SendWiseForensic
- This document (`DEPLOY_REPRODUCIBILITY.md`)
- Scenario walkthrough (`SCENARIO_WALKTHROUGH.md`)
- Micro-benchmark methodology (`MICRO_BENCHMARK.md`)
- One-page paper draft summary
- Guest admin credentials for the maintained live instance (email maintainer to request)

Estimated reviewer time to reproduce: 2-3 hours for full walkthrough; 30 minutes for benchmark-only verification.

---

## 6. Artifact evaluation checklist (for AE-submission if venue allows)

If the target venue offers Artifact Evaluation (ACM SIGSOFT, USENIX, etc.):

- [x] Public repository under organization control
- [x] Open-source license (MIT inherited from SendWise)
- [x] README with build + run instructions
- [x] Reproducibility appendix (this document)
- [x] Deployment guide for cloud infrastructure
- [x] Sample data for benchmark
- [ ] Docker image with pre-baked instance — not shipped; would require secret handling for Supabase keys
- [ ] Continuous integration verifying build health — GitHub Actions APK workflow exists; no Next.js CI yet
- [x] Scenario walkthrough with screenshots
- [x] Micro-benchmark script + expected results

If venue awards artifact badges (Functional, Reusable, Reproduced), we can plausibly claim Functional and Reusable. Reproduced requires an independent evaluator to actually run through this, which is what AE committees typically do.
