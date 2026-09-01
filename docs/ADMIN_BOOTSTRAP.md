# Admin Bootstrap — one-time SQL

This is the ONLY way to create ADMIN accounts. It cannot be done through the console (segregation of duties: admins cannot create other admins, only officers).

## Prerequisites

- Supabase project provisioned
- All migrations under `supabase/migrations/` applied in filename order:
  - Run `20260901000000_admin_enum.sql` **alone** as its own execution first (Postgres refuses to use a newly-added enum label in the same transaction).
  - Then run the rest.

## Two-Admin Bootstrap (recommended)

### Step 1 — Create the two auth users in Supabase

Supabase Dashboard → **Authentication → Users → Add user → Create new user**:

- Admin A: `admin-a@yourdomain.com`, password of your choice, **Auto Confirm User: ON**
- Admin B: `admin-b@yourdomain.com`, password of your choice, **Auto Confirm User: ON**

Copy the UID of each (long UUID). You'll use them in Step 2.

### Step 2 — Bind the auth users to `officer` + ADMIN role

Supabase Dashboard → **SQL Editor** → new query. Edit the four `<...>` placeholders, then run:

```sql
BEGIN;

-- Admin A
INSERT INTO officer (auth_user_id, full_name, email, organization, jurisdiction, home_jurisdiction, active)
VALUES (
  '<admin-a-auth-uid>'::uuid,
  '<Admin A Full Name>',
  'admin-a@yourdomain.com',
  'System Administrator',
  'IN',
  'IN',
  true
)
ON CONFLICT (auth_user_id) DO NOTHING;

INSERT INTO officer_role (officer_id, role_id)
SELECT o.id, r.id
FROM officer o, role r
WHERE o.auth_user_id = '<admin-a-auth-uid>'::uuid
  AND r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

-- Admin B
INSERT INTO officer (auth_user_id, full_name, email, organization, jurisdiction, home_jurisdiction, active)
VALUES (
  '<admin-b-auth-uid>'::uuid,
  '<Admin B Full Name>',
  'admin-b@yourdomain.com',
  'System Administrator',
  'IN',
  'IN',
  true
)
ON CONFLICT (auth_user_id) DO NOTHING;

INSERT INTO officer_role (officer_id, role_id)
SELECT o.id, r.id
FROM officer o, role r
WHERE o.auth_user_id = '<admin-b-auth-uid>'::uuid
  AND r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

COMMIT;
```

## Verify

```sql
SELECT o.email, o.full_name, r.name AS role
FROM officer o
JOIN officer_role orl ON orl.officer_id = o.id
JOIN role r           ON r.id = orl.role_id
WHERE r.name = 'ADMIN';
```

Should return two rows.

## Sign in

Go to `<your-vercel-url>/admin/login` → sign in with an admin email + password. You'll land on `/admin`.

## To rotate an admin

1. Add the new admin via the SQL block above (repeat with new UID + email).
2. Deactivate the outgoing admin:
   ```sql
   UPDATE officer SET active = false WHERE email = 'outgoing@yourdomain.com';
   ```
3. Optionally revoke their Supabase Auth session in the Dashboard.

## To promote an existing officer to admin

```sql
INSERT INTO officer_role (officer_id, role_id)
SELECT o.id, r.id
FROM officer o, role r
WHERE o.email = 'existing-officer@yourdomain.com'
  AND r.name = 'ADMIN';
```

## Prototype stubs

- `TODO(TWO-PERSON-ADMIN-CREATION)` — real system requires two admin signatures to co-approve every officer creation. Prototype records `invited_by` on `officer_invitation` but does not enforce co-sign.
- `TODO(ADMIN-MFA)` — real system requires 2FA/hardware key for ADMIN role.
- `TODO(BOOTSTRAP-ADMIN-VIA-SQL-ONLY)` — refused in the DB trigger `refuse_admin_via_client`.
