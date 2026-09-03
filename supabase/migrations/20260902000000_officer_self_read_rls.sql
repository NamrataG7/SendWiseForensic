-- Officer + role self-read policies
-- Without these, an authenticated user cannot see their own officer row
-- (default Supabase RLS blocks all reads via the anon/authenticated JWT).

-- Officer: read own row by auth_user_id.
ALTER TABLE officer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS officer_self_read ON officer;
CREATE POLICY officer_self_read ON officer
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Officer_role: read own role assignments.
ALTER TABLE officer_role ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS officer_role_self_read ON officer_role;
CREATE POLICY officer_role_self_read ON officer_role
  FOR SELECT
  TO authenticated
  USING (
    officer_id IN (SELECT id FROM officer WHERE auth_user_id = auth.uid())
  );

-- Role: readable to authenticated (small static catalogue).
ALTER TABLE role ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_read ON role;
CREATE POLICY role_read ON role
  FOR SELECT
  TO authenticated
  USING (true);
