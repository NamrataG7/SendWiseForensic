-- Case / Subject / Device — the investigative context.
-- See docs/ENTITY_MODEL.md §1.

-- ------------------------------------------------------------------
-- case  (quoted — CASE is a reserved word in SQL)
-- ------------------------------------------------------------------
CREATE TABLE "case" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction        jurisdiction NOT NULL DEFAULT 'IN',
  external_case_ref   text NOT NULL,        -- e.g., FIR number
  offences            text[] NOT NULL DEFAULT '{}', -- BNS section codes
  status              case_status NOT NULL DEFAULT 'OPEN',
  created_by          uuid NOT NULL REFERENCES officer(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  closed_at           timestamptz,
  UNIQUE (jurisdiction, external_case_ref)
);

COMMENT ON TABLE "case" IS 'Investigative case. external_case_ref is the FIR/CR number under BNSS.';
COMMENT ON COLUMN "case".offences IS 'BNS_2023: array of Bharatiya Nyaya Sanhita section codes (e.g., ["BNS_318", "BNS_303"]).';

CREATE TRIGGER case_set_updated_at
  BEFORE UPDATE ON "case"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
-- case_officer  (many-to-many: assigned officers per case)
-- ------------------------------------------------------------------
CREATE TABLE case_officer (
  case_id      uuid NOT NULL REFERENCES "case"(id) ON DELETE CASCADE,
  officer_id   uuid NOT NULL REFERENCES officer(id) ON DELETE RESTRICT,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  PRIMARY KEY (case_id, officer_id)
);

CREATE INDEX case_officer_officer_idx ON case_officer(officer_id) WHERE unassigned_at IS NULL;
CREATE INDEX case_officer_case_idx    ON case_officer(case_id)    WHERE unassigned_at IS NULL;

COMMENT ON TABLE case_officer IS 'Assignment of officers to cases. Used by RLS scope-rewriting policies (ENTITY_MODEL.md §3.4).';

-- ------------------------------------------------------------------
-- subject
-- ------------------------------------------------------------------
CREATE TABLE subject (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pseudonymous_label    text NOT NULL UNIQUE,   -- e.g., "SUBJ-2026-000123"
  -- identity_refs holds hashed refs only. Raw Aadhaar / PAN never stored.
  identity_refs         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE subject IS 'Person under investigation. UI uses pseudonymous_label by default (Puttaswamy proportionality).';
COMMENT ON COLUMN subject.identity_refs IS 'DPDPA_S8 + AADHAAR_ACT_S29: hashes only (aadhaarHash, panHash). Raw IDs never stored. TODO(UIDAI-INTEGRATION).';

CREATE TRIGGER subject_set_updated_at
  BEFORE UPDATE ON subject
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
-- device
-- ------------------------------------------------------------------
CREATE TABLE device (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id               uuid NOT NULL REFERENCES subject(id) ON DELETE RESTRICT,
  platform                 text NOT NULL DEFAULT 'ANDROID',
  -- TODO(PLAY-INTEGRITY): device_fingerprint should be a Play Integrity attestation payload.
  device_fingerprint       text NOT NULL,
  -- TODO(HARDWARE-KEYSTORE): hardware_backed_pub_key populated post-attestation.
  hardware_backed_pub_key  text,
  enrolled_at              timestamptz NOT NULL DEFAULT now(),
  last_seen_at             timestamptz,
  status                   device_status NOT NULL DEFAULT 'ENROLLED',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, device_fingerprint)
);

COMMENT ON TABLE device IS 'Android device enrolled under a subject. Only ANDROID supported in prototype.';
COMMENT ON COLUMN device.hardware_backed_pub_key IS 'BSA_S63: hardware-backed key underpins evidence signature admissibility. TODO(HARDWARE-KEYSTORE).';

CREATE TRIGGER device_set_updated_at
  BEFORE UPDATE ON device
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX device_subject_idx ON device(subject_id);
