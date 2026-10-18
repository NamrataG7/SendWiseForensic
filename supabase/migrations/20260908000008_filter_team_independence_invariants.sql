-- Closes two concrete, mechanically-enforceable gaps from
-- TODO(FILTER-TEAM-INDEPENDENCE) (lib/api.ts, app/filter-team/page.tsx,
-- app/api/filter-team/reviews/route.ts, app/api/filter-team/queue/route.ts).
--
-- Full organizational independence (FILTER_TEAM staffed by genuinely
-- separate judicial officers, not police) is an HR/staffing policy
-- question outside what software can enforce -- that TODO remains open
-- and is NOT closed by this migration. But two invariants ARE within
-- reach and were completely unenforced until now:
--
--   1. Role mutual-exclusion: nothing stopped the SAME officer from
--      simultaneously holding FILTER_TEAM and an investigating role
--      (INVESTIGATING_OFFICER/SUPERVISING_OFFICER) via officer_role --
--      an officer could review their own case's privileged evidence.
--   2. Case-assignment conflict: nothing stopped a FILTER_TEAM officer
--      who reviews quarantined evidence from also being assigned (via
--      case_officer) to the very case that evidence belongs to.
--
-- Per Oracle design gate: officer_role rows are never deleted on
-- revocation (revoked_at is set instead, retained for audit -- see that
-- table's own comment), so the mutual-exclusion trigger must check BOTH
-- directions symmetrically on every INSERT (not just "inserting
-- FILTER_TEAM, check investigating roles") -- a single role-agnostic
-- trigger function handles this correctly without two special cases.
--
-- Explicitly NOT in scope (per design gate): a third, "retroactive"
-- invariant -- a filter-team member who was PREVIOUSLY assigned to a
-- case (now unassigned via case_officer.unassigned_at) reviewing that
-- case's evidence. This requires a policy judgment call (how far back is
-- "too recent"?) that is itself an HR/process question, same bucket as
-- the organizational-independence TODO this migration does not close.
-- Flagged, not invented.

BEGIN;

-- ====================================================================
-- 1. Role mutual-exclusion (officer_role)
-- ====================================================================
CREATE OR REPLACE FUNCTION check_filter_team_role_exclusion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_new_role_name role_name;
  v_conflict_set role_name[];
BEGIN
  SELECT name INTO v_new_role_name FROM role WHERE id = NEW.role_id;

  v_conflict_set := CASE
    WHEN v_new_role_name = 'FILTER_TEAM'
      THEN ARRAY['INVESTIGATING_OFFICER','SUPERVISING_OFFICER']::role_name[]
    WHEN v_new_role_name IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER')
      THEN ARRAY['FILTER_TEAM']::role_name[]
    ELSE NULL
  END;

  IF v_conflict_set IS NOT NULL AND EXISTS (
    SELECT 1 FROM officer_role orl
    JOIN role r ON r.id = orl.role_id
    WHERE orl.officer_id = NEW.officer_id
      AND orl.revoked_at IS NULL
      AND r.name = ANY (v_conflict_set)
  ) THEN
    RAISE EXCEPTION 'CONFLICT: officer % cannot hold % alongside an existing non-revoked % role (FILTER-TEAM-INDEPENDENCE: role mutual exclusion)',
      NEW.officer_id, v_new_role_name, v_conflict_set
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_filter_team_role_exclusion IS
  'FILTER-TEAM-INDEPENDENCE: role-agnostic mutual-exclusion between FILTER_TEAM and INVESTIGATING_OFFICER/SUPERVISING_OFFICER. Fires on every officer_role INSERT (role grants are append-only; revocation sets revoked_at rather than deleting, so this only needs to guard INSERT, not UPDATE). Checks both directions in one trigger function rather than two special cases.';

DROP TRIGGER IF EXISTS officer_role_filter_team_exclusion ON officer_role;
CREATE TRIGGER officer_role_filter_team_exclusion
  BEFORE INSERT ON officer_role
  FOR EACH ROW EXECUTE FUNCTION check_filter_team_role_exclusion();

-- ====================================================================
-- 2. Case-assignment conflict check inside p_filter_team_decide
--    (CREATE OR REPLACE, same name/signature -- adds one new guard,
--    everything else is an unmodified copy of the 20260908000004 body)
-- ====================================================================
CREATE OR REPLACE FUNCTION p_filter_team_decide(
  p_evidence_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evidence record;
  v_review_id uuid;
  v_next_status text;
  v_update jsonb;
  v_filter_audit_id bigint;
  v_followup_audit_id bigint;
  v_followup_action audit_action;
BEGIN
  IF p_decision NOT IN ('RELEASE', 'SUPPRESS', 'REDACT_AND_RELEASE') THEN
    RAISE EXCEPTION 'BAD_REQUEST: decision must be RELEASE, SUPPRESS, or REDACT_AND_RELEASE (got %)', p_decision
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF auth_role() <> 'FILTER_TEAM' THEN
    RAISE EXCEPTION 'FORBIDDEN: FILTER_TEAM role required (caller role %)', auth_role()
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reviewer_id <> auth_officer_id() THEN
    RAISE EXCEPTION 'FORBIDDEN: reviewer_id must match the authenticated officer'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, quarantine_status
    INTO v_evidence
    FROM evidence
   WHERE id = p_evidence_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: evidence % not found', p_evidence_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_evidence.quarantine_status IS DISTINCT FROM 'PENDING_FILTER' THEN
    RAISE EXCEPTION 'CONFLICT: evidence % is not PENDING_FILTER (status %)',
      p_evidence_id, v_evidence.quarantine_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- FILTER-TEAM-INDEPENDENCE: case-assignment conflict. A FILTER_TEAM
  -- reviewer must not be currently assigned (case_officer, unassigned_at
  -- IS NULL) to the case that owns this evidence. auth_caller_cases()
  -- is already implicitly auth_officer_id()-scoped internally, and
  -- p_reviewer_id = auth_officer_id() was already asserted equal above,
  -- so this correctly checks the acting reviewer's own assignments.
  IF EXISTS (
    SELECT 1
      FROM evidence e
      JOIN monitoring_session ms ON ms.id = e.session_id
      JOIN "authorization" a ON a.id = ms.authorization_id
     WHERE e.id = p_evidence_id
       AND a.case_id IN (SELECT auth_caller_cases())
  ) THEN
    RAISE EXCEPTION 'CONFLICT: reviewer % is assigned to the case that owns evidence % (FILTER-TEAM-INDEPENDENCE: case-assignment conflict)',
      p_reviewer_id, p_evidence_id
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO filter_team_review (evidence_id, reviewer_id, decision, reason)
  VALUES (p_evidence_id, p_reviewer_id, p_decision, p_reason)
  RETURNING id INTO v_review_id;

  v_next_status := CASE WHEN p_decision = 'SUPPRESS' THEN 'SUPPRESSED' ELSE 'RELEASED' END;

  IF p_decision = 'REDACT_AND_RELEASE' THEN
    UPDATE evidence
       SET quarantine_status = v_next_status,
           redactions_applied = jsonb_build_array(
             jsonb_build_object('by', 'FILTER_TEAM', 'reason', p_reason,
                                 'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
           )
     WHERE id = p_evidence_id
       AND quarantine_status = 'PENDING_FILTER';
  ELSE
    UPDATE evidence
       SET quarantine_status = v_next_status
     WHERE id = p_evidence_id
       AND quarantine_status = 'PENDING_FILTER';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: evidence % no longer eligible for filter-team decision (concurrent change)',
      p_evidence_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_filter_audit_id := p_append_audit(
    p_reviewer_id,
    'FILTER_TEAM',
    'FILTER_REVIEW',
    'evidence',
    p_evidence_id::text,
    jsonb_build_object('reviewId', v_review_id, 'decision', p_decision, 'reason', p_reason),
    NULL,
    NULL
  );

  v_followup_action := CASE WHEN p_decision = 'SUPPRESS' THEN 'EVIDENCE_SUPPRESS' ELSE 'EVIDENCE_RELEASE' END;
  v_followup_audit_id := p_append_audit(
    p_reviewer_id,
    'FILTER_TEAM',
    v_followup_action,
    'evidence',
    p_evidence_id::text,
    jsonb_build_object('reviewId', v_review_id),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'reviewId', v_review_id,
    'decision', p_decision,
    'filterAuditId', v_filter_audit_id,
    'followUpAuditId', v_followup_audit_id
  );
END;
$$;

COMMENT ON FUNCTION p_filter_team_decide(uuid, uuid, text, text) IS
  'Replaces app/api/filter-team/reviews/route.ts. Atomically inserts a filter_team_review row, transitions evidence.quarantine_status, and appends FILTER_REVIEW + EVIDENCE_RELEASE/EVIDENCE_SUPPRESS audit rows in one transaction. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() = FILTER_TEAM and reviewer_id = auth_officer_id() (replicating filter_team_review_insert), the quarantine_status PENDING_FILTER precondition (replicating evidence_filter_team_update), and (20260908000005) a FILTER-TEAM-INDEPENDENCE case-assignment conflict check rejecting review by an officer currently assigned (case_officer) to the evidence''s own case.';

COMMIT;
