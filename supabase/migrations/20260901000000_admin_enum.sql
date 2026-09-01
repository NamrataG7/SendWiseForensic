-- Admin role — enum-add-only. MUST run as its own SQL execution before
-- 20260901000001_admin_role_and_invitations.sql, because Postgres refuses
-- to use a newly-added enum label in the same transaction that added it.

ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'ADMIN';
