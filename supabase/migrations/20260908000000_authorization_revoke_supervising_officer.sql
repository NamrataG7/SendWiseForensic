-- Fix: "authorization" had no UPDATE policy granting SUPERVISING_OFFICER,
-- even though app/api/authorizations/[id]/revoke/route.ts has always
-- allowed REVIEW_COMMITTEE, SUPERVISING_OFFICER, and COMPETENT_AUTHORITY to
-- call it. Discovered while auditing RLS predicates ahead of the
-- AUDIT-ATOMICITY refactor (see docs/TODO_GAPS.md P0.1): a SUPERVISING_
-- OFFICER calling revoke today gets a 200 OK with a false "REVOKED" audit
-- log entry, because the UPDATE on "authorization" silently affects 0 rows
-- under RLS (the route never checks affected-row count) while the
-- subsequent appendAudit() call still succeeds and is returned as success.
--
-- This is the same class of bug as the Phase 2 authorization_oversight_write
-- gap (20260906000000_authorization_oversight_write.sql) -- widening that
-- same policy's role list is the minimal, consistent fix, since it is
-- already jurisdiction-scoped via current_officer_jurisdictions() and this
-- migration only needs to add one role to its existing USING/WITH CHECK.

BEGIN;

DROP POLICY IF EXISTS authorization_oversight_write ON "authorization";

CREATE POLICY authorization_oversight_write
  ON "authorization"
  FOR UPDATE
  USING (
    auth_role() IN ('COMPETENT_AUTHORITY', 'REVIEW_COMMITTEE', 'SUPERVISING_OFFICER')
    AND jurisdiction = ANY (current_officer_jurisdictions())
  )
  WITH CHECK (
    auth_role() IN ('COMPETENT_AUTHORITY', 'REVIEW_COMMITTEE', 'SUPERVISING_OFFICER')
    AND jurisdiction = ANY (current_officer_jurisdictions())
  );

COMMENT ON POLICY authorization_oversight_write ON "authorization" IS
  'Grants COMPETENT_AUTHORITY/REVIEW_COMMITTEE/SUPERVISING_OFFICER UPDATE on "authorization" (status/expires_on/revocation_log transitions for initial issuance approval, extension decisions, and revocation), jurisdiction-scoped to the officer''s home_jurisdiction + active grants via current_officer_jurisdictions(). SUPERVISING_OFFICER added here (was missing since the policy''s original creation) because app/api/authorizations/[id]/revoke/route.ts has always permitted that role to revoke, but the UPDATE would silently no-op under RLS without it.';

COMMIT;
