# Admin Bootstrap — one-time SQL

This is the ONLY way to create ADMIN accounts. It cannot be done through the console (segregation of duties: admins cannot create other admins, only officers). This limitation is intentional.

## Prerequisites
- Supabase project provisioned
- All migrations under `supabase/migrations/` have been applied

## Two-Admin Bootstrap (recommended)

You need two admins for co-signing officer creation in a real deployment. For the prototype, both simply exist as ADMIN role; UI dual-control is a follow-up.

### Step 1 — Create the two auth users in Supabase

Supabase Dashboard → **Authentication → Users → Add user → Create new user**:

- Admin A: `admin-a@yourdomain.com`, password of your choice, **Auto Confirm User: ON**
- Admin B: `admin-b@yourdomain.com`, password of your choice, **Auto Confirm User: ON**

Copy the UID of each user (long UUID). You'll use them in Step 2.

### Step 2 — Bind the auth users to officer + ADMIN role

Supabase Dashboard → **SQL Editor** → new query → paste, edit the four `<...>` placeholders, then run:

```sql
BEGIN;

-- Admin A
INSERT INTO officer (id, full_name, email, designation, home_jurisdiction, status)
VALUES (
  '<admin-a-auth-uid>'::uuid,
  '<Admin A Full Name>',
  'admin-a@yourdomain.com',
  'System Administrator',
  'IN',
  'ACTIVE'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO officer_role (officer_id, role_name)
VALUES ('<admin-a-auth-uid>'::uuid, 'ADMIN')
ON CONFLICT DO NOTHING;

-- Admin B
INSERT INTO officer (id, full_name, email, designation, home_jurisdiction, status)
VALUES (
  '<admin-b-auth-uid>'::uuid,
  '<Admin B Full Name>',
  'admin-b@yourdomain.com',
  'System Administrator',
  'IN',
  'ACTIVE'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO officer_role (officer_id, role_name)
VALUES ('<admin-b-auth-uid>'::uuid, 'ADMIN')
ON CONFLICT DO NOTHING;

COMMIT;
```

## Verify

```sql
SELECT o.email, o.full_name, orl.role_name
FROM officer o
JOIN officer_role orl ON orl.officer_id = o.id
WHERE orl.role_name = 'ADMIN';
```

Should return exactly two rows.

## Sign in

Go to `<your-vercel-url>/admin/login` → enter admin email + password. You'll land on `/admin` with the officer management console.

## To rotate an admin

There is no in-app "change admin" flow. Rotate by:

1. Adding the new admin via the SQL steps above.
2. Setting the outgoing admin's `status = 'INACTIVE'`:
   ```sql
   UPDATE officer SET status = 'INACTIVE' WHERE email = 'outgoing@yourdomain.com';
   ```
3. Optionally revoking their Supabase Auth session in the Dashboard.

## To promote an existing officer to admin

Only via SQL:

```sql
INSERT INTO officer_role (officer_id, role_name)
VALUES ((SELECT id FROM officer WHERE email = 'existing-officer@yourdomain.com'), 'ADMIN');
```

## Prototype stubs

- `TODO(TWO-PERSON-ADMIN-CREATION)` — real system requires two admin signatures to co-approve every officer creation. Prototype records `invited_by` on `officer_invitation` but does not enforce co-sign.
- `TODO(ADMIN-MFA)` — real system requires 2FA/hardware key for ADMIN role.
- `TODO(BOOTSTRAP-ADMIN-VIA-SQL-ONLY)` — refused in the DB trigger `refuse_admin_via_client`.
