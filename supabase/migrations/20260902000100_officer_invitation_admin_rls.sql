-- Replace the officer_invitation RLS policies to work with our schema.
-- Prior policies relied on auth_role() / auth_officer_id() which read from
-- JWT claims that Supabase does not populate. Rewrite to check ADMIN via
-- a subquery on officer + officer_role.

ALTER TABLE officer_invitation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_read_own_invites ON officer_invitation;
DROP POLICY IF EXISTS admin_write_invites   ON officer_invitation;
DROP POLICY IF EXISTS admin_update_invites  ON officer_invitation;

-- Helper: is the caller an ADMIN?
CREATE OR REPLACE FUNCTION current_user_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM officer o
    JOIN officer_role orl ON orl.officer_id = o.id AND orl.revoked_at IS NULL
    JOIN role r           ON r.id = orl.role_id
    WHERE o.auth_user_id = auth.uid()
      AND r.name = 'ADMIN'
  );
$$;

CREATE POLICY admin_read_invites ON officer_invitation
  FOR SELECT
  TO authenticated
  USING (current_user_is_admin());

CREATE POLICY admin_write_invites ON officer_invitation
  FOR INSERT
  TO authenticated
  WITH CHECK (current_user_is_admin());

CREATE POLICY admin_update_invites ON officer_invitation
  FOR UPDATE
  TO authenticated
  USING (current_user_is_admin());
