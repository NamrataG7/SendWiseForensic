-- CRITICAL, system-wide fix: no Supabase Custom Access Token Hook has ever
-- existed in this project. auth_role()/auth_officer_id()/
-- current_officer_jurisdictions() all read custom JWT claims
-- ('officer_id', 'role') via request.jwt.claims -- but nothing has ever
-- injected those claims into any issued JWT. Confirmed by decoding a real,
-- freshly-issued access token (password grant) for an existing officer:
-- app_metadata = {provider, providers}, user_metadata = {email_verified},
-- no officer_id, no role, anywhere.
--
-- Effect: for every REAL logged-in user session (anon/publishable key +
-- user JWT, i.e. every actual browser session through the UI), auth_role()
-- has always fallen through to its 'SYSTEM' default and auth_officer_id()
-- has always returned NULL -- meaning:
--   - current_officer_jurisdictions() always returns an empty array, so
--     every RESTRICTIVE jurisdiction policy (case_jurisdiction_restrict,
--     subject_jurisdiction_restrict, evidence_jurisdiction_restrict,
--     evidence_export_jurisdiction_restrict, authorization_jurisdiction_restrict)
--     has always blocked every row for every real session.
--   - Every SECURITY DEFINER function built this session that gates on
--     auth_role() = '<specific role>' (p_authorization_review_approve,
--     p_authorization_revoke, p_authorization_review_reject,
--     p_extension_decide, p_filter_team_decide,
--     p_officer_set_home_jurisdiction, p_case_create, p_subject_create,
--     p_export_create, p_export_approve, p_admin_grant_jurisdiction,
--     p_admin_revoke_jurisdiction) has always rejected every real caller
--     with FORBIDDEN, regardless of their actual officer_role grants.
--   - This is NOT something introduced by this session's work -- it is a
--     pre-existing, latent gap in the auth model dating back to Phase 0
--     (docs/DEPLOY.md's own closing note already flagged this exact risk:
--     "RLS assumes JWT claims `role` and `officer_id` ... consider a
--     Supabase custom-access-token hook for real deployments" -- that
--     "consider" was never acted on). It was invisible until now because
--     almost all verification this session used the service-role key
--     (which legitimately bypasses these checks via auth_role() defaulting
--     to SYSTEM, a path those functions correctly allow) rather than a
--     real end-user session.
--
-- Fix: a custom_access_token_hook function, written per Supabase's
-- required hook contract (JSONB in, JSONB out, granted to
-- supabase_auth_admin only). Looks up the authenticating auth.users.id in
-- officer, injects officer_id. Role selection: an officer can hold
-- MULTIPLE roles (e.g. an officer can be both ADMIN and
-- INVESTIGATING_OFFICER) but every RLS policy/RPC function in this
-- codebase compares auth_role() as a SCALAR ('auth_role() = X' or
-- 'auth_role() IN (...)') -- there is no array-membership model anywhere
-- today. This hook picks ONE role via an explicit operational-priority
-- order (investigative/committee/filter/counsel roles rank above the
-- purely-administrative ADMIN role, since ADMIN alone granting access to
-- warrant/evidence operations would be a privilege a plain admin account
-- should not silently get) -- this is a real, pre-existing one-role-per-
-- session architectural limitation, not newly introduced by this hook;
-- flagged here rather than silently worked around, and should be revisited
-- if an officer ever legitimately needs simultaneous equal-priority roles
-- enforced per-request rather than one fixed priority order.

BEGIN;

CREATE OR REPLACE FUNCTION custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_officer_id uuid;
  v_role text;
BEGIN
  claims := COALESCE(event->'claims', '{}'::jsonb);

  SELECT o.id INTO v_officer_id
    FROM officer o
   WHERE o.auth_user_id = (event->>'user_id')::uuid;

  IF v_officer_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{officer_id}', to_jsonb(v_officer_id::text));

    SELECT r.name INTO v_role
      FROM officer_role orl
      JOIN role r ON r.id = orl.role_id
     WHERE orl.officer_id = v_officer_id
       AND orl.revoked_at IS NULL
     ORDER BY CASE r.name
       WHEN 'INVESTIGATING_OFFICER' THEN 1
       WHEN 'SUPERVISING_OFFICER'   THEN 2
       WHEN 'REVIEW_COMMITTEE'      THEN 3
       WHEN 'COMPETENT_AUTHORITY'   THEN 4
       WHEN 'FILTER_TEAM'           THEN 5
       WHEN 'DEFENSE_COUNSEL'       THEN 6
       WHEN 'PROSECUTOR'            THEN 7
       WHEN 'JUDICIAL_AUDITOR'      THEN 8
       WHEN 'DPO'                   THEN 9
       WHEN 'ADMIN'                 THEN 10
       ELSE 99
     END
     LIMIT 1;

    IF v_role IS NOT NULL THEN
      claims := jsonb_set(claims, '{role}', to_jsonb(v_role));
    END IF;
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

COMMENT ON FUNCTION custom_access_token_hook(jsonb) IS
  'Supabase Custom Access Token Hook. Injects officer_id + role (single, operational-priority-ordered) claims into every issued JWT so auth_role()/auth_officer_id()/current_officer_jurisdictions() (20260831110906, 20260831120000) actually have data to read for real user sessions. MUST be registered in Supabase Dashboard -> Authentication -> Hooks -> "Customize Access Token (JWT) Claims hook" pointing at this function -- a SQL migration alone does not activate it.';

GRANT EXECUTE ON FUNCTION custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION custom_access_token_hook(jsonb) FROM authenticated, anon, public;

COMMIT;
