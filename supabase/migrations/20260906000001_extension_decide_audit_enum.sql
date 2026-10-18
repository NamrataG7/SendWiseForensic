-- Phase 2 remediation (Oracle gate 4, ora-5, BLOCK verdict — issue 2 of 2):
--
-- The Phase 2 extensions/[id]/decide/route.ts rewrite reused AUTH_APPROVE
-- (for extension-approve) and AUTH_SUSPEND (for extension-deny) since no
-- dedicated enum values existed and that phase's scope excluded new
-- migrations. AUTH_APPROVE is semantically accurate for approve (it does
-- change authorization.expires_on). AUTH_SUSPEND for deny is NOT accurate:
-- authorization.status is completely untouched on deny, yet the action
-- enum literally asserts "the authorization was suspended" — this creates
-- a false record for anyone/anything querying audit_log by action type
-- (e.g. "was authorization X ever suspended?"), which is the primary way
-- an auditor would reconstruct history, not by opening every row's JSON
-- context payload. A misleadingly-labeled audit decision is exactly the
-- kind of integrity defect this whole porting phase exists to fix.
--
-- Fix: add two dedicated, accurate enum values. Enum-add-only migration
-- per the established repo precedent (20260901000000_admin_enum.sql /
-- 20260905000000_device_enrollment_enum.sql) — must run as its own SQL
-- execution before any file that references the new labels, since
-- Postgres refuses to use a newly-added enum value in the same
-- transaction that added it.

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EXTENSION_APPROVE';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EXTENSION_DENY';
