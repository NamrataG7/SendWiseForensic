-- Fix the real root cause of the 500 errors: a claim-name collision.
--
-- custom_access_token_hook (20260909000004) writes the app-level RBAC
-- role (INVESTIGATING_OFFICER, REVIEW_COMMITTEE, ...) into a top-level
-- JWT claim named `role`. But `role` is a RESERVED claim for
-- Supabase/PostgREST: PostgREST reads it and issues `SET ROLE "<value>"`
-- against the Postgres connection to scope the session (normally
-- "authenticated"/"anon"/"service_role" -- real Postgres login roles).
-- Overwriting it with an app-level role_name enum value that is NOT a
-- Postgres role causes every subsequent query in that session to fail
-- at the role-switch step with:
--   role "INVESTIGATING_OFFICER" does not exist  (Postgres 42704)
-- -- before RLS, before auth_role(), before anything. This was masked
-- in earlier verification because that testing used the service-role
-- key, which bypasses PostgREST's SET ROLE path entirely, and because
-- the bare pg-functions:// hook-invocation errors (fixed in
-- 20260909000005/6/7) were the only visible symptom until a real
-- anon-key session was driven through the actual Next.js/PostgREST
-- path.
--
-- Fix: rename the custom claim to `app_role` (does not collide with
-- any reserved Supabase/PostgREST claim) and update auth_role() to
-- read the new name. The real `role` claim (`"authenticated"`) that
-- Supabase Auth already sets is left untouched. Everything else
-- (officer_id lookup, officer_role/role join, operational-priority
-- role selection order) is preserved exactly from 20260909000004 --
-- only the claim key name changes, plus SECURITY DEFINER + search_path
-- (already applied live in 20260909000006/7, now folded into this
-- canonical CREATE OR REPLACE so the migration history matches what's
-- actually running).

BEGIN;

CREATE OR REPLACE FUNCTION custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
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
      -- Renamed from `role` to `app_role` -- `role` is reserved by
      -- PostgREST for SET ROLE session-scoping and collides fatally.
      claims := jsonb_set(claims, '{app_role}', to_jsonb(v_role));
    END IF;
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

COMMENT ON FUNCTION custom_access_token_hook(jsonb) IS
  'Supabase Custom Access Token Hook. Injects officer_id + app_role (single, operational-priority-ordered; NOT named `role` -- that is reserved by PostgREST for SET ROLE session-scoping and collides fatally) claims into every issued JWT. MUST be registered in Supabase Dashboard -> Authentication -> Hooks -> "Customize Access Token (JWT) Claims hook" pointing at this function.';

CREATE OR REPLACE FUNCTION auth_role() RETURNS role_name
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
           NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'app_role',
           'SYSTEM'
         )::role_name;
$$;

COMMENT ON FUNCTION auth_role IS 'Extracts role_name from Supabase JWT claim `app_role` (NOT `role` -- that is a reserved PostgREST claim used for SET ROLE session-scoping, and overwriting it breaks every subsequent query in the session). Defaults to SYSTEM when no claims present (background jobs).';

COMMIT;
