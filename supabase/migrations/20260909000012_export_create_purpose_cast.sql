-- Fix: p_export_create inserts a plain `text` parameter into
-- evidence_export.purpose, which is a Postgres ENUM (export_purpose,
-- not a domain/check-constrained text column). Unlike a literal string
-- in a plain INSERT statement, a plpgsql text variable is NOT
-- implicitly cast to an enum type -- Postgres has no implicit
-- assignment cast from text to a user-defined enum. Confirmed live via
-- the real UI: submitting "REQUEST EXPORT" (Court submission) failed
-- with 'column "purpose" is of type export_purpose but expression is
-- of type text'. No evidence export could ever be created through this
-- RPC since it was introduced (20260908000004).
--
-- Fix: explicit cast at the INSERT site.

BEGIN;

CREATE OR REPLACE FUNCTION p_export_create(
  p_case_id uuid,
  p_evidence_ids uuid[],
  p_purpose text,
  p_recipient_notice text,
  p_caller_officer_id uuid,
  p_caller_role role_name
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
  IF p_case_id NOT IN (SELECT auth_caller_cases()) THEN
    RAISE EXCEPTION 'FORBIDDEN: caller is not assigned to case %', p_case_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO evidence_export (
    case_id, evidence_ids, requested_by, approved_by, purpose, recipient_notice
  ) VALUES (
    p_case_id, p_evidence_ids, auth_officer_id(), ARRAY[]::uuid[], p_purpose::export_purpose, p_recipient_notice
  )
  RETURNING id INTO v_id;

  v_audit_id := p_append_audit(
    p_caller_officer_id,
    p_caller_role,
    'EVIDENCE_EXPORT',
    'evidence_export',
    v_id::text,
    jsonb_build_object(
      'caseId', p_case_id,
      'evidenceCount', array_length(p_evidence_ids, 1),
      'purpose', p_purpose,
      'derivedStatus', 'PENDING_APPROVAL'
    ),
    NULL,
    NULL
  );

  RETURN jsonb_build_object('id', v_id, 'auditId', v_audit_id);
END;
$$;

COMMENT ON FUNCTION p_export_create(uuid, uuid[], text, text, uuid, role_name) IS
  'Replaces app/api/exports/route.ts. Atomically inserts an evidence_export row (approved_by starts empty, per the existing dual-approval CHECK constraint design) and appends the EVIDENCE_EXPORT audit row in one transaction. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() IN (INVESTIGATING_OFFICER, SUPERVISING_OFFICER), case_id IN auth_caller_cases(), replicating the evidence_export_create policy (20260908000002) exactly. requested_by is always auth_officer_id(), never the client parameter. Fixed 20260909000012: p_purpose is cast to export_purpose explicitly -- Postgres does not implicitly cast a plpgsql text variable to a user-defined enum, so every export request previously failed with "column \"purpose\" is of type export_purpose but expression is of type text".';

COMMIT;
