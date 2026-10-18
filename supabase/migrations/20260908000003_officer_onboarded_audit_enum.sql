-- Enum-add-only migration (must run as its own SQL execution, before any
-- file that references the new label — Postgres refuses to use a newly
-- added enum value in the same transaction that added it; precedent:
-- 20260905000000_device_enrollment_enum.sql, 20260906000001_extension_decide_audit_enum.sql).
--
-- app/api/officer/accept-invite/route.ts has, since it was written, called
--   supabase.rpc('p_append_audit', { p_action: 'OFFICER_ONBOARDED', ... })
-- but 'OFFICER_ONBOARDED' was never added to the audit_action enum. That
-- RPC call has therefore always raised "invalid input value for enum
-- audit_action" at the database layer -- a real, independently-discovered
-- bug found while porting this route to the atomic p_officer_accept_invite
-- function (20260908000004_audit_atomicity_batch2.sql). The route never
-- checked that RPC call's error, so the bug has been silent: the invite
-- is still accepted successfully (200 OK), only the audit row has always
-- failed to be written.
--
-- Fixed here by adding the label the route already assumed existed,
-- rather than reusing a different, less-accurate action.

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'OFFICER_ONBOARDED';
