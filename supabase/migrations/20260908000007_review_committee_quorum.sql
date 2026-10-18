-- Real Review Committee quorum enforcement for India JUDICIAL_WARRANT
-- activation (docs/TODO_GAPS.md P0.2).
--
-- Problem (today, pre-fix): p_authorization_review_approve
-- (20260908000001_audit_atomicity_batch1.sql) lets ANY single
-- REVIEW_COMMITTEE officer immediately flip PENDING_REVIEW -> ACTIVE,
-- with no quorum concept at all. Real §69 IT Rules 2009 R.22 Review
-- Committee approval for Union-level India authorizations requires THREE
-- named seats: Cabinet Secretary, Secretary (Legal Affairs), Secretary
-- (Telecommunications) — see packages/dummy-verification/src/
-- review-committee.ts's REQUIRED_ROLES, whose exact string values this
-- migration reuses verbatim as the `seat` CHECK values below.
--
-- This migration does NOT touch the (already-fixed, commit 3e58ec1)
-- draft-time quorum check in packages/legal-framework/src/india/index.ts.
-- Quorum enforcement belongs at ACTIVATION time (this function), not at
-- draft/submission time.
--
-- Scope: INDIA ONLY. UK's double-lock and US's no-committee model are
-- untouched — for any authorization whose jurisdiction <> 'IN', this
-- function preserves EXACTLY today's single-approver-immediately-
-- activates behavior (same audit rows, same response shape). The IN-only
-- 3-seat quorum path is a strict ADDITION, gated on
-- v_row.jurisdiction = 'IN'.
--
-- Pattern mirrored: evidence_export.approved_by uuid[] +
-- evidence_export_dual_approval CHECK (20260831110904) /
-- p_export_approve (20260908000004) — accumulate into an array-shaped
-- jsonb field across multiple separate RPC calls from different
-- officers, only transition state once a threshold (here: all 3 REQUIRED
-- seat names present) is met. Unlike p_export_approve, the threshold here
-- is role/seat-presence rather than bare cardinality.

BEGIN;

-- ====================================================================
-- 1. officer_review_committee_seat
--    One row per (jurisdiction, seat): WHO currently holds that named
--    Review Committee seat. UNIQUE (jurisdiction, seat) means seats are
--    re-assigned by replacing the row (e.g. UPDATE/DELETE+INSERT by a
--    superuser), not accumulated append-only — there is exactly one
--    current holder per seat at any time.
--
--    Seat assignment is NOT exposed to any client-facing INSERT/UPDATE/
--    DELETE policy in this migration — seeding/reassignment is a
--    superuser/migration-only operation for now (prototype phase), the
--    same trust model already used for role seeding (see supabase/
--    seed.sql's "Seeds base RBAC roles ONLY" comment). Building an admin
--    UI for seat (re)assignment is explicitly out of scope for this task.
-- ====================================================================
CREATE TABLE IF NOT EXISTS officer_review_committee_seat (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id   uuid NOT NULL REFERENCES officer(id),
  jurisdiction jurisdiction NOT NULL,
  seat         text NOT NULL CHECK (seat IN (
                 'CABINET_SECRETARY_STUB',
                 'SECRETARY_LEGAL_STUB',
                 'SECRETARY_TELECOM_STUB'
               )),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction, seat)
);

COMMENT ON TABLE officer_review_committee_seat IS
  'Current holder of each named Review Committee seat (IT Rules 2009 R.22), per jurisdiction. UNIQUE (jurisdiction, seat): re-assign by replacing the row, not append-only. Seat values mirror packages/dummy-verification/src/review-committee.ts REQUIRED_ROLES verbatim. Seeding/reassignment is superuser/migration-only in this prototype phase — no client-facing write policy exists.';

CREATE INDEX IF NOT EXISTS officer_review_committee_seat_officer_idx
  ON officer_review_committee_seat (officer_id);

ALTER TABLE officer_review_committee_seat ENABLE ROW LEVEL SECURITY;
ALTER TABLE officer_review_committee_seat FORCE ROW LEVEL SECURITY;

-- ADMIN reads scoped to their own home jurisdiction, mirroring
-- officer_admin_read_scoped (20260902000200).
DROP POLICY IF EXISTS admin_read_review_committee_seats_scoped ON officer_review_committee_seat;
CREATE POLICY admin_read_review_committee_seats_scoped ON officer_review_committee_seat
  FOR SELECT TO authenticated
  USING (
    current_user_is_admin()
    AND jurisdiction = current_admin_home_jurisdiction()
  );

-- A REVIEW_COMMITTEE officer may read only their own seat row(s).
DROP POLICY IF EXISTS review_committee_self_read_seat ON officer_review_committee_seat;
CREATE POLICY review_committee_self_read_seat ON officer_review_committee_seat
  FOR SELECT TO authenticated
  USING (
    auth_role() = 'REVIEW_COMMITTEE'
    AND officer_id = auth_officer_id()
  );

-- No INSERT/UPDATE/DELETE policy is defined: writes are only possible via
-- a superuser/migration connection that bypasses RLS (or BYPASSRLS role),
-- matching the trust model for base role seeding in supabase/seed.sql.

-- ====================================================================
-- Seed data: NOT performed here. supabase/seed.sql seeds ONLY the base
-- `role` lookup rows ("Seeds base RBAC roles ONLY. No dummy officers.")
-- and this repo has no existing dummy officer carrying the
-- REVIEW_COMMITTEE role to attach the 3 stub seats to — inventing three
-- fresh officer UUIDs here would silently create orphaned/unverifiable
-- fixture data with no corresponding officer_role grant, auth_user_id, or
-- onboarding audit trail. Seeding the 3 IN seats against real dummy
-- REVIEW_COMMITTEE officers is left as a documented manual follow-up
-- (create the officers + officer_role grants first, in whatever seed/
-- fixture flow already creates REVIEW_COMMITTEE officers for this
-- environment, then INSERT the 3 officer_review_committee_seat rows).

-- ====================================================================
-- 2. p_authorization_review_approve (CREATE OR REPLACE — same name and
--    signature as 20260908000001; backward-compatible enhancement).
--
--    Dispatch: v_row.jurisdiction = 'IN' selects the NEW 3-seat
--    accumulate-then-check-threshold quorum path. Any other jurisdiction
--    (US, UK) falls through to the ORIGINAL single-approver-activates
--    body, byte-for-byte unchanged (same audit actions, same response
--    shape) — those jurisdictions do not use this IN-specific committee
--    model at all.
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
  v_seat record;
  v_existing_approvers jsonb;
  v_already_approved boolean;
  v_new_entry jsonb;
  v_next_approvers jsonb;
  v_present_seats text[];
  v_required_seats text[] := ARRAY['CABINET_SECRETARY_STUB','SECRETARY_LEGAL_STUB','SECRETARY_TELECOM_STUB'];
  v_missing_seats text[];
  v_quorum_met boolean;
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

  -- ------------------------------------------------------------------
  -- NON-IN jurisdictions (US, UK): unchanged single-approver-activates
  -- behavior, identical to the pre-existing function body.
  -- ------------------------------------------------------------------
  IF v_row.jurisdiction <> 'IN' THEN
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
  END IF;

  -- ------------------------------------------------------------------
  -- IN jurisdiction: 3-seat accumulate-then-check-threshold quorum.
  -- ------------------------------------------------------------------
  SELECT officer_id, seat
    INTO v_seat
    FROM officer_review_committee_seat
   WHERE officer_id = p_caller_officer_id
     AND jurisdiction = 'IN';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: caller has no assigned Review Committee seat for jurisdiction %', v_row.jurisdiction
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_existing_approvers := COALESCE(v_row.review_committee_approval -> 'approvers', '[]'::jsonb);

  -- No double-approval by the same officer, no double-counting the same
  -- seat (e.g. if a seat was reassigned mid-flight to a different
  -- officer, the OLD seat's entry still blocks a second claim of that
  -- seat name).
  SELECT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_existing_approvers) AS a
     WHERE (a ->> 'officerId') = p_caller_officer_id::text
        OR (a ->> 'seat') = v_seat.seat
  ) INTO v_already_approved;

  IF v_already_approved THEN
    RAISE EXCEPTION 'CONFLICT: officer already recorded an approval'
      USING ERRCODE = 'check_violation';
  END IF;

  v_new_entry := jsonb_build_object(
    'officerId', p_caller_officer_id,
    'seat', v_seat.seat,
    'approvedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_next_approvers := v_existing_approvers || jsonb_build_array(v_new_entry);

  SELECT array_agg(DISTINCT a ->> 'seat')
    INTO v_present_seats
    FROM jsonb_array_elements(v_next_approvers) AS a;

  SELECT array_agg(s)
    INTO v_missing_seats
    FROM unnest(v_required_seats) AS s
   WHERE NOT (s = ANY (COALESCE(v_present_seats, ARRAY[]::text[])));

  v_quorum_met := (v_missing_seats IS NULL OR array_length(v_missing_seats, 1) IS NULL);

  v_approval := jsonb_build_object(
    'approvers', v_next_approvers,
    'notes', COALESCE(p_notes, ''),
    'prototypeStub', true
  );

  IF NOT v_quorum_met THEN
    -- Quorum not yet reached: persist the partial accumulation, stay in
    -- PENDING_REVIEW, and do NOT append AUTH_APPROVE/AUTH_ACTIVATE audit
    -- rows yet — those actions represent the authorization actually
    -- becoming approved/active, which has not happened. No lighter
    -- "partial approval" audit_action exists today, and adding one would
    -- require its own enum migration (ALTER TYPE ... ADD VALUE cannot run
    -- inside this transaction alongside its own use); the accumulated
    -- state is fully visible/auditable via review_committee_approval
    -- itself and via ordinary row-level audit trails (updated_at), so a
    -- dedicated partial-approval audit row is deferred rather than
    -- invented here.
    UPDATE "authorization"
       SET review_committee_approval = v_approval
     WHERE id = p_authorization_id
       AND status = 'PENDING_REVIEW'
       AND jurisdiction = ANY (current_officer_jurisdictions());

    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONFLICT: authorization % no longer eligible for approval (concurrent change)',
        p_authorization_id
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN jsonb_build_object(
      'id', p_authorization_id,
      'status', 'PENDING_REVIEW',
      'quorumMet', false,
      'seatsPresent', COALESCE(v_present_seats, ARRAY[]::text[]),
      'seatsMissing', v_missing_seats,
      'approverCount', jsonb_array_length(v_next_approvers)
    );
  END IF;

  -- All 3 required seats now present: proceed exactly as the original
  -- single-approver path — flip ACTIVE, append AUTH_APPROVE + AUTH_ACTIVATE.
  UPDATE "authorization"
     SET status = 'ACTIVE',
         review_committee_approval = v_approval
   WHERE id = p_authorization_id
     AND status = 'PENDING_REVIEW'
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
    'quorumMet', true,
    'approvalAuditId', v_approve_audit_id,
    'activateAuditId', v_activate_audit_id
  );
END;
$$;

COMMENT ON FUNCTION p_authorization_review_approve(uuid, uuid, text) IS
  'Replaces app/api/authorizations/[id]/review/route.ts. For jurisdiction <> IN, preserves the original single-approver-immediately-activates behavior unchanged (US/UK do not use the IN committee model). For jurisdiction = IN, requires the caller to hold an officer_review_committee_seat for IN, accumulates {officerId, seat, approvedAt} into review_committee_approval.approvers (rejecting double-approval by the same officer or seat), and only flips PENDING_REVIEW -> ACTIVE (appending AUTH_APPROVE + AUTH_ACTIVATE audit rows) once all 3 REQUIRED_ROLES seats (CABINET_SECRETARY_STUB, SECRETARY_LEGAL_STUB, SECRETARY_TELECOM_STUB — mirroring packages/dummy-verification/src/review-committee.ts) are present among accumulated approvers; otherwise persists the partial accumulation and returns quorumMet=false with seatsPresent/seatsMissing, without appending audit rows for the partial state. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() = REVIEW_COMMITTEE and jurisdiction = ANY (current_officer_jurisdictions()), replicating the authorization_oversight_write policy predicate.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_authorization_review_approve(uuid, uuid, text) TO authenticated';
    EXECUTE 'GRANT SELECT ON officer_review_committee_seat TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_authorization_review_approve(uuid, uuid, text) TO service_role';
    EXECUTE 'GRANT ALL ON officer_review_committee_seat TO service_role';
  END IF;
END $$;

COMMIT;
