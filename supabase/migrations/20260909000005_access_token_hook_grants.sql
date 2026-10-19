-- Fix for custom_access_token_hook's 500 "Error running hook URI" failure
-- (20260909000004): the function itself is correct (verified working via
-- direct RPC call with the service-role key), but Supabase Auth actually
-- invokes this hook AS THE supabase_auth_admin role, not service_role --
-- a distinct Postgres role with no RLS-bypass and no implicit grants on
-- officer/officer_role/role (all three have RLS enabled). Per Supabase's
-- own recommended pattern for access-token hooks: grant the specific
-- SELECTs the hook needs directly to supabase_auth_admin, rather than
-- making the hook function SECURITY DEFINER (which would give it a much
-- broader RLS-bypass than it actually needs).

BEGIN;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT ON officer TO supabase_auth_admin;
GRANT SELECT ON officer_role TO supabase_auth_admin;
GRANT SELECT ON role TO supabase_auth_admin;

COMMIT;
