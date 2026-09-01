-- MonitoringSession, Evidence, EvidenceExport, FilterTeamReview,
-- PrivilegeContactRegistry, SubjectObjection.
-- Encodes the hard invariants from docs/ENTITY_MODEL.md §3.

-- ------------------------------------------------------------------
-- monitoring_session
-- ------------------------------------------------------------------
CREATE TABLE monitoring_session (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id            uuid NOT NULL REFERENCES "authorization"(id) ON DELETE RESTRICT,
  device_id                   uuid NOT NULL REFERENCES device(id)        ON DELETE RESTRICT,
  started_at                  timestamptz NOT NULL DEFAULT now(),
  ends_at                     timestamptz NOT NULL,
  -- Subset of "authorization".scope.dataCategories; validated by trigger.
  collected_categories        data_category[] NOT NULL DEFAULT '{}',
  auto_termination_triggers   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                      monitoring_session_status NOT NULL DEFAULT 'ACTIVE',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT monitoring_session_ends_after_start CHECK (ends_at > started_at)
);

COMMENT ON TABLE  monitoring_session IS 'A time-bounded collection window on a device under a specific authorization.';
COMMENT ON COLUMN monitoring_session.ends_at IS 'IT_RULES_2009_R11: MUST be <= "authorization".expires_on. Enforced by trigger.';
COMMENT ON COLUMN monitoring_session.collected_categories IS 'IT_RULES_2009_R7: MUST be a subset of "authorization".scope.dataCategories. Enforced by trigger.';

CREATE TRIGGER monitoring_session_set_updated_at
  BEFORE UPDATE ON monitoring_session
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX monitoring_session_auth_idx   ON monitoring_session(authorization_id);
CREATE INDEX monitoring_session_device_idx ON monitoring_session(device_id);
CREATE INDEX monitoring_session_status_idx ON monitoring_session(status);

-- Trigger: enforce ends_at <= "authorization".expires_on
-- and collected_categories ⊆ "authorization".scope.dataCategories.
CREATE OR REPLACE FUNCTION enforce_monitoring_session_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_expires_on  timestamptz;
  v_scope_cats  text[];
  v_status      authorization_status;
  v_bad         text[];
BEGIN
  SELECT a.expires_on,
         COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(a.scope->'dataCategories')),
           '{}'::text[]
         ),
         a.status
    INTO v_expires_on, v_scope_cats, v_status
    FROM "authorization" a
   WHERE a.id = NEW.authorization_id;

  IF v_expires_on IS NULL THEN
    RAISE EXCEPTION 'monitoring_session references unknown authorization %', NEW.authorization_id;
  END IF;

  -- Invariant §3.2: ends_at <= "authorization".expires_on.
  IF NEW.ends_at > v_expires_on THEN
    RAISE EXCEPTION
      'monitoring_session.ends_at (%) exceeds "authorization".expires_on (%)',
      NEW.ends_at, v_expires_on
      USING ERRCODE = 'check_violation';
  END IF;

  -- Invariant §3.3: collected_categories ⊆ "authorization".scope.dataCategories.
  IF NEW.collected_categories IS NOT NULL AND array_length(NEW.collected_categories, 1) IS NOT NULL THEN
    SELECT array_agg(c::text)
      INTO v_bad
      FROM unnest(NEW.collected_categories) c
      WHERE c::text <> ALL (v_scope_cats);
    IF v_bad IS NOT NULL AND array_length(v_bad, 1) > 0 THEN
      RAISE EXCEPTION
        'monitoring_session.collected_categories % not in "authorization".scope.dataCategories %',
        v_bad, v_scope_cats
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER monitoring_session_enforce_scope
  BEFORE INSERT OR UPDATE OF ends_at, collected_categories, authorization_id
  ON monitoring_session
  FOR EACH ROW EXECUTE FUNCTION enforce_monitoring_session_scope();

-- ------------------------------------------------------------------
-- evidence
-- ------------------------------------------------------------------
CREATE TABLE evidence (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES monitoring_session(id) ON DELETE RESTRICT,
  category              evidence_category NOT NULL,
  captured_at           timestamptz NOT NULL,
  payload_hash          text NOT NULL,                       -- SHA-256 hex
  payload_ref           text NOT NULL,                       -- encrypted cold-storage ref
  -- TODO(HARDWARE-KEYSTORE): device_signature must be verified against device.hardware_backed_pub_key.
  device_signature      bytea,
  prev_evidence_hash    text,                                -- chain link within session
  privilege_flag        privilege_category NOT NULL DEFAULT 'NONE',
  quarantine_status     quarantine_status,
  redactions_applied    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  evidence IS 'Collected payload row. Immutable after insert (no updated_at).';
COMMENT ON COLUMN evidence.payload_hash IS 'BSA_S63: SHA-256 of raw payload underpins §63 certificate.';
COMMENT ON COLUMN evidence.prev_evidence_hash IS 'BSA_S63: per-session hash chain for tamper detection.';
COMMENT ON COLUMN evidence.privilege_flag IS 'BSA privilege categories. Non-NONE triggers auto-quarantine.';
COMMENT ON COLUMN evidence.quarantine_status IS 'PENDING_FILTER routes to Filter Team; SUPPRESSED hidden from all non-auditor roles.';

CREATE INDEX evidence_session_idx      ON evidence(session_id);
CREATE INDEX evidence_captured_at_idx  ON evidence(captured_at);
CREATE INDEX evidence_quarantine_idx   ON evidence(quarantine_status) WHERE quarantine_status IS NOT NULL;
CREATE INDEX evidence_privilege_idx    ON evidence(privilege_flag) WHERE privilege_flag <> 'NONE';

-- Invariant §3.1: evidence insert only when "authorization".status = 'ACTIVE'.
CREATE OR REPLACE FUNCTION enforce_evidence_active_authorization()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status      authorization_status;
  v_expires_on  timestamptz;
  v_scope_cats  text[];
BEGIN
  SELECT a.status, a.expires_on,
         COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(a.scope->'dataCategories')),
           '{}'::text[]
         )
    INTO v_status, v_expires_on, v_scope_cats
    FROM monitoring_session ms
    JOIN "authorization" a ON a.id = ms.authorization_id
   WHERE ms.id = NEW.session_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'evidence references unknown session %', NEW.session_id;
  END IF;

  IF v_status <> 'ACTIVE' THEN
    RAISE EXCEPTION
      'evidence insert refused: underlying authorization status is % (must be ACTIVE)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.captured_at > v_expires_on THEN
    RAISE EXCEPTION
      'evidence.captured_at (%) is after "authorization".expires_on (%)',
      NEW.captured_at, v_expires_on
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.category::text <> ALL (v_scope_cats) THEN
    RAISE EXCEPTION
      'evidence.category % is not within authorization scope %',
      NEW.category, v_scope_cats
      USING ERRCODE = 'check_violation';
  END IF;

  -- Auto-quarantine privileged content per ENTITY_MODEL.md attack model.
  IF NEW.privilege_flag <> 'NONE' AND NEW.quarantine_status IS NULL THEN
    NEW.quarantine_status := 'PENDING_FILTER';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER evidence_enforce_active_authorization
  BEFORE INSERT ON evidence
  FOR EACH ROW EXECUTE FUNCTION enforce_evidence_active_authorization();

-- ------------------------------------------------------------------
-- evidence_export
-- ------------------------------------------------------------------
CREATE TABLE evidence_export (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                           uuid NOT NULL REFERENCES "case"(id) ON DELETE RESTRICT,
  evidence_ids                      uuid[] NOT NULL,
  requested_by                      uuid NOT NULL REFERENCES officer(id),
  approved_by                       uuid[] NOT NULL DEFAULT '{}',
  purpose                           export_purpose NOT NULL,
  -- Auto-generated BSA §63 certificate document reference.
  bsa_section_63_certificate_ref    text,
  exported_at                       timestamptz,
  recipient_notice                  text NOT NULL,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),

  -- Invariant §3.5: dual-officer approval required (at least 2 distinct approvers).
  CONSTRAINT evidence_export_dual_approval CHECK (
    array_length(approved_by, 1) >= 2
  ),
  CONSTRAINT evidence_export_evidence_nonempty CHECK (
    array_length(evidence_ids, 1) >= 1
  )
);

COMMENT ON TABLE  evidence_export IS 'Export request. Dual-officer approval CHECK; SUPERVISING_OFFICER presence enforced at API layer.';
COMMENT ON COLUMN evidence_export.approved_by IS 'ENTITY_MODEL §3.5: >= 2 approvers, >= 1 SUPERVISING_OFFICER. Second half enforced at API layer.';
COMMENT ON COLUMN evidence_export.bsa_section_63_certificate_ref IS 'BSA_S63: auto-generated §63 certificate accompanying exported electronic evidence.';

CREATE TRIGGER evidence_export_set_updated_at
  BEFORE UPDATE ON evidence_export
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX evidence_export_case_idx      ON evidence_export(case_id);
CREATE INDEX evidence_export_requested_idx ON evidence_export(requested_by);

-- ------------------------------------------------------------------
-- filter_team_review
-- ------------------------------------------------------------------
CREATE TABLE filter_team_review (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id    uuid NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  reviewer_id    uuid NOT NULL REFERENCES officer(id),
  decision       text NOT NULL CHECK (decision IN ('RELEASE','SUPPRESS','REDACT_AND_RELEASE')),
  reason         text NOT NULL,
  reviewed_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE filter_team_review IS 'Filter Team decision on a quarantined evidence row. TODO(FILTER-TEAM-INDEPENDENCE).';

CREATE INDEX filter_team_review_evidence_idx ON filter_team_review(evidence_id);

-- ------------------------------------------------------------------
-- privilege_contact_registry
-- ------------------------------------------------------------------
CREATE TABLE privilege_contact_registry (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_identifier    text NOT NULL,  -- SHA-256 hex of phone/email/handle
  category              privilege_category NOT NULL,
  source                text NOT NULL,  -- e.g., 'BAR_COUNCIL_INDIA', 'MEDICAL_COUNCIL', 'SUBJECT_DECLARED'
  verified_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_identifier, category)
);

COMMENT ON TABLE privilege_contact_registry IS
  'Hashed contact identifiers used by the ingest quarantine router. TODO(BAR-COUNCIL-FEED).';
COMMENT ON COLUMN privilege_contact_registry.contact_identifier IS
  'SHA-256 of normalized phone/email/handle. Raw contact never stored.';

CREATE TRIGGER privilege_contact_registry_set_updated_at
  BEFORE UPDATE ON privilege_contact_registry
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
-- subject_objection
-- ------------------------------------------------------------------
CREATE TABLE subject_objection (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id                  uuid NOT NULL REFERENCES "authorization"(id) ON DELETE RESTRICT,
  filed_by_counsel_id               uuid NOT NULL REFERENCES officer(id),
  grounds                           text NOT NULL,
  status                            text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','UNDER_REVIEW','UPHELD','DISMISSED')),
  reviewed_by_review_committee_at   timestamptz,
  resolution                        text,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE subject_objection IS
  'Objection filed via defense counsel portal against an authorization. TODO(COUNSEL-PORTAL).';

CREATE TRIGGER subject_objection_set_updated_at
  BEFORE UPDATE ON subject_objection
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX subject_objection_auth_idx ON subject_objection(authorization_id);
