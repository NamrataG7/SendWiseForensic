-- Phase 3 remediation (Oracle implementation gate, APPROVE WITH REQUIRED FIXES):
--
-- The new Chrome extension (Phase 3) submits RISK_DETECTION evidence
-- derived from a static placeholder string -- it proves the submission
-- pipeline (enroll -> classify -> hash-chain -> sign -> ack-then-advance
-- -> submit) works end-to-end, but is NOT real browser-activity
-- surveillance (no content_scripts exist yet; capturing real browser
-- activity is an explicitly deferred, separately-gated future phase).
--
-- Without a server-side marker, these synthetic rows are byte-for-byte
-- indistinguishable from genuine Android-captured evidence in the
-- `evidence` table: fully hash-chained, cryptographically signed, same
-- schema, same RLS. A future auditor, defense counsel, or judge has no
-- signal to tell them apart from real surveillance output -- this is
-- worse than missing data, it is misleading data that looks
-- authoritative. `synthetic` makes this distinguishable and queryable at
-- the data layer, and is used by the export-generation route to hard
-- reject any export request that includes a synthetic row (see
-- app/api/exports/[id]/generate/route.ts).
--
-- Defaults to false so the existing Android ingest path (which has no
-- knowledge of this field) is entirely unaffected.

BEGIN;

ALTER TABLE evidence
  ADD COLUMN synthetic boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN evidence.synthetic IS
  'true only for rows produced by a non-production pipeline-validation submission (e.g. the Phase 3 Chrome extension''s placeholder-input RISK_DETECTION cycle) that does not reflect real captured browser activity. Must never be true for evidence derived from an actual monitored subject. Export generation (app/api/exports/[id]/generate/route.ts) hard-rejects any export containing a synthetic=true row.';

COMMIT;
