-- EMERGENCY FIX — confirmed live vulnerability, verified directly against
-- production via unauthenticated REST calls using only the public
-- anon/publishable key (not a secret -- it ships in every client bundle):
--   GET {supabase_url}/rest/v1/case?select=*  -> HTTP 200, full case rows
--   POST {supabase_url}/rest/v1/case          -> blocked only by a NOT NULL
--     constraint on created_by, not by any actual authorization check.
--
-- Root cause: "case", subject, evidence_export, filter_team_review, and
-- subject_objection, case_officer never had `ALTER TABLE ... ENABLE ROW
-- LEVEL SECURITY` run on them, despite case_jurisdiction_restrict already
-- existing as a policy ON "case" (20260831120000_jurisdiction_fields.sql)
-- -- a Postgres policy has ZERO effect unless RLS is enabled on that table.
-- The entire jurisdiction-isolation model (India/US/UK case data must not
-- cross-contaminate) was therefore unenforced at the DB layer for the two
-- most central entities in the system.
--
-- This migration ships ENABLE/FORCE + the full permissive policy set in
-- the SAME transaction per table (enabling RLS with only a RESTRICTIVE
-- policy and zero PERMISSIVE policies would deny-all and break every
-- legitimate read -- confirmed this is the actual Postgres semantics
-- before writing this).
--
-- Also includes two related, independently-discovered bugs fixed in the
-- same batch (same root-cause class: a write path that silently no-ops
-- under RLS while the calling route still reports success):
--   1. evidence had zero UPDATE policy for FILTER_TEAM -- the filter-team
--      release/suppress decision (applyFilterTeamDecisionToEvidence) has
--      been silently a no-op in production.
--   2. subject and evidence_export never got a jurisdiction RESTRICTIVE
--      policy at all (only "case"/"authorization"/"evidence" did), despite
--      subject.jurisdiction existing specifically to support this
--      isolation -- closed here rather than deferred.

BEGIN;

-- ============================================================
-- "case"
-- ============================================================
ALTER TABLE "case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "case" FORCE ROW LEVEL SECURITY;

CREATE POLICY case_system_all
  ON "case" FOR ALL
  USING (auth_role() = 'SYSTEM')
  WITH CHECK (auth_role() = 'SYSTEM');

CREATE POLICY case_case_scoped_read
  ON "case" FOR SELECT
  USING (
    auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER','PROSECUTOR','DPO','JUDICIAL_AUDITOR')
    AND id IN (SELECT auth_caller_cases())
  );

CREATE POLICY case_oversight_read
  ON "case" FOR SELECT
  USING (auth_role() IN ('COMPETENT_AUTHORITY','REVIEW_COMMITTEE'));

CREATE POLICY case_create
  ON "case" FOR INSERT
  WITH CHECK (
    auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER')
    AND created_by = auth_officer_id()
  );

-- ============================================================
-- subject
-- ============================================================
ALTER TABLE subject ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject FORCE ROW LEVEL SECURITY;

CREATE POLICY subject_system_all
  ON subject FOR ALL
  USING (auth_role() = 'SYSTEM')
  WITH CHECK (auth_role() = 'SYSTEM');

CREATE POLICY subject_case_scoped_read
  ON subject FOR SELECT
  USING (
    auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER','PROSECUTOR','DPO','JUDICIAL_AUDITOR')
    AND id IN (
      SELECT a.subject_id FROM "authorization" a
       WHERE a.case_id IN (SELECT auth_caller_cases())
    )
  );

CREATE POLICY subject_oversight_read
  ON subject FOR SELECT
  USING (auth_role() IN ('COMPETENT_AUTHORITY','REVIEW_COMMITTEE'));

CREATE POLICY subject_create
  ON subject FOR INSERT
  WITH CHECK (auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER'));

-- Gap close: subject carries its own immutable jurisdiction column but
-- never had a jurisdiction RESTRICTIVE filter (unlike case/authorization/evidence).
CREATE POLICY subject_jurisdiction_restrict
  ON subject AS RESTRICTIVE FOR SELECT
  USING (jurisdiction = ANY (current_officer_jurisdictions()));

-- ============================================================
-- evidence_export
-- ============================================================
ALTER TABLE evidence_export ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_export FORCE ROW LEVEL SECURITY;

CREATE POLICY evidence_export_system_all
  ON evidence_export FOR ALL
  USING (auth_role() = 'SYSTEM')
  WITH CHECK (auth_role() = 'SYSTEM');

CREATE POLICY evidence_export_case_scoped_read
  ON evidence_export FOR SELECT
  USING (
    auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER','PROSECUTOR','DPO','JUDICIAL_AUDITOR')
    AND case_id IN (SELECT auth_caller_cases())
  );

CREATE POLICY evidence_export_oversight_read
  ON evidence_export FOR SELECT
  USING (auth_role() IN ('COMPETENT_AUTHORITY','REVIEW_COMMITTEE'));

CREATE POLICY evidence_export_create
  ON evidence_export FOR INSERT
  WITH CHECK (
    auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER')
    AND case_id IN (SELECT auth_caller_cases())
    AND requested_by = auth_officer_id()
  );

CREATE POLICY evidence_export_case_scoped_update
  ON evidence_export FOR UPDATE
  USING (
    auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER')
    AND case_id IN (SELECT auth_caller_cases())
  )
  WITH CHECK (
    auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER')
    AND case_id IN (SELECT auth_caller_cases())
  );
-- Intentionally no predicate on approved_by cardinality/SUPERVISING_OFFICER
-- presence here -- that invariant is already enforced by a DB CHECK
-- constraint plus app-layer logic; encoding it again in RLS would be
-- redundant and risks silently diverging from that logic over time.

-- Gap close: no jurisdiction RESTRICTIVE filter existed for evidence_export.
CREATE POLICY evidence_export_jurisdiction_restrict
  ON evidence_export AS RESTRICTIVE FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "case" c
       WHERE c.id = evidence_export.case_id
         AND c.jurisdiction = ANY (current_officer_jurisdictions())
    )
  );

-- ============================================================
-- filter_team_review
-- ============================================================
ALTER TABLE filter_team_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE filter_team_review FORCE ROW LEVEL SECURITY;

CREATE POLICY filter_team_review_system_all
  ON filter_team_review FOR ALL
  USING (auth_role() = 'SYSTEM')
  WITH CHECK (auth_role() = 'SYSTEM');

CREATE POLICY filter_team_review_insert
  ON filter_team_review FOR INSERT
  WITH CHECK (
    auth_role() = 'FILTER_TEAM'
    AND reviewer_id = auth_officer_id()
  );

-- Matches lib/db.ts's insertFilterTeamReview(), which compensating-deletes
-- its own just-inserted row on a downstream failure.
CREATE POLICY filter_team_review_own_delete
  ON filter_team_review FOR DELETE
  USING (
    auth_role() = 'FILTER_TEAM'
    AND reviewer_id = auth_officer_id()
  );

-- ============================================================
-- COMPANION FIX -- pre-existing, independent bug, same emergency batch:
-- evidence already has RLS+FORCE enabled (20260831110906) with zero
-- UPDATE policy for FILTER_TEAM. applyFilterTeamDecisionToEvidence() in
-- lib/db.ts has therefore been a silent no-op in production: the UPDATE
-- matches 0 rows, no error is raised, the route reports success.
-- ============================================================
CREATE POLICY evidence_filter_team_update
  ON evidence FOR UPDATE
  USING (
    auth_role() = 'FILTER_TEAM'
    AND quarantine_status = 'PENDING_FILTER'
  )
  WITH CHECK (
    auth_role() = 'FILTER_TEAM'
    AND quarantine_status IN ('RELEASED','SUPPRESSED')
  );

COMMIT;
