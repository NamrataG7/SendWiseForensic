-- Third fix attempt for custom_access_token_hook's 500 error. Dashboard
-- hook registration confirmed correct, SECURITY DEFINER applied
-- (20260909000006), yet still failing -- next most likely cause: this
-- function (unlike every other SECURITY DEFINER function built this
-- session) never had an explicit `SET search_path`. GoTrue's internal
-- Postgres connection for hook invocation may have a minimal/non-default
-- search_path, so unqualified references inside the function body
-- (officer, officer_role, role, role_name, jurisdiction types) may not
-- resolve the same way they do for a normal SQL-Editor session. Every
-- other SECURITY DEFINER function this session (p_append_audit,
-- p_authorization_review_approve, etc.) already sets
-- `SET search_path = public` -- this one was the one exception.

BEGIN;

ALTER FUNCTION custom_access_token_hook(jsonb) SET search_path = public, pg_catalog;

COMMIT;
