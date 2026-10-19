-- P1.1 (docs/TODO_GAPS.md): adds the missing reject path for initial
-- warrant approval. /api/authorizations/[id]/review/route.ts previously
-- only ever implemented unconditional approve (via
-- p_authorization_review_approve) -- a Review Committee member who
-- wanted to formally decline a PENDING_REVIEW warrant had no way to
-- record that decision; the draft could only sit in PENDING_REVIEW
-- forever.
--
-- Mirrors p_authorization_review_approve's guard structure exactly
-- (role check, jurisdiction check via current_officer_jurisdictions(),
-- FOR UPDATE row lock, optimistic PENDING_REVIEW status guard).
--
-- Oracle gate (re-review) BLOCKED the first version of this function on
-- two grounds, both fixed here:
--   1. For IN, approve requires the caller to hold one of the 3 named
--      officer_review_committee_seat rows -- that's the actual
--      definition of "the Review Committee" under R.22 in this codebase.
--      The first version of reject only checked auth_role() =
--      'REVIEW_COMMITTEE' + jurisdiction, letting an officer who could
--      never cast an APPROVE vote (no seat) unilaterally kill an IN
--      warrant anyway. Fixed: for IN, reject now requires the caller
--      hold a seat too, mirroring approve's lookup exactly. Non-IN
--      jurisdictions (no seat concept) keep role+jurisdiction-only,
--      same as approve does for US/UK.
--   2. The first version unconditionally overwrote
--      review_committee_approval with the rejection object, silently
--      destroying any partial-IN-quorum approver history (which, per
--      approve's own design, lives ONLY in that column -- no audit row
--      is written for partial approvals). In a forensic evidence
--      platform whose premise is a reconstructable audit trail, that is
--      not acceptable even though the warrant never activates. Fixed:
--      the prior approvers array (if any) is preserved inside the
--      rejection payload AND included in the AUTH_REJECT audit context,
--      so "who had already approved before this was blocked" survives
--      independently of the row update.
--
-- Policy choice retained from the original design (confirmed sound by
-- Oracle): any single REVIEW_COMMITTEE member (now: any single qualified
-- seat-holder for IN) can veto a warrant before it activates -- quorum
-- governs who may ACTIVATE, not who may decline. Unanimity-to-activate
-- implies any one dissent is sufficient to block.

BEGIN;

CREATE OR REPLACE FUNCTION p_authorization_review_reject(
  p_authorization_id uuid,
  p_caller_officer_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_seat record;
  v_rejection jsonb;
  v_reject_audit_id bigint;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'BAD_REQUEST: reason is required to reject a warrant'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF auth_role() <> 'REVIEW_COMMITTEE' THEN
    RAISE EXCEPTION 'FORBIDDEN: REVIEW_COMMITTEE role required (caller role %)', auth_role()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, status, case_id, subject_id, jurisdiction, review_committee_approval
    INTO v_row
    FROM "authorization"
   WHERE id = p_authorization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: authorization % not found', p_authorization_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (v_row.jurisdiction = ANY (current_officer_jurisdictions())) THEN
    RAISE EXCEPTION 'FORBIDDEN: caller is not authorised for jurisdiction % of authorization %',
      v_row.jurisdiction, p_authorization_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- IN-only: the caller must hold one of the 3 named Review Committee
  -- seats, exactly as p_authorization_review_approve requires to cast an
  -- APPROVE vote. An officer who could never approve must not be able
  -- to unilaterally reject either.
  IF v_row.jurisdiction = 'IN' THEN
    SELECT seat INTO v_seat
      FROM officer_review_committee_seat
     WHERE officer_id = p_caller_officer_id
       AND jurisdiction = 'IN';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FORBIDDEN: caller has no assigned Review Committee seat for jurisdiction IN'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_row.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'CONFLICT: cannot reject from status %; expected PENDING_REVIEW', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Preserve any prior (partial-quorum) approver history rather than
  -- silently destroying it -- see migration header.
  v_rejection := jsonb_build_object(
    'rejectedBy', p_caller_officer_id,
    'rejectedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reason', p_reason,
    'priorApprovers', COALESCE(v_row.review_committee_approval -> 'approvers', '[]'::jsonb),
    'prototypeStub', true
  );

  UPDATE "authorization"
     SET status = 'REJECTED',
         review_committee_approval = v_rejection
   WHERE id = p_authorization_id
     AND status = 'PENDING_REVIEW' -- optimistic guard (also re-checked above under FOR UPDATE)
     AND jurisdiction = ANY (current_officer_jurisdictions());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: authorization % no longer eligible for rejection (concurrent change)',
      p_authorization_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_reject_audit_id := p_append_audit(
    p_caller_officer_id,
    'REVIEW_COMMITTEE',
    'AUTH_REJECT',
    'authorization',
    p_authorization_id::text,
    jsonb_build_object(
      'caseId', v_row.case_id,
      'subjectId', v_row.subject_id,
      'reason', p_reason,
      'priorApprovers', COALESCE(v_row.review_committee_approval -> 'approvers', '[]'::jsonb)
    ),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'id', p_authorization_id,
    'status', 'REJECTED',
    'rejectAuditId', v_reject_audit_id
  );
END;
$$;

COMMENT ON FUNCTION p_authorization_review_reject(uuid, uuid, text) IS
  'Replaces the missing reject path on app/api/authorizations/[id]/review/route.ts (P1.1). Atomically transitions "authorization" PENDING_REVIEW -> REJECTED (a terminal status distinct from REVOKED -- this warrant never activated at all) and appends one AUTH_REJECT audit row, in one transaction. For IN jurisdiction, requires the caller hold one of the 3 named officer_review_committee_seat rows (same requirement as casting an APPROVE vote); non-IN jurisdictions require only REVIEW_COMMITTEE role + jurisdiction scope, mirroring approve''s non-IN path. Any prior partial-quorum approver history (review_committee_approval->approvers) is preserved inside the rejection payload and the AUTH_REJECT audit context rather than being overwritten/lost.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_authorization_review_reject(uuid, uuid, text) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_authorization_review_reject(uuid, uuid, text) TO service_role';
  END IF;
END $$;

COMMIT;
