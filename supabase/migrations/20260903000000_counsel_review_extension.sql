-- Counsel access + Review Committee co-sign + Warrant Extension flows.

BEGIN;

-- ----- Counsel access requests ---------------------------------------------
CREATE TABLE IF NOT EXISTS counsel_access_request (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          text NOT NULL,
  bar_council_id     text NOT NULL,
  email              text NOT NULL CHECK (email = lower(email)),
  case_ref           text NOT NULL,
  jurisdiction       jurisdiction NOT NULL,
  reason             text NOT NULL,
  status             text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','GRANTED','REVOKED')),
  approved_by        uuid REFERENCES officer(id),
  approved_at        timestamptz,
  magic_link_sent_at timestamptz,
  reject_reason      text,
  case_id            uuid REFERENCES "case"(id) ON DELETE SET NULL,
  granted_until      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS counsel_access_request_status_idx
  ON counsel_access_request (status);
CREATE INDEX IF NOT EXISTS counsel_access_request_email_idx
  ON counsel_access_request (email);

ALTER TABLE counsel_access_request ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS counsel_admin_all ON counsel_access_request;
CREATE POLICY counsel_admin_all ON counsel_access_request
  FOR ALL TO authenticated
  USING (current_user_is_admin())
  WITH CHECK (current_user_is_admin());

-- ----- Review Committee co-sign on authorization ---------------------------
ALTER TABLE "authorization"
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (review_status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS review_approved_by uuid REFERENCES officer(id),
  ADD COLUMN IF NOT EXISTS review_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_reject_reason text;

-- ----- Warrant extension requests ------------------------------------------
CREATE TABLE IF NOT EXISTS authorization_extension (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_authorization_id  uuid NOT NULL REFERENCES "authorization"(id) ON DELETE CASCADE,
  requested_by             uuid NOT NULL REFERENCES officer(id),
  requested_at             timestamptz NOT NULL DEFAULT now(),
  requested_new_expires_on timestamptz NOT NULL,
  justification            text NOT NULL,
  proportionality_refresh  jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_status          text NOT NULL DEFAULT 'PENDING'
    CHECK (decision_status IN ('PENDING','APPROVED','DENIED')),
  decided_by               uuid REFERENCES officer(id),
  decided_at               timestamptz,
  decision_reason          text,
  statute_reference        text NOT NULL
);
CREATE INDEX IF NOT EXISTS authorization_extension_parent_idx
  ON authorization_extension (parent_authorization_id);
CREATE INDEX IF NOT EXISTS authorization_extension_status_idx
  ON authorization_extension (decision_status);

ALTER TABLE authorization_extension ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS extension_case_officer_read ON authorization_extension;
CREATE POLICY extension_case_officer_read ON authorization_extension
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS extension_case_officer_write ON authorization_extension;
CREATE POLICY extension_case_officer_write ON authorization_extension
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMIT;
