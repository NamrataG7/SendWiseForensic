-- P1.3 (docs/TODO_GAPS.md): admin-grant workflow for cross-jurisdiction
-- officer access. officer_jurisdiction_grant (20260831120000) has
-- existed since Phase 0 but its own table comment says grants are
-- "inserted manually via privileged migration for now" --
-- TODO(RLS-JURISDICTION-GRANT-UI) / TODO(OFFICER-JURISDICTION-GRANT-
-- REQUEST-UI) / TODO(SUPPORT-HOME-JURISDICTION-CHANGE-VIA-ADMIN-GRANT)
-- all point at the same underlying gap: no API/UI path exists for an
-- ADMIN to actually grant or revoke one of these rows.
--
-- Scope: ADMIN-driven grant/revoke only (an admin decides to extend
-- cross-jurisdiction access to an officer). An officer-initiated
-- "request access" workflow with a pending-approval queue is a further,
-- separate UI feature -- out of scope here; this closes the
-- more fundamental gap (there is currently NO way to create one of
-- these rows outside a raw SQL migration at all).
--
-- Mirrors the existing jurisdiction-scoped admin pattern exactly
-- (current_user_is_admin() + current_admin_home_jurisdiction(),
-- 20260902000200) -- an admin may only grant/revoke access INTO their
-- own home jurisdiction (the jurisdiction they administer), not grant
-- officers access to a third jurisdiction they have no authority over.

BEGIN;

CREATE OR REPLACE FUNCTION p_admin_grant_jurisdiction(
  p_officer_id uuid,
  p_jurisdiction jurisdiction,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_officer_id uuid;
  v_grant_id text;
  v_audit_id bigint;
BEGIN
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: ADMIN role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_jurisdiction <> current_admin_home_jurisdiction() THEN
    RAISE EXCEPTION 'FORBIDDEN: admin may only grant access into their own home jurisdiction (%)',
      current_admin_home_jurisdiction()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT o.id INTO v_admin_officer_id
    FROM officer o
   WHERE o.auth_user_id = auth.uid();

  IF NOT EXISTS (SELECT 1 FROM officer WHERE id = p_officer_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: officer % not found', p_officer_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO officer_jurisdiction_grant (officer_id, jurisdiction, granted_by, reason)
  VALUES (p_officer_id, p_jurisdiction, v_admin_officer_id, p_reason)
  ON CONFLICT (officer_id, jurisdiction) DO UPDATE
    SET granted_by = EXCLUDED.granted_by,
        granted_at = now(),
        revoked_at = NULL,
        reason = EXCLUDED.reason;

  v_grant_id := p_officer_id::text || ':' || p_jurisdiction::text;

  v_audit_id := p_append_audit(
    v_admin_officer_id,
    'ADMIN',
    'ROLE_GRANT',
    'officer_jurisdiction_grant',
    v_grant_id,
    jsonb_build_object('officerId', p_officer_id, 'jurisdiction', p_jurisdiction, 'reason', p_reason),
    NULL,
    NULL
  );

  RETURN jsonb_build_object('officerId', p_officer_id, 'jurisdiction', p_jurisdiction, 'auditId', v_audit_id);
END;
$$;

COMMENT ON FUNCTION p_admin_grant_jurisdiction(uuid, jurisdiction, text) IS
  'Admin-grant workflow for officer_jurisdiction_grant (P1.3). Admin may only grant into their own home jurisdiction (current_admin_home_jurisdiction()), mirroring the existing jurisdiction-scoped admin RLS pattern (20260902000200). Upserts (re-grants a previously-revoked row rather than erroring) and appends a ROLE_GRANT audit row atomically.';

CREATE OR REPLACE FUNCTION p_admin_revoke_jurisdiction(
  p_officer_id uuid,
  p_jurisdiction jurisdiction
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_officer_id uuid;
  v_grant_id text;
  v_audit_id bigint;
BEGIN
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: ADMIN role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_jurisdiction <> current_admin_home_jurisdiction() THEN
    RAISE EXCEPTION 'FORBIDDEN: admin may only revoke access into their own home jurisdiction (%)',
      current_admin_home_jurisdiction()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT o.id INTO v_admin_officer_id
    FROM officer o
   WHERE o.auth_user_id = auth.uid();

  UPDATE officer_jurisdiction_grant
     SET revoked_at = now()
   WHERE officer_id = p_officer_id
     AND jurisdiction = p_jurisdiction
     AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: no active grant for officer % in jurisdiction %', p_officer_id, p_jurisdiction
      USING ERRCODE = 'no_data_found';
  END IF;

  v_grant_id := p_officer_id::text || ':' || p_jurisdiction::text;

  v_audit_id := p_append_audit(
    v_admin_officer_id,
    'ADMIN',
    'ROLE_GRANT',
    'officer_jurisdiction_grant',
    v_grant_id,
    jsonb_build_object('officerId', p_officer_id, 'jurisdiction', p_jurisdiction, 'action', 'revoke'),
    NULL,
    NULL
  );

  RETURN jsonb_build_object('officerId', p_officer_id, 'jurisdiction', p_jurisdiction, 'auditId', v_audit_id);
END;
$$;

COMMENT ON FUNCTION p_admin_revoke_jurisdiction(uuid, jurisdiction) IS
  'Revokes an active officer_jurisdiction_grant (sets revoked_at). Same admin jurisdiction-scoping as p_admin_grant_jurisdiction.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_admin_grant_jurisdiction(uuid, jurisdiction, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_admin_revoke_jurisdiction(uuid, jurisdiction) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_admin_grant_jurisdiction(uuid, jurisdiction, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_admin_revoke_jurisdiction(uuid, jurisdiction) TO service_role';
  END IF;
END $$;

COMMIT;
