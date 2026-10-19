-- Second fix for custom_access_token_hook's 500 error (20260909000004,
-- 20260909000005). The grants-only fix (20260909000005) was insufficient:
-- officer/officer_role/role all have FORCE ROW LEVEL SECURITY set, and
-- FORCE RLS applies RLS checks even to a role with plain GRANT SELECT
-- (FORCE RLS only exempts the table OWNER acting without BYPASSRLS, and
-- even then only if NOT forced -- with FORCE set, only BYPASSRLS or
-- SECURITY DEFINER-with-bypassing-owner actually reads through). This is
-- also circular: the hook's whole job is to ESTABLISH officer_id/role
-- claims, so RLS policies that themselves depend on those claims can
-- never pass during the hook's own execution -- the hook inherently must
-- run with elevated read access, by the nature of what it does.
--
-- This is exactly the documented, standard pattern for Supabase Custom
-- Access Token Hooks specifically (unlike ordinary application functions,
-- where avoiding SECURITY DEFINER is usually the right instinct) -- the
-- function is owned by the migration-executing role (postgres superuser
-- in the SQL Editor), so SECURITY DEFINER here bypasses RLS correctly and
-- narrowly: this function only ever reads officer/officer_role/role to
-- build two claim values, nothing else, and is itself only invoked by
-- supabase_auth_admin via the registered hook, not callable by
-- authenticated/anon per the REVOKE already in 20260909000004.

BEGIN;

ALTER FUNCTION custom_access_token_hook(jsonb) SECURITY DEFINER;

COMMIT;
