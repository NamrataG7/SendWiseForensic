-- Fix: case creation never assigned the creating officer to case_officer,
-- so a newly created case was immediately invisible to its own creator
-- (every case-scoped SELECT policy and auth_caller_cases() require a
-- case_officer row). Confirmed live via the real UI: creating a case
-- through /cases/new redirected to /cases/<id>, which 404'd because the
-- case existed in "case" but had zero case_officer rows.
--
-- Fix: p_case_create now also inserts a case_officer row for the
-- creating officer, matching the implicit expectation set by every
-- other write path in this codebase (a creator must be able to see
-- what they just created).

BEGIN;

CREATE OR REPLACE FUNCTION p_case_create(
  p_jurisdiction jurisdiction,
  p_external_case_ref text,
  p_offences text[],
  p_caller_officer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_audit_id bigint;
BEGIN
  IF auth_role() NOT IN ('INVESTIGATING_OFFICER', 'SUPERVISING_OFFICER') THEN
    RAISE EXCEPTION 'FORBIDDEN: INVESTIGATING_OFFICER or SUPERVISING_OFFICER role required (caller role %)', auth_role()
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_caller_officer_id <> auth_officer_id() THEN
    RAISE EXCEPTION 'FORBIDDEN: caller officer id does not match authenticated session'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO "case" (jurisdiction, external_case_ref, offences, status, created_by)
  VALUES (p_jurisdiction, p_external_case_ref, p_offences, 'OPEN', auth_officer_id())
  RETURNING id INTO v_id;

  -- Fix: assign the creator so the case is actually visible to them
  -- afterward (case-scoped SELECT policies gate on case_officer).
  INSERT INTO case_officer (case_id, officer_id)
  VALUES (v_id, auth_officer_id());

  v_audit_id := p_append_audit(
    p_caller_officer_id,
    'INVESTIGATING_OFFICER',
    'AUTH_ISSUE', -- TODO(AUDIT-ACTIONS) add CASE_OPEN as a first-class action -- preserved from the route
    'case',
    v_id::text,
    jsonb_build_object('jurisdiction', p_jurisdiction, 'externalCaseRef', p_external_case_ref),
    NULL,
    NULL
  );

  RETURN jsonb_build_object('id', v_id, 'auditId', v_audit_id);
END;
$$;

COMMENT ON FUNCTION p_case_create(jurisdiction, text, text[], uuid) IS
  'Replaces app/api/cases/route.ts. Atomically inserts a "case" row, assigns the creating officer via case_officer (fixed 20260909000011 -- previously missing, which made every newly-created case 404 for its own creator), and appends the AUTH_ISSUE audit row, all in one transaction. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() IN (INVESTIGATING_OFFICER, SUPERVISING_OFFICER), replicating the case_create policy (20260908000002). created_by is always set from auth_officer_id(), never the client parameter. Known gap (not invented, not fixed here): case_create has no jurisdiction predicate at all -- any INVESTIGATING_OFFICER/SUPERVISING_OFFICER may open a case in any jurisdiction, same as today.';

COMMIT;
