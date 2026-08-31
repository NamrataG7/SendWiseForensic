-- Officers, roles, and the many-to-many mapping.
-- See docs/ENTITY_MODEL.md §2.
-- PROTOTYPE — no SSO / no Bar Council ID verification. See PROTOTYPE_NOTICE.md.

-- Shared updated_at trigger function used across the schema.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------
-- role
-- ------------------------------------------------------------------
CREATE TABLE role (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         role_name NOT NULL UNIQUE,
  description  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE role IS 'Fixed set of RBAC roles. See ENTITY_MODEL.md §2.';

-- Seed roles per ENTITY_MODEL.md §2.
INSERT INTO role (name, description) VALUES
  ('INVESTIGATING_OFFICER',  'Case officer; files requests, reviews in-scope evidence.'),
  ('SUPERVISING_OFFICER',    'Signs off on requests before they leave the police organization; approves exports.'),
  ('COMPETENT_AUTHORITY',    'IT_ACT_S69: Union/State Home Secretary or delegate; issues §69 authorizations.'),
  ('REVIEW_COMMITTEE',       'IT_RULES_2009_R22: reviews authorizations every 2 months; approves/revokes.'),
  ('FILTER_TEAM',            'Independent reviewers of privilege-flagged content. TODO(FILTER-TEAM-INDEPENDENCE).'),
  ('PROSECUTOR',             'Read-only, case-scoped; sees exports directed to prosecution.'),
  ('DEFENSE_COUNSEL',        'Subject-side; sees warrant scope and metadata; files objections.'),
  ('JUDICIAL_AUDITOR',       'Cross-case oversight (judge / notified authority); read-only.'),
  ('DPO',                    'DPDPA Data Protection Officer; grievances, compliance.'),
  ('SYSTEM',                 'Automated jobs (expiry, quarantine routing, chain anchoring).');

-- ------------------------------------------------------------------
-- officer
-- ------------------------------------------------------------------
CREATE TABLE officer (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Supabase auth user id, if this officer maps to an authenticated principal.
  auth_user_id        uuid UNIQUE,
  full_name           text NOT NULL,
  service_id          text UNIQUE, -- e.g., IPS batch id, Bar Council reg id
  email               text UNIQUE,
  jurisdiction        jurisdiction NOT NULL DEFAULT 'IN',
  organization        text,        -- e.g., "Delhi Police, Cyber Cell"
  -- TODO(UIDAI-INTEGRATION): real system verifies identity via Aadhaar e-KYC.
  identity_verified   boolean NOT NULL DEFAULT false,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE officer IS 'Human principal in the system. Prototype identity is dummy — see PROTOTYPE_NOTICE.md.';
COMMENT ON COLUMN officer.identity_verified IS 'DPDPA_S8: data fiduciary must verify identity. Prototype = dummy flag. TODO(UIDAI-INTEGRATION).';

CREATE TRIGGER officer_set_updated_at
  BEFORE UPDATE ON officer
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
-- officer_role (many-to-many)
-- ------------------------------------------------------------------
CREATE TABLE officer_role (
  officer_id   uuid NOT NULL REFERENCES officer(id) ON DELETE CASCADE,
  role_id      uuid NOT NULL REFERENCES role(id)    ON DELETE RESTRICT,
  granted_by   uuid REFERENCES officer(id),
  granted_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  PRIMARY KEY (officer_id, role_id)
);

CREATE INDEX officer_role_role_idx    ON officer_role(role_id);
CREATE INDEX officer_role_officer_idx ON officer_role(officer_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE officer_role IS 'Role assignments. Revoked assignments are retained for audit; queries must filter revoked_at IS NULL.';
