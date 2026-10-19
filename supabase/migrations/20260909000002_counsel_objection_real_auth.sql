-- P1.4 (docs/TODO_GAPS.md): real counsel-portal identity verification,
-- replacing the client-supplied-token stub.
--
-- Problem: app/api/counsel/objections/route.ts accepted a
-- `magicLinkToken` field from the request BODY and only checked it was
-- non-empty -- completely disconnected from actual authentication.
-- Counsel access is, in reality, already a REAL Supabase magic-link
-- session (app/counsel/page.tsx resolves the signed-in user's email
-- against counsel_access_request.status = 'GRANTED') -- the objections
-- route simply never checked that session at all, and instead trusted
-- a client-supplied `filedByCounselOfficerId` directly as the actor
-- identity for both the insert and the audit log. Any caller who knew
-- a valid authorization_id and an arbitrary officer UUID could file an
-- objection and have it audited as filed by someone else entirely.
--
-- Also: no `officer` row (DEFENSE_COUNSEL role) is ever created for a
-- counsel after their magic-link grant -- there was no path from
-- "counsel_access_request.status = GRANTED" to an actual officer
-- identity at all. This function creates one on first use (upsert by
-- auth_user_id), mirroring p_officer_accept_invite's pattern.

BEGIN;

CREATE OR REPLACE FUNCTION p_counsel_file_objection(
  p_authorization_id uuid,
  p_grounds text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant record;
  v_auth record;
  v_officer_id uuid;
  v_role_id uuid;
  v_objection_id uuid;
  v_audit_id bigint;
BEGIN
  IF p_grounds IS NULL OR length(trim(p_grounds)) < 10 THEN
    RAISE EXCEPTION 'BAD_REQUEST: grounds must be at least 10 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF auth.uid() IS NULL OR auth.email() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Real identity check: a GRANTED, still-valid counsel_access_request
  -- for this authenticated session's own email. Never trust a
  -- client-supplied token or officer id.
  SELECT id, full_name, jurisdiction, case_id, granted_until
    INTO v_grant
    FROM counsel_access_request
   WHERE email = lower(auth.email())
     AND status = 'GRANTED'
     AND (granted_until IS NULL OR granted_until > now())
   ORDER BY approved_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: no active granted counsel access for this account'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, case_id
    INTO v_auth
    FROM "authorization"
   WHERE id = p_authorization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: authorization % not found', p_authorization_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Scope check: counsel may only object against warrants in the case
  -- their grant actually covers.
  IF v_grant.case_id IS NULL OR v_auth.case_id <> v_grant.case_id THEN
    RAISE EXCEPTION 'FORBIDDEN: authorization % is not within the granted case scope', p_authorization_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resolve or create the counsel's own officer row (first use), keyed
  -- by their real Supabase auth identity -- never client-supplied.
  SELECT id INTO v_officer_id FROM officer WHERE auth_user_id = auth.uid();

  IF NOT FOUND THEN
    INSERT INTO officer (auth_user_id, full_name, email, jurisdiction, identity_verified, active)
    VALUES (auth.uid(), v_grant.full_name, lower(auth.email()), v_grant.jurisdiction, false, true)
    ON CONFLICT (auth_user_id) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id INTO v_officer_id;
  END IF;

  SELECT id INTO v_role_id FROM role WHERE name = 'DEFENSE_COUNSEL';

  IF NOT EXISTS (
    SELECT 1 FROM officer_role
     WHERE officer_id = v_officer_id AND role_id = v_role_id AND revoked_at IS NULL
  ) THEN
    INSERT INTO officer_role (officer_id, role_id) VALUES (v_officer_id, v_role_id);
  END IF;

  INSERT INTO subject_objection (authorization_id, filed_by_counsel_id, grounds, status)
  VALUES (p_authorization_id, v_officer_id, p_grounds, 'OPEN')
  RETURNING id INTO v_objection_id;

  v_audit_id := p_append_audit(
    v_officer_id,
    'DEFENSE_COUNSEL',
    'SUBJECT_OBJECTION_FILED',
    'authorization',
    p_authorization_id::text,
    jsonb_build_object('objectionId', v_objection_id, 'grounds', p_grounds),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'objectionId', v_objection_id,
    'auditId', v_audit_id
  );
END;
$$;

COMMENT ON FUNCTION p_counsel_file_objection(uuid, text) IS
  'Replaces app/api/counsel/objections/route.ts''s client-supplied-token stub (P1.4). Identity is derived ONLY from the authenticated Supabase session (auth.uid()/auth.email()) matched against a GRANTED, unexpired counsel_access_request row for that email -- never from client-supplied magicLinkToken/filedByCounselOfficerId. Creates the counsel''s officer row (DEFENSE_COUNSEL) on first use if one does not exist yet, keyed by auth_user_id. Scope-checks the target authorization is within the grant''s own case_id.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_counsel_file_objection(uuid, text) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_counsel_file_objection(uuid, text) TO service_role';
  END IF;
END $$;

COMMIT;
