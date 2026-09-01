-- Row Level Security policies for evidence, monitoring_session, authorization.
-- See docs/ENTITY_MODEL.md §3.4.
--
-- Assumptions (Supabase JWT):
--   auth.jwt() ->> 'role'         : role_name (one of the RBAC roles above)
--   auth.jwt() ->> 'officer_id'   : officer.id as text (UUID)
--
-- The SYSTEM role bypasses scope restrictions (used by background jobs running under service_role).
-- All other roles are subject to case-scoped access via case_officer.

-- ------------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_role() RETURNS role_name
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
           NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           'SYSTEM'
         )::role_name;
$$;

CREATE OR REPLACE FUNCTION auth_officer_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
           NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'officer_id',
           ''
         )::uuid;
$$;

COMMENT ON FUNCTION auth_role       IS 'Extracts role_name from Supabase JWT claim `role`. Defaults to SYSTEM when no claims present (background jobs).';
COMMENT ON FUNCTION auth_officer_id IS 'Extracts officer.id from Supabase JWT claim `officer_id`.';

-- Set of case_ids the current caller is assigned to (and not unassigned from).
CREATE OR REPLACE FUNCTION auth_caller_cases() RETURNS SETOF uuid
LANGUAGE sql STABLE
AS $$
  SELECT co.case_id
    FROM case_officer co
   WHERE co.officer_id  = auth_officer_id()
     AND co.unassigned_at IS NULL;
$$;

-- ------------------------------------------------------------------
-- authorization RLS
-- ------------------------------------------------------------------
ALTER TABLE "authorization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "authorization" FORCE ROW LEVEL SECURITY;

-- SYSTEM sees everything (background jobs).
CREATE POLICY authorization_system_all
  ON "authorization"
  FOR ALL
  USING (auth_role() = 'SYSTEM')
  WITH CHECK (auth_role() = 'SYSTEM');

-- Case-scoped roles: read authorizations for cases they are assigned to.
CREATE POLICY authorization_case_scoped_read
  ON "authorization"
  FOR SELECT
  USING (
    auth_role() IN (
      'INVESTIGATING_OFFICER','SUPERVISING_OFFICER','PROSECUTOR','DPO','JUDICIAL_AUDITOR'
    )
    AND case_id IN (SELECT auth_caller_cases())
  );

-- Competent Authority and Review Committee: broad read (issuance/oversight).
CREATE POLICY authorization_oversight_read
  ON "authorization"
  FOR SELECT
  USING (auth_role() IN ('COMPETENT_AUTHORITY','REVIEW_COMMITTEE'));

-- Defense counsel: only authorizations they have filed objections against or are assigned to.
-- Prototype: scoped through officer_id being the issuing_authority_id or via subject_objection.
CREATE POLICY authorization_defense_read
  ON "authorization"
  FOR SELECT
  USING (
    auth_role() = 'DEFENSE_COUNSEL'
    AND id IN (
      SELECT authorization_id FROM subject_objection
       WHERE filed_by_counsel_id = auth_officer_id()
    )
  );

-- ------------------------------------------------------------------
-- monitoring_session RLS
-- ------------------------------------------------------------------
ALTER TABLE monitoring_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_session FORCE ROW LEVEL SECURITY;

CREATE POLICY monitoring_session_system_all
  ON monitoring_session
  FOR ALL
  USING (auth_role() = 'SYSTEM')
  WITH CHECK (auth_role() = 'SYSTEM');

CREATE POLICY monitoring_session_case_scoped_read
  ON monitoring_session
  FOR SELECT
  USING (
    auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER','PROSECUTOR','DPO','JUDICIAL_AUDITOR')
    AND authorization_id IN (
      SELECT id FROM "authorization" WHERE case_id IN (SELECT auth_caller_cases())
    )
  );

-- ------------------------------------------------------------------
-- evidence RLS  (scope-rewriting gate — ENTITY_MODEL.md §3.4)
-- ------------------------------------------------------------------
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY evidence_system_all
  ON evidence
  FOR ALL
  USING (auth_role() = 'SYSTEM')
  WITH CHECK (auth_role() = 'SYSTEM');

-- Non-SYSTEM investigative roles:
--   session -> authorization must be ACTIVE, tied to a case the caller is assigned to,
--   and quarantine_status must NOT be PENDING_FILTER or SUPPRESSED.
CREATE POLICY evidence_investigative_read
  ON evidence
  FOR SELECT
  USING (
    auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER','PROSECUTOR')
    AND session_id IN (
      SELECT ms.id
        FROM monitoring_session ms
        JOIN "authorization" a ON a.id = ms.authorization_id
       WHERE a.status  = 'ACTIVE'
         AND a.case_id IN (SELECT auth_caller_cases())
    )
    AND (quarantine_status IS NULL
         OR quarantine_status NOT IN ('PENDING_FILTER','SUPPRESSED'))
  );

-- FILTER_TEAM: inverse — sees ONLY PENDING_FILTER rows, across all cases (independence).
CREATE POLICY evidence_filter_team_read
  ON evidence
  FOR SELECT
  USING (
    auth_role() = 'FILTER_TEAM'
    AND quarantine_status = 'PENDING_FILTER'
  );

-- JUDICIAL_AUDITOR: audit-level read across cases (metadata-focused; RLS allows row read,
-- UI/API selects only non-payload columns).
CREATE POLICY evidence_auditor_read
  ON evidence
  FOR SELECT
  USING (auth_role() = 'JUDICIAL_AUDITOR');

-- DPO: metadata read across cases (same shape as auditor).
CREATE POLICY evidence_dpo_read
  ON evidence
  FOR SELECT
  USING (auth_role() = 'DPO');

-- Writes: only SYSTEM (via service_role background jobs) inserts evidence.
-- Ingest API runs under service_role. Investigator INSERT is NOT permitted.
-- TODO(RLS-INGEST-ROLE): add a dedicated INGEST role once the ingest service has its own JWT.

COMMENT ON POLICY evidence_investigative_read ON evidence IS
  'ENTITY_MODEL §3.4: case-scoped, active-auth-only, hides PENDING_FILTER + SUPPRESSED.';
COMMENT ON POLICY evidence_filter_team_read ON evidence IS
  'ENTITY_MODEL §3.4 inverse: Filter Team sees ONLY quarantined pending items.';
