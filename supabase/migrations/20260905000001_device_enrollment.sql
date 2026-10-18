-- Device enrollment (part 2): device_enrollment_code table + device.ingest_token_hash.
-- PRE-REQUISITE: 20260905000000_device_enrollment_enum.sql must have been run as its
-- own SQL execution first (Postgres refuses to use a newly-added enum label
-- in the same transaction that added it).
--
-- Design: officer-generated, single-use, 30-min-TTL enrollment code — the
-- device is a pure consumer, never a producer. The code is bound to a
-- specific ACTIVE authorization (not just case/subject), so revocation/
-- expiry propagates for free via the existing
-- enforce_evidence_active_authorization trigger. See
-- .slim/deepwork/forensic-port.md "Phase 1 design".

BEGIN;

-- ------------------------------------------------------------------
-- enrollment_code_status
-- ------------------------------------------------------------------
CREATE TYPE enrollment_code_status AS ENUM (
  'PENDING',
  'REDEEMED',
  'EXPIRED',
  'REVOKED'
);

-- ------------------------------------------------------------------
-- device_enrollment_code
-- ------------------------------------------------------------------
CREATE TABLE device_enrollment_code (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id    uuid NOT NULL REFERENCES "authorization"(id) ON DELETE RESTRICT,
  subject_id          uuid NOT NULL REFERENCES subject(id)        ON DELETE RESTRICT,
  code_hash           text NOT NULL UNIQUE,     -- sha256 hex of the raw code; raw code never stored
  issued_by           uuid NOT NULL REFERENCES officer(id),
  issued_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  status              enrollment_code_status NOT NULL DEFAULT 'PENDING',
  redeemed_at         timestamptz,
  redeemed_device_id  uuid REFERENCES device(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT device_enrollment_code_expiry_after_issue CHECK (expires_at > issued_at)
);

COMMENT ON TABLE device_enrollment_code IS
  'Officer-issued, single-use, 30-min-TTL code used to bind a device to a specific ACTIVE authorization. Only the sha256 hash of the raw code is stored (never the raw code itself).';
COMMENT ON COLUMN device_enrollment_code.code_hash IS
  'sha256 hex of the raw 8-char Crockford base32 code (XXXX-XXXX). Raw code is shown once to the issuing officer and never persisted.';
COMMENT ON COLUMN device_enrollment_code.subject_id IS
  'Must match "authorization".subject_id for authorization_id — enforced by device_enrollment_code_subject_matches_auth trigger below. A device can only ever enroll against the subject named in the authorization, not any case.';

CREATE INDEX device_enrollment_code_auth_idx    ON device_enrollment_code(authorization_id);
CREATE INDEX device_enrollment_code_subject_idx ON device_enrollment_code(subject_id);
CREATE INDEX device_enrollment_code_status_idx  ON device_enrollment_code(status);

-- Invariant: subject_id must match the referenced authorization's own
-- subject_id. Proportionality/authorization-scope must gate what a device
-- can even enroll against — a device must attach to an authorized subject,
-- not any case.
CREATE OR REPLACE FUNCTION enforce_enrollment_code_subject_matches_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_auth_subject_id uuid;
BEGIN
  SELECT a.subject_id
    INTO v_auth_subject_id
    FROM "authorization" a
   WHERE a.id = NEW.authorization_id;

  IF v_auth_subject_id IS NULL THEN
    RAISE EXCEPTION 'device_enrollment_code references unknown authorization %', NEW.authorization_id;
  END IF;

  IF NEW.subject_id <> v_auth_subject_id THEN
    RAISE EXCEPTION
      'device_enrollment_code.subject_id (%) does not match "authorization".subject_id (%) for authorization %',
      NEW.subject_id, v_auth_subject_id, NEW.authorization_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER device_enrollment_code_subject_matches_auth
  BEFORE INSERT OR UPDATE OF authorization_id, subject_id
  ON device_enrollment_code
  FOR EACH ROW EXECUTE FUNCTION enforce_enrollment_code_subject_matches_auth();

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------
ALTER TABLE device_enrollment_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_enrollment_code FORCE ROW LEVEL SECURITY;

-- SYSTEM sees/does everything (background jobs, the public enroll endpoint
-- runs under service_role which defaults to SYSTEM per auth_role()).
CREATE POLICY device_enrollment_code_system_all
  ON device_enrollment_code
  FOR ALL
  USING (auth_role() = 'SYSTEM')
  WITH CHECK (auth_role() = 'SYSTEM');

-- Officers may insert enrollment codes only for authorizations tied to
-- cases they are assigned to.
CREATE POLICY device_enrollment_code_officer_insert
  ON device_enrollment_code
  FOR INSERT
  WITH CHECK (
    auth_role() IN ('INVESTIGATING_OFFICER', 'SUPERVISING_OFFICER')
    AND authorization_id IN (
      SELECT id FROM "authorization" WHERE case_id IN (SELECT auth_caller_cases())
    )
  );

-- Officers may read enrollment codes (metadata only — code_hash is useless
-- without the raw code) scoped to their assigned cases.
CREATE POLICY device_enrollment_code_officer_read
  ON device_enrollment_code
  FOR SELECT
  USING (
    auth_role() IN ('INVESTIGATING_OFFICER', 'SUPERVISING_OFFICER')
    AND authorization_id IN (
      SELECT id FROM "authorization" WHERE case_id IN (SELECT auth_caller_cases())
    )
  );

-- ------------------------------------------------------------------
-- device.ingest_token_hash — closes an existing hole where
-- /api/evidence/ingest had zero per-device credential.
-- ------------------------------------------------------------------
ALTER TABLE device ADD COLUMN ingest_token_hash text;

COMMENT ON COLUMN device.ingest_token_hash IS
  'sha256 hex of the per-device evidence-ingest bearer token, generated at enrollment time (POST /api/devices/enroll). Raw token is shown once and never persisted.';

CREATE UNIQUE INDEX device_ingest_token_hash_idx
  ON device(ingest_token_hash)
  WHERE ingest_token_hash IS NOT NULL;

COMMIT;
