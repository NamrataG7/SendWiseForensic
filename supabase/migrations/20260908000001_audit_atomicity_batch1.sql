-- AUDIT-ATOMICITY fix, Batch 1 (docs/TODO_GAPS.md P0.1).
--
-- Problem: app/api/authorizations/[id]/review, .../revoke, and
-- .../extensions/[id]/decide each performed a row mutation via the
-- RLS-scoped client, then SEPARATELY called p_append_audit() (its own RPC).
-- These are two independent network round-trips, not atomic: if the audit
-- call failed after the mutation committed, the route attempted a manual
-- "compensating revert" update, itself not guaranteed to succeed and not
-- atomic with anything.
--
-- Fix: one SECURITY DEFINER plpgsql function per route that performs the
-- row mutation(s) AND calls p_append_audit() internally. A plpgsql function
-- body is one implicit transaction: if any statement raises, everything in
-- the function rolls back, including earlier mutations in the same call.
--
-- IMPORTANT — jurisdiction enforcement:
-- RLS's authorization_oversight_write policy (20260906000000 widened by
-- 20260908000000) is, today, the ONLY place jurisdiction scoping is
-- enforced for these three routes (auth_role() IN (...) AND jurisdiction =
-- ANY (current_officer_jurisdictions())). SECURITY DEFINER functions BYPASS
-- RLS by design, so every function below explicitly re-checks BOTH
-- predicates — role via auth_role() and jurisdiction via
-- current_officer_jurisdictions() — against the row(s) being mutated, to
-- avoid silently deleting jurisdiction enforcement.
--
-- Role-check trust model: the actual authorization decision in every
-- function is made against auth_role() (the JWT 'role' claim, the same
-- value the bypassed RLS policy would have checked), never against a
-- caller-supplied parameter. p_authorization_revoke accepts p_caller_role
-- only to tag the audit row's actor_role (mirroring the existing TS
-- behaviour of passing caller.roles[0] to appendAudit without extra
-- validation) — it is NOT used for the permission gate.

BEGIN;

-- ====================================================================
-- 1. p_authorization_review_approve
--    Replaces: app/api/authorizations/[id]/review/route.ts
--    RLS predicate replicated: authorization_oversight_write
--      (auth_role() IN ('COMPETENT_AUTHORITY','REVIEW_COMMITTEE',
--       'SUPERVISING_OFFICER') AND jurisdiction = ANY
--       (current_officer_jurisdictions())) — this route only ever requires
--      REVIEW_COMMITTEE per its own requireRole() call, so we check that
--      narrower set here.
-- ====================================================================
CREATE OR REPLACE FUNCTION p_authorization_review_approve(
  p_authorization_id uuid,
  p_caller_officer_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_approval jsonb;
  v_approve_audit_id bigint;
  v_activate_audit_id bigint;
BEGIN
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

  IF v_row.status <> 'PENDING_REVIEW' THEN
    RAISE EXCEPTION 'CONFLICT: cannot approve from status %; expected PENDING_REVIEW', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  v_approval := jsonb_build_object(
    'approvers', jsonb_build_array(p_caller_officer_id),
    'approvedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'notes', COALESCE(p_notes, ''),
    'prototypeStub', true
  );

  UPDATE "authorization"
     SET status = 'ACTIVE',
         review_committee_approval = v_approval
   WHERE id = p_authorization_id
     AND status = 'PENDING_REVIEW' -- optimistic guard (also re-checked above under FOR UPDATE)
     AND jurisdiction = ANY (current_officer_jurisdictions());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: authorization % no longer eligible for approval (concurrent change)',
      p_authorization_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_approve_audit_id := p_append_audit(
    p_caller_officer_id,
    'REVIEW_COMMITTEE',
    'AUTH_APPROVE',
    'authorization',
    p_authorization_id::text,
    jsonb_build_object(
      'caseId', v_row.case_id,
      'subjectId', v_row.subject_id,
      'approval', v_approval
    ),
    NULL,
    NULL
  );

  v_activate_audit_id := p_append_audit(
    p_caller_officer_id,
    'REVIEW_COMMITTEE',
    'AUTH_ACTIVATE',
    'authorization',
    p_authorization_id::text,
    jsonb_build_object('caseId', v_row.case_id),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'id', p_authorization_id,
    'status', 'ACTIVE',
    'approvalAuditId', v_approve_audit_id,
    'activateAuditId', v_activate_audit_id
  );
END;
$$;

COMMENT ON FUNCTION p_authorization_review_approve(uuid, uuid, text) IS
  'Replaces app/api/authorizations/[id]/review/route.ts. Atomically transitions "authorization" PENDING_REVIEW -> ACTIVE and appends AUTH_APPROVE + AUTH_ACTIVATE audit rows in one transaction. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() = REVIEW_COMMITTEE and jurisdiction = ANY (current_officer_jurisdictions()), replicating the authorization_oversight_write policy predicate.';

-- ====================================================================
-- 2. p_authorization_revoke
--    Replaces: app/api/authorizations/[id]/revoke/route.ts (core mutation
--    + AUTH_REVOKE audit only — the monitoring_session cascade and its
--    best-effort per-session SESSION_AUTO_TERMINATE audit rows stay in TS,
--    per the route's own "Best-effort audit rows for cascaded sessions"
--    comment, which already signals that loop is intentionally
--    non-blocking/non-atomic).
--    RLS predicate replicated: authorization_oversight_write
--      (auth_role() IN ('COMPETENT_AUTHORITY','REVIEW_COMMITTEE',
--       'SUPERVISING_OFFICER') AND jurisdiction = ANY
--       (current_officer_jurisdictions())) — this route allows all three
--      roles per its own requireRole() call.
-- ====================================================================
CREATE OR REPLACE FUNCTION p_authorization_revoke(
  p_authorization_id uuid,
  p_caller_officer_id uuid,
  p_caller_role role_name,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_entry jsonb;
  v_new_log jsonb;
  v_revoke_audit_id bigint;
BEGIN
  IF auth_role() NOT IN ('COMPETENT_AUTHORITY', 'REVIEW_COMMITTEE', 'SUPERVISING_OFFICER') THEN
    RAISE EXCEPTION 'FORBIDDEN: insufficient role for revocation (caller role %)', auth_role()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, status, case_id, jurisdiction, revocation_log
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

  IF v_row.status IN ('REVOKED', 'EXPIRED') THEN
    RAISE EXCEPTION 'CONFLICT: already in terminal status %', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  v_entry := jsonb_build_object(
    'actorId', p_caller_officer_id,
    'reason', p_reason,
    'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_new_log := COALESCE(v_row.revocation_log, '[]'::jsonb) || jsonb_build_array(v_entry);

  UPDATE "authorization"
     SET status = 'REVOKED',
         revocation_log = v_new_log
   WHERE id = p_authorization_id
     AND status = v_row.status -- optimistic guard
     AND jurisdiction = ANY (current_officer_jurisdictions());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: authorization % no longer eligible for revocation (concurrent change)',
      p_authorization_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_revoke_audit_id := p_append_audit(
    p_caller_officer_id,
    p_caller_role,
    'AUTH_REVOKE',
    'authorization',
    p_authorization_id::text,
    jsonb_build_object('caseId', v_row.case_id, 'reason', p_reason),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'id', p_authorization_id,
    'status', 'REVOKED',
    'revokeAuditId', v_revoke_audit_id
  );
END;
$$;

COMMENT ON FUNCTION p_authorization_revoke(uuid, uuid, role_name, text) IS
  'Replaces the core mutation of app/api/authorizations/[id]/revoke/route.ts. Atomically transitions "authorization" to REVOKED, appends the revocation_log entry, and appends the AUTH_REVOKE audit row in one transaction. Does NOT perform the monitoring_session cascade or its per-session SESSION_AUTO_TERMINATE audit rows, which remain a best-effort TS-side loop after this RPC succeeds (per the route''s own "best-effort" comment). SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() IN (COMPETENT_AUTHORITY, REVIEW_COMMITTEE, SUPERVISING_OFFICER) and jurisdiction = ANY (current_officer_jurisdictions()), replicating the authorization_oversight_write policy predicate (as widened by 20260908000000). p_caller_role is used only to tag the audit row''s actor_role, not for the permission gate — that gate is auth_role().';

-- ====================================================================
-- 3. p_extension_decide
--    Replaces: app/api/authorizations/extensions/[id]/decide/route.ts
--    RLS predicate replicated against the PARENT authorization's
--    jurisdiction: authorization_oversight_write
--      (auth_role() IN ('COMPETENT_AUTHORITY','REVIEW_COMMITTEE',
--       'SUPERVISING_OFFICER') AND jurisdiction = ANY
--       (current_officer_jurisdictions())) — this route only ever requires
--      REVIEW_COMMITTEE per its own requireRole() call, so we check that
--      narrower set here. The authorization_extension table itself has
--      permissive FOR ALL USING(true) policies (no row-level scoping), so
--      the parent authorization's jurisdiction is the only real gate.
--
--    On approve, this function performs a normal UPDATE on
--    authorization_extension.decision_status, which still fires the
--    existing BEFORE trigger trg_authorization_extension_within_cap
--    (authorization_extension_within_cap(), 20260904000100) naturally —
--    that trigger's 180-day cumulative-cap logic is NOT duplicated or
--    bypassed here.
-- ====================================================================
CREATE OR REPLACE FUNCTION p_extension_decide(
  p_extension_id uuid,
  p_caller_officer_id uuid,
  p_decision text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ext record;
  v_parent record;
  v_old_expires_on timestamptz;
  v_audit_id bigint;
  v_new_status text;
  v_audit_action audit_action;
BEGIN
  IF p_decision NOT IN ('approve', 'deny') THEN
    RAISE EXCEPTION 'BAD_REQUEST: decision must be ''approve'' or ''deny'' (got %)', p_decision
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF auth_role() <> 'REVIEW_COMMITTEE' THEN
    RAISE EXCEPTION 'FORBIDDEN: REVIEW_COMMITTEE role required (caller role %)', auth_role()
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, parent_authorization_id, requested_new_expires_on, decision_status
    INTO v_ext
    FROM authorization_extension
   WHERE id = p_extension_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: extension request % not found', p_extension_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id, case_id, subject_id, jurisdiction, expires_on
    INTO v_parent
    FROM "authorization"
   WHERE id = v_ext.parent_authorization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: parent authorization % not found', v_ext.parent_authorization_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (v_parent.jurisdiction = ANY (current_officer_jurisdictions())) THEN
    RAISE EXCEPTION 'FORBIDDEN: caller is not authorised for jurisdiction % of authorization %',
      v_parent.jurisdiction, v_parent.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_ext.decision_status <> 'PENDING' THEN
    RAISE EXCEPTION 'CONFLICT: cannot decide from status %; expected PENDING', v_ext.decision_status
      USING ERRCODE = 'check_violation';
  END IF;

  v_old_expires_on := v_parent.expires_on;

  IF p_decision = 'approve' THEN
    v_new_status := 'APPROVED';
    v_audit_action := 'EXTENSION_APPROVE';

    UPDATE authorization_extension
       SET decision_status = 'APPROVED',
           decided_by = p_caller_officer_id,
           decided_at = now(),
           decision_reason = p_reason
     WHERE id = v_ext.id
       AND decision_status = 'PENDING'; -- optimistic guard; also re-triggers the cap trigger

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONFLICT: extension % no longer eligible for decision (concurrent change)',
        v_ext.id
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE "authorization"
       SET expires_on = v_ext.requested_new_expires_on
     WHERE id = v_parent.id
       AND expires_on = v_old_expires_on -- optimistic guard
       AND jurisdiction = ANY (current_officer_jurisdictions());

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONFLICT: parent authorization % expires_on changed concurrently', v_parent.id
        USING ERRCODE = 'check_violation';
    END IF;

    v_audit_id := p_append_audit(
      p_caller_officer_id,
      'REVIEW_COMMITTEE',
      v_audit_action,
      'authorization_extension',
      v_ext.id::text,
      jsonb_build_object(
        'decision', 'approve',
        'caseId', v_parent.case_id,
        'subjectId', v_parent.subject_id,
        'authorizationId', v_parent.id,
        'oldExpiresOn', v_old_expires_on,
        'newExpiresOn', v_ext.requested_new_expires_on,
        'notes', COALESCE(p_reason, '')
      ),
      NULL,
      NULL
    );

    RETURN jsonb_build_object(
      'id', v_ext.id,
      'authorizationId', v_parent.id,
      'oldExpiresOn', v_old_expires_on,
      'newExpiresOn', v_ext.requested_new_expires_on,
      'auditId', v_audit_id
    );
  ELSE
    -- deny
    v_new_status := 'DENIED';
    v_audit_action := 'EXTENSION_DENY';

    UPDATE authorization_extension
       SET decision_status = 'DENIED',
           decided_by = p_caller_officer_id,
           decided_at = now(),
           decision_reason = p_reason
     WHERE id = v_ext.id
       AND decision_status = 'PENDING'; -- optimistic guard

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONFLICT: extension % no longer eligible for decision (concurrent change)',
        v_ext.id
        USING ERRCODE = 'check_violation';
    END IF;

    v_audit_id := p_append_audit(
      p_caller_officer_id,
      'REVIEW_COMMITTEE',
      v_audit_action,
      'authorization_extension',
      v_ext.id::text,
      jsonb_build_object(
        'decision', 'deny',
        'caseId', v_parent.case_id,
        'subjectId', v_parent.subject_id,
        'authorizationId', v_parent.id,
        'requestedExpiresOn', v_ext.requested_new_expires_on,
        'notes', COALESCE(p_reason, '')
      ),
      NULL,
      NULL
    );

    RETURN jsonb_build_object(
      'id', v_ext.id,
      'authorizationId', v_parent.id,
      'auditId', v_audit_id
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION p_extension_decide(uuid, uuid, text, text) IS
  'Replaces app/api/authorizations/extensions/[id]/decide/route.ts. Atomically decides a PENDING authorization_extension row (approve or deny) and, on approve, extends the parent "authorization".expires_on, appending EXTENSION_APPROVE/EXTENSION_DENY audit rows in the same transaction. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() = REVIEW_COMMITTEE and the PARENT authorization''s jurisdiction = ANY (current_officer_jurisdictions()), replicating the authorization_oversight_write policy predicate. Does not duplicate or bypass trg_authorization_extension_within_cap (20260904000100) — the normal UPDATE on authorization_extension.decision_status still fires that BEFORE trigger.';

-- ====================================================================
-- Grants
-- ====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_authorization_review_approve(uuid, uuid, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_authorization_revoke(uuid, uuid, role_name, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_extension_decide(uuid, uuid, text, text) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_authorization_review_approve(uuid, uuid, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_authorization_revoke(uuid, uuid, role_name, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_extension_decide(uuid, uuid, text, text) TO service_role';
  END IF;
END $$;

COMMIT;
