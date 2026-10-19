-- Fix two remaining bugs blocking all JUDICIAL_WARRANT creation:
--
-- Bug A (statute-prefix mismatch): 20260831120000_jurisdiction_fields.sql
-- added a trigger requiring every authorization.statute_references
-- element to literally start with the jurisdiction prefix ('IN_' for
-- India), and even backfilled existing rows with that prefix -- but
-- lib/authz.ts and the India adapter's STATUTES codes were never
-- updated to emit IN_-prefixed codes going forward. Every real India
-- statute reference the app itself produces (IT_ACT_S69, BNS_318, ...)
-- is therefore rejected by the app's own DB trigger. Confirmed live:
-- "statute_references contains element IT_ACT_S69 which does not carry
-- the jurisdiction prefix IN_". Fixed here by normalizing at the write
-- boundary (same LIKE-based detection the original backfill UPDATE
-- used), rather than renaming every STATUTES code across the adapter,
-- UI, and tests -- smallest blast radius, and symmetric with how the
-- original migration already treated pre-existing rows.
--
-- Bug B (missing INSERT policy): app/api/authorizations/route.ts does a
-- raw `supabase.from('authorization').insert(...)` using the end
-- user's session client, but NO RLS policy on "authorization" grants
-- INSERT to INVESTIGATING_OFFICER/SUPERVISING_OFFICER (only SYSTEM via
-- authorization_system_all, and UPDATE-only via
-- authorization_oversight_write). Confirmed live: "new row violates
-- row-level security policy for table \"authorization\"". Every other
-- mutating route in this codebase (case/subject/export creation)
-- already solved this exact class of problem with a SECURITY DEFINER
-- RPC (p_case_create, p_subject_create, p_export_create,
-- 20260908000004) instead of adding a matching RLS policy, which also
-- collapses the insert+audit-append TODO(AUDIT-ATOMICITY) two-round-trip
-- gap in the same route into one transaction. This migration follows
-- that same established pattern.

BEGIN;

CREATE OR REPLACE FUNCTION p_authorization_issue(
  p_case_id uuid,
  p_jurisdiction jurisdiction,
  p_subject_id uuid,
  p_type authorization_type,
  p_legitimate_aim text,
  p_issuing_authority_id uuid,
  p_issued_on timestamptz,
  p_expires_on timestamptz,
  p_scope jsonb,
  p_proportionality_checklist jsonb,
  p_review_committee_approval jsonb,
  p_statute_references text[],
  p_signed_order_document_hash text,
  p_signed_order_document_ref text,
  p_dpdpa_exemption_ref text,
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
  v_normalized_refs text[];
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

  -- Bug A fix: normalize legacy un-prefixed India statute codes to the
  -- IN_-prefixed form the authorization_statute_prefix_matches_jurisdiction
  -- trigger requires, mirroring 20260831120000's own backfill logic
  -- exactly. No-op for already-prefixed codes and for non-IN jurisdictions.
  IF p_jurisdiction = 'IN' THEN
    v_normalized_refs := ARRAY(
      SELECT
        CASE
          WHEN elem LIKE 'IT\_%' ESCAPE '\'
            OR elem LIKE 'BNSS\_%' ESCAPE '\'
            OR elem LIKE 'BNS\_%' ESCAPE '\'
            OR elem LIKE 'BSA\_%' ESCAPE '\'
            OR elem LIKE 'DPDPA\_%' ESCAPE '\'
            OR elem LIKE 'CONST_ART_21_PUTTASWAMY%'
          THEN 'IN_' || elem
          ELSE elem
        END
      FROM UNNEST(p_statute_references) AS elem
    );
  ELSE
    v_normalized_refs := p_statute_references;
  END IF;

  INSERT INTO "authorization" (
    case_id, jurisdiction, subject_id, type, legitimate_aim,
    issuing_authority_id, issued_on, expires_on, scope,
    proportionality_checklist, review_committee_approval,
    statute_references, signed_order_document_hash,
    signed_order_document_ref, dpdpa_exemption_ref, status, revocation_log
  ) VALUES (
    p_case_id, p_jurisdiction, p_subject_id, p_type, p_legitimate_aim,
    p_issuing_authority_id, p_issued_on, p_expires_on, p_scope,
    p_proportionality_checklist, p_review_committee_approval,
    v_normalized_refs, p_signed_order_document_hash,
    p_signed_order_document_ref, p_dpdpa_exemption_ref, 'PENDING_REVIEW', '[]'::jsonb
  )
  RETURNING id INTO v_id;

  v_audit_id := p_append_audit(
    p_caller_officer_id,
    p_caller_role,
    'AUTH_ISSUE',
    'authorization',
    v_id::text,
    jsonb_build_object(
      'caseId', p_case_id,
      'subjectId', p_subject_id,
      'legitimateAim', p_legitimate_aim,
      'statuteReferences', to_jsonb(v_normalized_refs)
    ),
    NULL,
    NULL
  );

  RETURN jsonb_build_object('id', v_id, 'auditId', v_audit_id);
END;
$$;

COMMENT ON FUNCTION p_authorization_issue IS
  'Replaces the raw insert in app/api/authorizations/route.ts (POST). Atomically inserts an "authorization" row (status PENDING_REVIEW) and appends the AUTH_ISSUE audit row in one transaction, fixing both the missing authorization-table INSERT RLS policy and the two-round-trip TODO(AUDIT-ATOMICITY) gap the route previously worked around with a compensating delete. Also normalizes legacy un-prefixed India statute codes to the IN_-prefixed form required by authorization_statute_prefix_matches_jurisdiction (20260831120000). SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role(), auth_officer_id(), and case assignment via auth_caller_cases(), matching the pattern established by p_case_create/p_subject_create/p_export_create (20260908000004). Zod shape validation, per-jurisdiction adapter validation (Puttaswamy prongs, Competent Authority allowlist, IT Rules R.11 duration bound), and jurisdiction derivation from Case.jurisdiction remain in lib/authz.ts (TypeScript) exactly as before — this RPC only replaces the final write.';

COMMIT;
