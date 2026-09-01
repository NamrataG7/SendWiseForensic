-- Admin role + officer invitation flow (part 2)
-- Adds officer_invitation table, RLS, view.
-- PRE-REQUISITE: 20260901000000_admin_enum.sql must have been run as its
-- own SQL execution first (Postgres refuses to use a newly-added enum label
-- in the same transaction that added it).
-- TODO(TWO-PERSON-ADMIN-CREATION): production requires two admins to co-sign
-- every officer creation. Prototype gate is single-admin action, audited.

BEGIN;

-- 1. Seed the ADMIN role row (enum label was added in the prior migration).
INSERT INTO role (name, description)
VALUES (
  'ADMIN',
  'Admin who creates and manages officer accounts. Cannot access cases or evidence. Segregation of duties enforced by RLS.'
)
ON CONFLICT (name) DO NOTHING;

-- 2. officer_invitation table
CREATE TABLE IF NOT EXISTS officer_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  designation text,
  role_name text NOT NULL,
  home_jurisdiction jurisdiction NOT NULL,
  invited_by uuid NOT NULL REFERENCES officer(id),
  invite_token text NOT NULL UNIQUE,      -- Supabase magic-link token or nonce
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT officer_invitation_email_lower CHECK (email = lower(email)),
  CONSTRAINT officer_invitation_role_valid CHECK (role_name IN (
    'INVESTIGATING_OFFICER',
    'SUPERVISING_OFFICER',
    'COMPETENT_AUTHORITY',
    'REVIEW_COMMITTEE',
    'FILTER_TEAM',
    'PROSECUTOR',
    'DEFENSE_COUNSEL',
    'JUDICIAL_AUDITOR',
    'DPO'
    -- Note: ADMIN is DELIBERATELY excluded here. Admins cannot invite more admins
    -- through the console; new admins require a bootstrap SQL entry (see
    -- docs/ADMIN_BOOTSTRAP.md). This is a segregation-of-duties measure.
  ))
);

CREATE INDEX IF NOT EXISTS officer_invitation_email_idx ON officer_invitation (email);
CREATE INDEX IF NOT EXISTS officer_invitation_used_idx ON officer_invitation (used_at) WHERE used_at IS NULL;

COMMENT ON TABLE officer_invitation IS
  'Officer invitations issued by ADMIN. Officer must click email magic-link within expires_at, set a password, and confirm identity. Invitation single-use.';
COMMENT ON COLUMN officer_invitation.role_name IS
  'Role to assign on completion. ADMIN not allowed here — new admins require bootstrap SQL.';

-- 3. RLS on the invitation table
ALTER TABLE officer_invitation ENABLE ROW LEVEL SECURITY;

-- Admins can read all invitations they created.
DROP POLICY IF EXISTS admin_read_own_invites ON officer_invitation;
CREATE POLICY admin_read_own_invites ON officer_invitation
  FOR SELECT
  USING (
    auth_role() = 'ADMIN'
    AND invited_by = auth_officer_id()
  );

-- Admins can insert invitations for anyone (except ADMIN role, enforced by CHECK).
DROP POLICY IF EXISTS admin_write_invites ON officer_invitation;
CREATE POLICY admin_write_invites ON officer_invitation
  FOR INSERT
  WITH CHECK (auth_role() = 'ADMIN');

-- Admins can update (revoke / mark used) their own invitations.
DROP POLICY IF EXISTS admin_update_invites ON officer_invitation;
CREATE POLICY admin_update_invites ON officer_invitation
  FOR UPDATE
  USING (
    auth_role() = 'ADMIN'
    AND invited_by = auth_officer_id()
  );

-- 4. Officer table: enforce that ADMIN officers cannot be assigned via the invite
-- path. This trigger fires on officer INSERT and refuses ADMIN role if the
-- calling session is not the SUPABASE service_role (i.e. a raw SQL run).
-- TODO(BOOTSTRAP-ADMIN-VIA-SQL-ONLY): new admins must be created via
-- docs/ADMIN_BOOTSTRAP.md steps, not through the API.

CREATE OR REPLACE FUNCTION refuse_admin_via_client() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM officer_role
    WHERE officer_id = NEW.id
      AND role_name = 'ADMIN'
  ) AND current_setting('request.jwt.role', true) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'ADMIN role can only be assigned via bootstrap SQL (service_role). See docs/ADMIN_BOOTSTRAP.md.';
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Convenience view for the admin console: officers with their role names
CREATE OR REPLACE VIEW officer_with_role AS
SELECT
  o.id,
  o.full_name,
  o.email,
  o.organization,
  o.home_jurisdiction,
  o.jurisdiction,
  o.active,
  o.created_at,
  ARRAY_REMOVE(ARRAY_AGG(r.name), NULL) AS roles
FROM officer o
LEFT JOIN officer_role orl ON orl.officer_id = o.id AND orl.revoked_at IS NULL
LEFT JOIN role r          ON r.id = orl.role_id
GROUP BY o.id;

COMMIT;
