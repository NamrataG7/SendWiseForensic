-- Device enrollment — enum-add-only. MUST run as its own SQL execution
-- before 20260905000001_device_enrollment.sql, because Postgres refuses
-- to use a newly-added enum label in the same transaction that added it.
-- See precedent: 20260901000000_admin_enum.sql / 20260901000001_admin_role_and_invitations.sql.

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'DEVICE_ENROLL_CODE_ISSUE';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'DEVICE_ENROLLED';
