# supabase/

Postgres schema for **SendWiseForensic** (prototype). Managed as Supabase migrations.

> **PROTOTYPE ONLY** — see [`docs/PROTOTYPE_NOTICE.md`](../docs/PROTOTYPE_NOTICE.md).
> Do NOT point this at any environment that contains real subject data.

## Migration order

Migrations are timestamp-prefixed and applied in filename order:

| # | File | Purpose |
|---|---|---|
| 1 | `20260831110900_enums.sql` | Postgres ENUMs + `pgcrypto` / `uuid-ossp`. |
| 2 | `20260831110901_officers_and_roles.sql` | `role`, `officer`, `officer_role`; seeded RBAC roles (ENTITY_MODEL §2). |
| 3 | `20260831110902_case_subject_device.sql` | `case`, `case_officer`, `subject`, `device`. |
| 4 | `20260831110903_authorization.sql` | `authorization` with JSONB scope + statute-referenced CHECKs. |
| 5 | `20260831110904_monitoring_session_evidence.sql` | Session/evidence/export/filter/privilege/objection + hard invariants (ENTITY_MODEL §3.1-§3.5). |
| 6 | `20260831110905_audit_log.sql` | Append-only hash-chained `audit_log`, `p_append_audit()`. |
| 7 | `20260831110906_rls_and_query_gates.sql` | RLS on `evidence`, `monitoring_session`, `authorization` with scope-rewriting policies (ENTITY_MODEL §3.4). |
| 8 | `20260831110907_auto_expiry.sql` | `expire_authorizations()` + optional `pg_cron` schedule. |
| 9 | `20260831120000_jurisdiction_fields.sql` | Jurisdiction fields, immutability triggers, `current_officer_jurisdictions()`, cross-jurisdiction RESTRICTIVE SELECT policies. |
| 10 | `20260901000000_admin_enum.sql` | Admin role — enum-add-only (must run standalone before #11, same-transaction Postgres constraint). |
| 11 | `20260901000001_admin_role_and_invitations.sql` | Admin role + officer invitation flow. |
| 12 | `20260902000000_officer_self_read_rls.sql` | Officer + role self-read RLS policies. |
| 13 | `20260902000100_officer_invitation_admin_rls.sql` | `officer_invitation` RLS policies reworked to match the actual schema. |
| 14 | `20260902000200_scoped_admin_and_coapproval.sql` | Jurisdiction-scoped admins + dual-control (co-approval). |
| 15 | `20260903000000_counsel_review_extension.sql` | Counsel access + Review Committee co-sign + warrant extension flows. |
| 16 | `20260904000000_external_anchor_layer_l9.sql` | External anchoring layer for the audit chain. |
| 17 | `20260904000100_extension_cap_trigger.sql` | Cap/trigger on warrant extension requests. |
| 18 | `20260905000000_device_enrollment_enum.sql` | Device enrollment — enum-add-only (must run standalone before #19). |
| 19 | `20260905000001_device_enrollment.sql` | `device_enrollment_code` table, `device.ingest_token_hash` — officer-issued, single-use, 30-min-TTL enrollment codes (Phase 1). |
| 20 | `20260906000000_authorization_oversight_write.sql` | Jurisdiction-scoped UPDATE policy on `authorization` for `REVIEW_COMMITTEE`/`COMPETENT_AUTHORITY` (Phase 2 remediation — this was previously missing entirely, approve/deny UPDATEs would silently no-op under RLS). |
| 21 | `20260906000001_extension_decide_audit_enum.sql` | `EXTENSION_APPROVE`/`EXTENSION_DENY` audit_action values — enum-add-only (Phase 2 remediation). |
| 22 | `20260907000000_evidence_synthetic_marker.sql` | `evidence.synthetic` marker column, defaults false — distinguishes non-production pipeline-validation submissions (e.g. the Phase 3 Chrome extension) from real captured evidence; hard-blocked from legal export. |

`seed.sql` inserts one dummy officer per role, tagged with the string **"PROTOTYPE — dummy identities"** in comments.

## Apply

Local Supabase stack:

```bash
supabase start
supabase db reset          # drops, re-applies migrations, then runs seed.sql
```

Remote project:

```bash
supabase link --project-ref <ref>
supabase db push
# Seed is not run automatically against a linked project — do it deliberately:
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

## RLS assumptions

Policies read Supabase JWT claims:

- `role` — one of the `role_name` ENUM values (e.g., `INVESTIGATING_OFFICER`).
- `officer_id` — UUID of the `officer` row for the caller.

Background jobs and the ingest service run under Supabase `service_role` and are treated as `SYSTEM`
(the default when no `role` claim is present). See `auth_role()` / `auth_officer_id()` in migration 7.

## Auto-expiry scheduling

Migration 8 tries to schedule `public.expire_authorizations()` every minute via `pg_cron`. If the
extension is not available (some managed environments), the migration emits a `NOTICE` and you must
wire a **Supabase Scheduled Function** to call `select public.expire_authorizations();` every minute.

## Prototype limitations

The schema deliberately does **not** enforce these invariants at the DB layer; they are the API
layer's responsibility (see `docs/ENTITY_MODEL.md` §3.6 and `docs/PROTOTYPE_NOTICE.md`):

- Review Committee quorum on `authorization` activation — `TODO(REVIEW-COMMITTEE-QUORUM)`.
- Cumulative duration cap of 180 days per subject per `IT_RULES_2009_R11`.
- Presence of at least one `SUPERVISING_OFFICER` in `evidence_export.approved_by` (only cardinality
  ≥ 2 is enforced at the DB).
- E-Sign certificate verification on `signed_order_document_hash` — `TODO(ESIGN-VERIFICATION)`.
- Play Integrity attestation on `device.device_fingerprint` — `TODO(PLAY-INTEGRITY)`.
- Hardware-backed evidence signature verification — `TODO(HARDWARE-KEYSTORE)`.
- Filter Team organizational independence — `TODO(FILTER-TEAM-INDEPENDENCE)`.
- External anchoring of the audit chain — `TODO(EXTERNAL-ANCHORING)`.
- Nightly sealed cold-storage move for expired/revoked authorizations — `TODO(NIGHTLY-SEAL)`.

All statute-linked columns carry a `COMMENT ON` with the statute code (e.g., `IT_ACT_S69`,
`IT_RULES_2009_R11`, `BSA_S63`, `DPDPA_S8`, `PUTTASWAMY_2017`).
