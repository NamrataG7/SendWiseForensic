-- Option 3: jurisdiction-scoped admins + dual-control (co-approval) on
-- officer invitations.

BEGIN;

-- 1. Co-approval columns on officer_invitation. Rows are pending until a
-- second ADMIN in the same jurisdiction approves; only then does the
-- server actually send the magic-link email.
ALTER TABLE officer_invitation
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING_COAPPROVAL'
    CHECK (status IN ('PENDING_COAPPROVAL','APPROVED','SENT','USED','REJECTED')),
  ADD COLUMN IF NOT EXISTS coapproved_by uuid REFERENCES officer(id),
  ADD COLUMN IF NOT EXISTS coapproved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

CREATE INDEX IF NOT EXISTS officer_invitation_jurisdiction_idx
  ON officer_invitation (home_jurisdiction);

CREATE INDEX IF NOT EXISTS officer_invitation_status_idx
  ON officer_invitation (status);

-- Prevent an admin from co-approving their own invitation.
CREATE OR REPLACE FUNCTION officer_invitation_prevent_self_coapproval()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.coapproved_by IS NOT NULL AND NEW.coapproved_by = NEW.invited_by THEN
    RAISE EXCEPTION 'invited_by and coapproved_by must differ (dual-control)';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_officer_invitation_no_self_coapproval ON officer_invitation;
CREATE TRIGGER trg_officer_invitation_no_self_coapproval
  BEFORE INSERT OR UPDATE OF coapproved_by ON officer_invitation
  FOR EACH ROW EXECUTE FUNCTION officer_invitation_prevent_self_coapproval();

-- 2. Jurisdiction-scoped RLS on officer_invitation.
DROP POLICY IF EXISTS admin_read_invites   ON officer_invitation;
DROP POLICY IF EXISTS admin_write_invites  ON officer_invitation;
DROP POLICY IF EXISTS admin_update_invites ON officer_invitation;

-- helper: caller's home_jurisdiction (nullable)
CREATE OR REPLACE FUNCTION current_admin_home_jurisdiction() RETURNS jurisdiction
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT o.home_jurisdiction
  FROM officer o
  JOIN officer_role orl ON orl.officer_id = o.id AND orl.revoked_at IS NULL
  JOIN role r           ON r.id = orl.role_id
  WHERE o.auth_user_id = auth.uid()
    AND r.name = 'ADMIN'
  LIMIT 1;
$$;

CREATE POLICY admin_read_invites_scoped ON officer_invitation
  FOR SELECT TO authenticated
  USING (
    current_user_is_admin()
    AND home_jurisdiction = current_admin_home_jurisdiction()
  );

CREATE POLICY admin_write_invites_scoped ON officer_invitation
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_is_admin()
    AND home_jurisdiction = current_admin_home_jurisdiction()
  );

CREATE POLICY admin_update_invites_scoped ON officer_invitation
  FOR UPDATE TO authenticated
  USING (
    current_user_is_admin()
    AND home_jurisdiction = current_admin_home_jurisdiction()
  );

-- 3. Jurisdiction-scoped RLS on officer (extends existing self_read).
DROP POLICY IF EXISTS officer_admin_read_scoped ON officer;
CREATE POLICY officer_admin_read_scoped ON officer
  FOR SELECT TO authenticated
  USING (
    current_user_is_admin()
    AND home_jurisdiction = current_admin_home_jurisdiction()
  );

-- 4. The officer_with_role view is not RLS-protected on its own; queries
-- through it inherit the officer table's policies because we defined the
-- view without SECURITY DEFINER.

COMMIT;
