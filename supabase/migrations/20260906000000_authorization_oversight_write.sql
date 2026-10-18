-- Phase 2 remediation (Oracle gate 4, ora-5, BLOCK verdict — both issues fixed here):
--
-- BLOCKER 1: "authorization" had NO UPDATE policy for REVIEW_COMMITTEE/
-- COMPETENT_AUTHORITY anywhere — only authorization_system_all (SYSTEM-only,
-- FOR ALL) and three SELECT-only policies (case_scoped_read, oversight_read,
-- defense_read), confirmed by direct re-read of
-- 20260831110906_rls_and_query_gates.sql. Since app/api/authorizations/[id]/
-- review/route.ts and the Phase 2 extensions/[id]/decide/route.ts both
-- update "authorization" via the officer's own (non-service-role) Supabase
-- client, these UPDATEs would silently match 0 rows under RLS — no error,
-- no rows changed — while the route still proceeds to append a SUCCESSFUL
-- audit log entry claiming the status/expiry changed. A false audit record
-- is strictly worse than no record at all in a system whose entire purpose
-- is a trustworthy legal audit trail.
--
-- Fix: new PERMISSIVE UPDATE policy granting COMPETENT_AUTHORITY/
-- REVIEW_COMMITTEE write access, jurisdiction-scoped via the existing
-- current_officer_jurisdictions() helper (20260831120000_jurisdiction_fields.sql)
-- so this single migration also closes the "jurisdiction-lock is UI-only"
-- gap flagged (non-blocking, but cheap to close here) — an officer can no
-- longer approve/decide a case outside their home jurisdiction by calling
-- the API directly, only by also satisfying this WITH CHECK clause.

BEGIN;

CREATE POLICY authorization_oversight_write
  ON "authorization"
  FOR UPDATE
  USING (
    auth_role() IN ('COMPETENT_AUTHORITY', 'REVIEW_COMMITTEE')
    AND jurisdiction = ANY (current_officer_jurisdictions())
  )
  WITH CHECK (
    auth_role() IN ('COMPETENT_AUTHORITY', 'REVIEW_COMMITTEE')
    AND jurisdiction = ANY (current_officer_jurisdictions())
  );

COMMENT ON POLICY authorization_oversight_write ON "authorization" IS
  'Grants COMPETENT_AUTHORITY/REVIEW_COMMITTEE UPDATE on "authorization" (status/expires_on transitions for initial issuance approval and extension decisions), jurisdiction-scoped to the officer''s home_jurisdiction + active grants via current_officer_jurisdictions(). Fixes a confirmed gap (Phase 2 remediation, Oracle gate 4) where these UPDATEs previously silently no-op''d under RLS while still being audit-logged as successful.';

COMMIT;
