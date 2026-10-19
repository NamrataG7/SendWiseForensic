-- Fix: evidence_export_dual_approval CHECK constraint makes it
-- mathematically impossible for any export to ever receive even its
-- FIRST approval.
--
-- CONSTRAINT evidence_export_dual_approval CHECK (
--   array_length(approved_by, 1) >= 2
-- )
--
-- This CHECK fires on every INSERT/UPDATE of the row, not just at some
-- "final" state. Creation works (array_length() returns NULL for an
-- empty array, and NULL in a CHECK is UNKNOWN, which passes -- see the
-- comment in app/api/exports/route.ts that already documented this).
-- But the FIRST real approval transitions approved_by from '{}' to a
-- single-element array (length 1), and 1 >= 2 is false -- the UPDATE
-- is rejected outright. Confirmed live via the real UI: clicking
-- "Approve export" (the very first approval, by a SUPERVISING_OFFICER)
-- failed with 'new row for relation "evidence_export" violates check
-- constraint "evidence_export_dual_approval"'. No evidence export has
-- ever received a single approval since this constraint was created
-- (20260831110904) -- a complete, unconditional blocker on the entire
-- BSA §63 export/certificate workflow, independent of role, officer
-- count, or any application-layer bug.
--
-- The real "≥2 distinct approvers, ≥1 SUPERVISING_OFFICER" invariant
-- is already correctly enforced where it actually needs to be: in
-- p_export_approve's derivedStatus computation (20260908000004) and in
-- POST /api/exports/[id]/generate, which refuses to generate a
-- certificate unless derivedStatus === 'APPROVED'. The CHECK
-- constraint was redundant even when it worked, and actively wrong
-- given the incremental, multi-officer, multi-request nature of this
-- workflow (a CHECK constraint cannot express "this field will reach
-- >=2 ACROSS SEPARATE transactions from different sessions" -- that is
-- an application-level state machine, not a row invariant).

BEGIN;

ALTER TABLE evidence_export DROP CONSTRAINT IF EXISTS evidence_export_dual_approval;

COMMENT ON COLUMN evidence_export.approved_by IS 'ENTITY_MODEL §3.5: >= 2 approvers, >= 1 SUPERVISING_OFFICER, enforced in application logic (p_export_approve derivedStatus + the generate route''s APPROVED gate) -- NOT a DB CHECK constraint (removed 20260909000013: a >=2-at-all-times CHECK is incompatible with incremental single-approver accumulation across separate officer sessions; it blocked every export from ever receiving its first approval).';

COMMIT;
