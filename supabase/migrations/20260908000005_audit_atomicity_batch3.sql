-- P0.1 batch 3 (final batch): AUDIT-ATOMICITY fix for evidence ingest.
--
-- Evidence-ingest is categorically different from batches 1 and 2 and was
-- deliberately scoped separately per the original Oracle design gate:
--
--   * app/api/evidence/ingest/route.ts already uses createAdminClient
--     (service-role, bearer-token device auth) -- zero RLS involvement.
--     The RLS-bypass concern that drove batches 1/2's jurisdiction/role
--     re-checks inside each SECURITY DEFINER function does NOT apply here,
--     so this function intentionally has no permission predicate of its
--     own -- the real gate is the device-token + session + authorization
--     validation in the route, which is UNCHANGED by this migration.
--   * It is the highest-volume route (batch insert, up to 100 rows per
--     call). Per the design gate, this pass scopes ONLY "insert the
--     already-validated batch rows + audit, atomically" -- it does NOT
--     port the device-token check, session lookup, or authorization
--     active-window re-check into plpgsql. That validation logic stays
--     exactly where it is today, in TypeScript.
--   * The existing BEFORE INSERT trigger enforce_evidence_active_authorization
--     (20260831110904_monitoring_session_evidence.sql) is defined on the
--     evidence table itself, so it fires per-row regardless of whether the
--     INSERT statement originates from a plain client call or from inside
--     this function -- it is the hard DB-level boundary and remains fully
--     intact and unmodified here.
--
-- Prior to this migration: app/api/evidence/ingest/route.ts did
-- admin.from('evidence').insert(rows) followed by a SEPARATE appendAudit()
-- call, with no compensating action at all if the audit call failed --
-- meaning a successful batch insert with a failed audit call left zero
-- record that the ingest event ever happened, with no attempt to even
-- flag the discrepancy (unlike batches 1/2's now-removed revert attempts).
--
-- Fixed by folding the insert + p_append_audit() call into one
-- SECURITY DEFINER plpgsql function body, which is a single implicit
-- transaction: if the audit call fails (or the trigger rejects any row),
-- the entire batch rolls back together, matching the route's pre-existing
-- all-or-nothing semantics for the insert itself (a single PostgREST
-- insert of multiple rows was already all-or-nothing; this preserves that
-- and extends the same guarantee to the audit call).

BEGIN;

CREATE OR REPLACE FUNCTION p_evidence_ingest_batch(
  p_rows       jsonb,
  p_session_id uuid,
  p_device_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count    integer;
  v_audit_id bigint;
BEGIN
  -- jsonb_to_recordset is the standard plpgsql idiom for turning a jsonb
  -- array of same-shaped objects into a rowset for a bulk INSERT ... SELECT.
  -- Column list and types mirror exactly the `rows = batches.map(...)`
  -- object built in app/api/evidence/ingest/route.ts.
  INSERT INTO evidence (
    session_id,
    category,
    captured_at,
    payload_hash,
    prev_evidence_hash,
    privilege_flag,
    payload_ref,
    device_signature,
    quarantine_status,
    synthetic
  )
  SELECT
    t.session_id,
    t.category,
    t.captured_at,
    t.payload_hash,
    t.prev_evidence_hash,
    t.privilege_flag,
    t.payload_ref,
    t.device_signature,
    t.quarantine_status,
    t.synthetic
  FROM jsonb_to_recordset(p_rows) AS t(
    session_id         uuid,
    category           evidence_category,
    captured_at        timestamptz,
    payload_hash       text,
    prev_evidence_hash text,
    privilege_flag     privilege_category,
    payload_ref        text,
    device_signature   bytea,
    quarantine_status  quarantine_status,
    synthetic          boolean
  );
  -- NOTE: this INSERT ... SELECT is one statement over the whole batch, so
  -- it is already all-or-nothing -- if enforce_evidence_active_authorization
  -- (the BEFORE INSERT trigger on evidence, unmodified by this migration)
  -- rejects any single row, the exception propagates immediately, the
  -- entire INSERT rolls back, and -- because this is all inside one
  -- plpgsql function body / one transaction -- the whole function call
  -- rolls back too. We deliberately do not catch and rewrap that
  -- exception: the trigger's own RAISE EXCEPTION message (which already
  -- names the specific violated invariant) is descriptive enough to
  -- surface as-is through supabase.rpc(...) to the TS caller.

  GET DIAGNOSTICS v_count = ROW_COUNT;

  v_audit_id := p_append_audit(
    NULL,
    'SYSTEM',
    'EVIDENCE_INGEST',
    'monitoring_session',
    p_session_id::text,
    jsonb_build_object('count', v_count, 'device_id', p_device_id),
    NULL,
    NULL
  );

  RETURN jsonb_build_object('accepted', v_count, 'auditId', v_audit_id);
END;
$$;

COMMENT ON FUNCTION p_evidence_ingest_batch(jsonb, uuid, uuid) IS
  'Replaces the insert+appendAudit tail of app/api/evidence/ingest/route.ts. Atomically bulk-inserts an already-validated batch of evidence rows and appends one EVIDENCE_INGEST audit row, in a single transaction. Deliberately carries NO permission predicate of its own -- this route already runs on the service-role admin client (zero RLS involvement) and the real authorization gate (bearer device-token check, session lookup, session/authorization active-window re-validation) remains entirely in TypeScript, unchanged by this migration, per the design gate that scoped evidence-ingest separately from batches 1/2. enforce_evidence_active_authorization (table-level BEFORE INSERT trigger on evidence) still fires per-row exactly as before, and the batch INSERT remains all-or-nothing.';

-- ====================================================================
-- Grants
-- ====================================================================
-- This route only ever calls through the service-role admin client
-- (createAdminClient with SUPABASE_SECRET_KEY), never the per-request
-- authenticated client, so only service_role strictly needs EXECUTE.
-- Granting to authenticated as well matches the established convention
-- in batches 1/2's migrations and is harmless (no RLS bypass risk here
-- since the function performs no row-level authorization decision).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_evidence_ingest_batch(jsonb, uuid, uuid) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_evidence_ingest_batch(jsonb, uuid, uuid) TO service_role';
  END IF;
END $$;

COMMIT;
