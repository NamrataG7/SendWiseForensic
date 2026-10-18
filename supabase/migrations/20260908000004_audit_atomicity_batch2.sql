-- AUDIT-ATOMICITY fix, Batch 2 (docs/TODO_GAPS.md P0.1).
--
-- Same problem and fix shape as Batch 1
-- (20260908000001_audit_atomicity_batch1.sql): each of these routes
-- performed a row mutation via the RLS-scoped client, then SEPARATELY
-- called p_append_audit() (or, for filter-team reviews, multiple
-- sequential mutations), with manual "compensating" reverts on failure
-- that are themselves not atomic with anything. Fixed by one SECURITY
-- DEFINER plpgsql function per route performing the mutation(s) +
-- p_append_audit() call(s) in a single transaction.
--
-- SKIPPED per the task brief: app/api/counsel/objections/route.ts.
-- subject_objection has NEVER had RLS enabled (confirmed: no
-- `ALTER TABLE subject_objection ENABLE ROW LEVEL SECURITY` exists in any
-- migration, and 20260908000002_emergency_rls_enablement.sql's own
-- preamble lists subject_objection and case_officer as known-but-
-- explicitly-out-of-scope gaps alongside the 4 tables it did fix). The
-- route's own auth model is a stubbed magic-link ("prototype accepts any
-- non-empty token" per its TODO(COUNSEL-PORTAL) comment) -- there is no
-- real permission predicate to replicate inside a SECURITY DEFINER
-- function yet, and inventing one would misrepresent a security model
-- that does not exist. Left as-is, still TODO(AUDIT-ATOMICITY) +
-- TODO(COUNSEL-PORTAL).
--
-- IMPORTANT -- predicates replicated below (SECURITY DEFINER bypasses RLS,
-- so each function re-checks whatever RLS would otherwise have enforced):
--   p_filter_team_decide           <- filter_team_review_insert (20260908000002):
--                                      auth_role() = 'FILTER_TEAM' AND reviewer_id = auth_officer_id()
--                                      + evidence_filter_team_update (20260908000002):
--                                      USING quarantine_status = 'PENDING_FILTER'
--                                      WITH CHECK quarantine_status IN ('RELEASED','SUPPRESSED')
--   p_officer_accept_invite        <- route's own auth.getUser()-based invite-token
--                                      lookup (NOT an officer-role check -- the officer
--                                      row does not exist yet at this point in the flow).
--                                      No officer/officer_role/officer_invitation RLS
--                                      policy grants this officer the INSERT/UPDATE this
--                                      route needs (officer has no INSERT policy at all;
--                                      officer_invitation's only UPDATE policy is
--                                      admin_update_invites_scoped, which is ADMIN-only) --
--                                      this function's SECURITY DEFINER bypass is what
--                                      makes this flow work at all, not a bypass of an
--                                      existing control.
--   p_officer_set_home_jurisdiction <- no RLS UPDATE policy exists on officer at all
--                                      (officer_self_read/officer_admin_read_scoped are
--                                      SELECT-only) -- same "SECURITY DEFINER makes a
--                                      silently-broken write actually work" situation as
--                                      above. Permission gate replicated is the route's
--                                      own TS checks: officerId must equal the caller
--                                      (self-only) and home_jurisdiction must not already
--                                      be set.
--   p_case_create                   <- case_create (20260908000002):
--                                      auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER')
--                                      AND created_by = auth_officer_id()
--   p_subject_create                <- subject_create (20260908000002):
--                                      auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER')
--                                      (no case-ownership or jurisdiction predicate exists
--                                      in that policy -- NOT invented here either; see note
--                                      in the function body)
--   p_export_create                  <- evidence_export_create (20260908000002):
--                                      auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER')
--                                      AND case_id IN (SELECT auth_caller_cases())
--                                      AND requested_by = auth_officer_id()
--   p_export_approve                 <- evidence_export_case_scoped_update (20260908000002):
--                                      auth_role() IN ('INVESTIGATING_OFFICER','SUPERVISING_OFFICER')
--                                      AND case_id IN (SELECT auth_caller_cases())
--                                      (approved_by cardinality / SUPERVISING_OFFICER-presence
--                                      invariant is NOT re-encoded in RLS per that policy's own
--                                      comment -- enforced here exactly as the route enforced
--                                      it today, at the application layer, inside the function)
--
-- NOTE on subject/evidence_export jurisdiction-at-creation: subject_jurisdiction_restrict
-- and evidence_export_jurisdiction_restrict (20260908000002) are RESTRICTIVE *SELECT*
-- policies only -- they do not gate INSERT. Today, NOTHING enforces that a newly
-- created subject's or export's jurisdiction/case must match the creating officer's
-- own jurisdiction scope at write time (subjects/route.ts cross-checks the subject's
-- jurisdiction against its PARENT CASE's jurisdiction -- not against the officer's
-- current_officer_jurisdictions() -- and case_create has no jurisdiction predicate at
-- all). This looks like a real gap, but it predates this batch, is not part of the
-- "just-enabled RLS" set this batch must preserve, and is explicitly out of scope per
-- the task brief ("flag, don't invent"). Flagged here and in the implementation report;
-- not fixed in this migration.

BEGIN;

-- ====================================================================
-- 1. p_filter_team_decide
--    Replaces: app/api/filter-team/reviews/route.ts
--    (insertFilterTeamReview + applyFilterTeamDecisionToEvidence +
--    appendAudit(FILTER_REVIEW) + appendAudit(EVIDENCE_RELEASE/SUPPRESS),
--    folded into one transaction -- per the Batch 1 precedent of folding
--    a "best-effort second audit" into the same atomic unit rather than
--    keeping it as a fire-and-forget call the route never checked.)
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
  'Replaces app/api/filter-team/reviews/route.ts. Atomically inserts a filter_team_review row, transitions evidence.quarantine_status, and appends FILTER_REVIEW + EVIDENCE_RELEASE/EVIDENCE_SUPPRESS audit rows in one transaction. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() = FILTER_TEAM and reviewer_id = auth_officer_id() (replicating filter_team_review_insert), and the quarantine_status PENDING_FILTER precondition (replicating evidence_filter_team_update, 20260908000002 -- that policy fixed a prior silent no-op on this exact write).';

-- ====================================================================
-- 2. p_officer_accept_invite
--    Replaces: app/api/officer/accept-invite/route.ts
--    No role/jurisdiction predicate to replicate -- this route's actual
--    auth model is "authenticated Supabase user whose email matches an
--    unused, unexpired officer_invitation row", not an officer-role check
--    (the officer row may not exist yet). auth.email() here is the
--    direct in-function equivalent of the route's
--    `user.email.toLowerCase()` (same auth.getUser() session).
-- ====================================================================
CREATE OR REPLACE FUNCTION p_officer_accept_invite()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_invite record;
  v_officer_id uuid;
  v_role_id uuid;
  v_audit_id bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: unauthenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_email := lower(auth.email());
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: authenticated user has no email'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, email, full_name, designation, role_name, home_jurisdiction, expires_at, used_at
    INTO v_invite
    FROM officer_invitation
   WHERE email = v_email
     AND used_at IS NULL
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: no_pending_invite'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_invite.expires_at < now() THEN
    -- Route originally returned 410 (Gone) here; mapRpcErrorStatus
    -- (lib/api.ts) only knows NOT_FOUND/FORBIDDEN/CONFLICT/BAD_REQUEST
    -- prefixes, so this collapses to 409. Judgment call: adding a 410
    -- case to the shared RPC-error mapper for one single-use route was
    -- not worth diverging from the established convention. See the
    -- implementation report.
    RAISE EXCEPTION 'CONFLICT: invite_expired'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id INTO v_officer_id
    FROM officer
   WHERE auth_user_id = v_uid;

  IF v_officer_id IS NULL THEN
    INSERT INTO officer (
      auth_user_id, full_name, email, organization, jurisdiction, home_jurisdiction, active
    ) VALUES (
      v_uid, v_invite.full_name, v_invite.email, v_invite.designation,
      v_invite.home_jurisdiction, v_invite.home_jurisdiction, true
    )
    RETURNING id INTO v_officer_id;
  END IF;

  SELECT id INTO v_role_id FROM role WHERE name = v_invite.role_name;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'role_lookup_failed: role % not found', v_invite.role_name;
  END IF;

  INSERT INTO officer_role (officer_id, role_id)
  VALUES (v_officer_id, v_role_id)
  ON CONFLICT (officer_id, role_id) DO NOTHING;

  UPDATE officer_invitation
     SET used_at = now()
   WHERE id = v_invite.id;

  v_audit_id := p_append_audit(
    v_officer_id,
    v_invite.role_name::role_name,
    'OFFICER_ONBOARDED',
    'officer_invitation',
    v_invite.id::text,
    jsonb_build_object('email', v_invite.email, 'home_jurisdiction', v_invite.home_jurisdiction),
    NULL,
    NULL
  );

  RETURN jsonb_build_object('ok', true, 'officerId', v_officer_id, 'auditId', v_audit_id);
END;
$$;

COMMENT ON FUNCTION p_officer_accept_invite() IS
  'Replaces app/api/officer/accept-invite/route.ts. Atomically upserts the officer row, assigns officer_role, marks the officer_invitation used, and appends an OFFICER_ONBOARDED audit row (enum value added in 20260908000003) in one transaction. Uses auth.uid()/auth.email() directly (same session the route''s own auth.getUser() reads) rather than an officer-role check, because no officer/officer_role row exists yet at this point. SECURITY DEFINER is what makes the officer/officer_role INSERT and the officer_invitation UPDATE succeed at all -- no RLS policy on any of those three tables grants a newly-invited, not-yet-provisioned user that access (officer has no INSERT policy whatsoever; officer_invitation''s only UPDATE policy, admin_update_invites_scoped, is ADMIN-only).';

-- ====================================================================
-- 3. p_officer_set_home_jurisdiction
--    Replaces: app/api/officer/home-jurisdiction/route.ts
--    Self-only gate (officerId = caller), mirrored from the route's own
--    403 check. Also replicates the route's exact (odd but intentional --
--    not "fixed" here) behavior of guarding + writing officer.jurisdiction
--    while reading the "already set" signal from officer.home_jurisdiction.
-- ====================================================================
CREATE OR REPLACE FUNCTION p_officer_set_home_jurisdiction(
  p_officer_id uuid,
  p_caller_officer_id uuid,
  p_jurisdiction jurisdiction,
  p_caller_role role_name
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_home_jurisdiction jurisdiction;
  v_audit_id bigint;
BEGIN
  IF p_caller_officer_id <> auth_officer_id() THEN
    RAISE EXCEPTION 'FORBIDDEN: caller officer id does not match authenticated session'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_officer_id <> p_caller_officer_id THEN
    RAISE EXCEPTION 'FORBIDDEN: officers may only set their OWN home jurisdiction'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT home_jurisdiction INTO v_home_jurisdiction
    FROM officer
   WHERE id = p_officer_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: officer % not found', p_officer_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_home_jurisdiction IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: home jurisdiction already set to %; changing it requires an admin grant', v_home_jurisdiction
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE officer
     SET jurisdiction = p_jurisdiction
   WHERE id = p_officer_id
     AND jurisdiction IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: officer % jurisdiction no longer eligible to be set (concurrent change)', p_officer_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_audit_id := p_append_audit(
    p_caller_officer_id,
    p_caller_role,
    'ROLE_GRANT', -- repurposed audit_action -- jurisdiction lock, matching the route's existing comment
    'officer',
    p_officer_id::text,
    jsonb_build_object('homeJurisdiction', p_jurisdiction, 'immutable', true),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'officerId', p_officer_id,
    'homeJurisdiction', p_jurisdiction,
    'auditId', v_audit_id
  );
END;
$$;

COMMENT ON FUNCTION p_officer_set_home_jurisdiction(uuid, uuid, jurisdiction, role_name) IS
  'Replaces app/api/officer/home-jurisdiction/route.ts. Atomically performs the officer.jurisdiction one-shot write and appends the ROLE_GRANT audit row in one transaction, exactly mirroring the route''s existing (self-only, home_jurisdiction-already-set-blocks) logic -- including its pre-existing quirk of gating on/reading home_jurisdiction but writing the jurisdiction column, which this migration does not change. SECURITY DEFINER is also what makes this UPDATE succeed at all today -- no UPDATE policy exists on officer for any role, so this write has been a silent no-op under RLS exactly like applyFilterTeamDecisionToEvidence was before 20260908000002.';

-- ====================================================================
-- 4. p_case_create
--    Replaces: app/api/cases/route.ts
--    RLS predicate replicated: case_create (20260908000002)
-- ====================================================================
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
  'Replaces app/api/cases/route.ts. Atomically inserts a "case" row and appends the AUTH_ISSUE audit row in one transaction. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() IN (INVESTIGATING_OFFICER, SUPERVISING_OFFICER), replicating the case_create policy (20260908000002) -- the same role gate the route itself enforces (added in 54196d2, which fixed this route having NO role check at all). created_by is always set from auth_officer_id(), never the client parameter, matching that policy''s created_by = auth_officer_id() predicate exactly. Known gap (not invented, not fixed here): case_create has no jurisdiction predicate at all -- any INVESTIGATING_OFFICER/SUPERVISING_OFFICER may open a case in any jurisdiction, same as today.';

-- ====================================================================
-- 5. p_subject_create
--    Replaces: app/api/subjects/route.ts
--    RLS predicate replicated: subject_create (20260908000002)
-- ====================================================================
CREATE OR REPLACE FUNCTION p_subject_create(
  p_case_id uuid,
  p_pseudonymous_label text,
  p_identity_refs jsonb,
  p_caller_officer_id uuid,
  p_caller_role role_name
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case_jurisdiction jurisdiction;
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

  -- Defense in depth, mirroring the route's own cross-check: the subject
  -- inherits the case's ACTUAL jurisdiction; the client never supplies it.
  SELECT jurisdiction INTO v_case_jurisdiction
    FROM "case"
   WHERE id = p_case_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: case % not found', p_case_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO subject (jurisdiction, pseudonymous_label, identity_refs)
  VALUES (v_case_jurisdiction, p_pseudonymous_label, p_identity_refs)
  RETURNING id INTO v_id;

  v_audit_id := p_append_audit(
    p_caller_officer_id,
    p_caller_role,
    'AUTH_ISSUE', -- reused audit_action for subject enrolment, preserved from the route
    'subject',
    v_id::text,
    jsonb_build_object(
      'caseId', p_case_id,
      'jurisdiction', v_case_jurisdiction,
      'pseudonymousLabel', p_pseudonymous_label,
      'identityRefKeys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_identity_refs) k)
    ),
    NULL,
    NULL
  );

  RETURN jsonb_build_object('id', v_id, 'jurisdiction', v_case_jurisdiction, 'auditId', v_audit_id);
END;
$$;

COMMENT ON FUNCTION p_subject_create(uuid, text, jsonb, uuid, role_name) IS
  'Replaces app/api/subjects/route.ts. Atomically inserts a subject row (jurisdiction taken authoritatively from the parent case, never the client) and appends the AUTH_ISSUE audit row in one transaction. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() IN (INVESTIGATING_OFFICER, SUPERVISING_OFFICER), replicating the subject_create policy (20260908000002). Known gap (not invented, not fixed here): neither that RLS policy nor the route itself checks the case_id against auth_caller_cases() or the creating officer''s current_officer_jurisdictions() -- the only jurisdiction guard is "subject.jurisdiction = case.jurisdiction", not "case jurisdiction is in the officer''s scope". Flagged in the implementation report.';

-- ====================================================================
-- 6. p_export_create
--    Replaces: app/api/exports/route.ts
--    RLS predicate replicated: evidence_export_create (20260908000002)
-- ====================================================================
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
    p_case_id, p_evidence_ids, auth_officer_id(), ARRAY[]::uuid[], p_purpose, p_recipient_notice
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
  'Replaces app/api/exports/route.ts. Atomically inserts an evidence_export row (approved_by starts empty, per the existing dual-approval CHECK constraint design) and appends the EVIDENCE_EXPORT audit row in one transaction. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() IN (INVESTIGATING_OFFICER, SUPERVISING_OFFICER), case_id IN auth_caller_cases(), replicating the evidence_export_create policy (20260908000002) exactly. requested_by is always auth_officer_id(), never the client parameter.';

-- ====================================================================
-- 7. p_export_approve
--    Replaces: app/api/exports/[id]/approve/route.ts
--    RLS predicate replicated: evidence_export_case_scoped_update (20260908000002)
--    Preserves the approved_by cardinality / SUPERVISING_OFFICER-presence
--    invariant EXACTLY as the route enforced it at the application layer
--    today -- that invariant is intentionally NOT re-encoded in RLS
--    (evidence_export_case_scoped_update's own comment says so), so this
--    function is now the sole place it lives; nothing here weakens or
--    bypasses the DB-level evidence_export_dual_approval CHECK constraint
--    (array_length(approved_by, 1) >= 2), which still fires normally on
--    the UPDATE below.
-- ====================================================================
CREATE OR REPLACE FUNCTION p_export_approve(
  p_export_id uuid,
  p_caller_officer_id uuid,
  p_caller_role role_name
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_export record;
  v_next_approvers uuid[];
  v_supervising_seen boolean;
  v_will_become_approved boolean;
  v_derived_status text;
  v_audit_id bigint;
BEGIN
  IF auth_role() NOT IN ('INVESTIGATING_OFFICER', 'SUPERVISING_OFFICER') THEN
    RAISE EXCEPTION 'FORBIDDEN: Only INVESTIGATING_OFFICER or SUPERVISING_OFFICER may approve exports (caller role %)', auth_role()
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_caller_officer_id <> auth_officer_id() THEN
    RAISE EXCEPTION 'FORBIDDEN: caller officer id does not match authenticated session'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, case_id, requested_by, approved_by, exported_at, bsa_section_63_certificate_ref
    INTO v_export
    FROM evidence_export
   WHERE id = p_export_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: export % not found', p_export_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_export.case_id NOT IN (SELECT auth_caller_cases()) THEN
    RAISE EXCEPTION 'FORBIDDEN: caller is not assigned to case %', v_export.case_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_export.requested_by = p_caller_officer_id THEN
    RAISE EXCEPTION 'CONFLICT: Requester may not self-approve an evidence export'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_caller_officer_id = ANY (v_export.approved_by) THEN
    RAISE EXCEPTION 'CONFLICT: This officer has already approved this export'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_export.exported_at IS NOT NULL AND v_export.bsa_section_63_certificate_ref IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: Export already generated; cannot re-approve'
      USING ERRCODE = 'check_violation';
  END IF;

  v_next_approvers := v_export.approved_by || ARRAY[p_caller_officer_id];

  v_supervising_seen := (p_caller_role = 'SUPERVISING_OFFICER');
  IF NOT v_supervising_seen AND array_length(v_export.approved_by, 1) > 0 THEN
    SELECT EXISTS (
      SELECT 1
        FROM officer_role orl
        JOIN role r ON r.id = orl.role_id
       WHERE orl.officer_id = ANY (v_export.approved_by)
         AND orl.revoked_at IS NULL
         AND r.name = 'SUPERVISING_OFFICER'
    ) INTO v_supervising_seen;
  END IF;

  IF array_length(v_next_approvers, 1) >= 2 AND NOT v_supervising_seen THEN
    RAISE EXCEPTION 'CONFLICT: ENTITY_MODEL §3.5: at least one approver must hold SUPERVISING_OFFICER role'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE evidence_export
     SET approved_by = v_next_approvers
   WHERE id = p_export_id
     AND case_id IN (SELECT auth_caller_cases()); -- re-assert RLS predicate at write time

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: export % no longer eligible for approval (concurrent change)', p_export_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_will_become_approved := array_length(v_next_approvers, 1) >= 2 AND v_supervising_seen;
  v_derived_status := CASE WHEN v_will_become_approved THEN 'APPROVED' ELSE 'PENDING_APPROVAL' END;

  v_audit_id := p_append_audit(
    p_caller_officer_id,
    p_caller_role,
    'EVIDENCE_EXPORT',
    'evidence_export',
    p_export_id::text,
    jsonb_build_object('approverCount', array_length(v_next_approvers, 1), 'derivedStatus', v_derived_status),
    NULL,
    NULL
  );

  RETURN jsonb_build_object(
    'id', p_export_id,
    'approvers', v_next_approvers,
    'derivedStatus', v_derived_status,
    'auditId', v_audit_id
  );
END;
$$;

COMMENT ON FUNCTION p_export_approve(uuid, uuid, role_name) IS
  'Replaces app/api/exports/[id]/approve/route.ts. Atomically appends the caller to evidence_export.approved_by and appends the EVIDENCE_EXPORT audit row in one transaction. SECURITY DEFINER bypasses RLS, so this function explicitly re-checks auth_role() IN (INVESTIGATING_OFFICER, SUPERVISING_OFFICER) and case_id IN auth_caller_cases(), replicating evidence_export_case_scoped_update (20260908000002). Preserves, unchanged, the route''s existing application-layer guardrails (no self-approval, no double-approval, no re-approval once GENERATED, >=1 SUPERVISING_OFFICER among approvers once count >= 2) and does not touch the DB-level evidence_export_dual_approval CHECK constraint, which still fires on the UPDATE below exactly as it does today.';

-- ====================================================================
-- Grants
-- ====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_filter_team_decide(uuid, uuid, text, text) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_officer_accept_invite() TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_officer_set_home_jurisdiction(uuid, uuid, jurisdiction, role_name) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_case_create(jurisdiction, text, text[], uuid) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_subject_create(uuid, text, jsonb, uuid, role_name) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_export_create(uuid, uuid[], text, text, uuid, role_name) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_export_approve(uuid, uuid, role_name) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_filter_team_decide(uuid, uuid, text, text) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_officer_accept_invite() TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_officer_set_home_jurisdiction(uuid, uuid, jurisdiction, role_name) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_case_create(jurisdiction, text, text[], uuid) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_subject_create(uuid, text, jsonb, uuid, role_name) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_export_create(uuid, uuid[], text, text, uuid, role_name) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_export_approve(uuid, uuid, role_name) TO service_role';
  END IF;
END $$;

COMMIT;
