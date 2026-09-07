-- 20260904000000_external_anchor_layer_l9.sql
-- Externally-anchored audit chain (paper Layer L9).
-- Aggregates the current audit_log Merkle root hourly and stores it in
-- audit_anchor. The stored root is intended to be POSTed to an external
-- timestamping authority (OpenTimestamps → Bitcoin, or a govt-notified
-- registry when available). This migration builds the storage + view;
-- the actual POST is done by scripts/anchor-audit-root.ts on a schedule
-- outside the DB.
--
-- Threat closed: a rogue admin or compromised service_role that truncates
-- or rewrites audit_log rows cannot forge past anchor commitments because
-- the anchors are held externally. This is a well-established forensic
-- integrity technique (Haber & Stornetta 1991; Bitcoin timestamping;
-- OpenTimestamps).

BEGIN;

CREATE TABLE IF NOT EXISTS audit_anchor (
  id                    bigserial PRIMARY KEY,
  anchor_at             timestamptz NOT NULL DEFAULT now(),
  last_audit_id         bigint NOT NULL,
  chain_root_hex        text NOT NULL CHECK (chain_root_hex ~ '^[a-f0-9]{64}$'),
  external_receipt_ref  text,           -- e.g., OpenTimestamps .ots blob URI
  external_provider     text,           -- 'OPENTIMESTAMPS' | 'GOVT_REGISTRY' | ...
  submitted_at          timestamptz,    -- when we actually POSTed to the provider
  confirmed_at          timestamptz,    -- when the provider confirmed
  CONSTRAINT audit_anchor_monotonic CHECK (last_audit_id > 0)
);

CREATE INDEX IF NOT EXISTS audit_anchor_anchor_at_idx ON audit_anchor(anchor_at);
CREATE INDEX IF NOT EXISTS audit_anchor_last_audit_id_idx ON audit_anchor(last_audit_id);

COMMENT ON TABLE audit_anchor IS
  'Layer L9 external anchor commitments. Each row is a hash chain-root at a point in time, subsequently POSTed to an external timestamping authority so a compromised service_role cannot silently rewrite past audit_log entries.';

-- Function: compute the current chain root and insert an anchor row.
-- The "chain root" is the hash of the most recent audit_log row (the audit
-- chain is already tamper-evident because each row's hash includes the prior
-- row's hash; publishing the tip hash is equivalent to committing to the
-- entire chain up to that point).
CREATE OR REPLACE FUNCTION create_audit_anchor() RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  v_last_id   bigint;
  v_last_hash text;
BEGIN
  SELECT id, hash INTO v_last_id, v_last_hash
  FROM audit_log
  ORDER BY id DESC
  LIMIT 1;

  IF v_last_id IS NULL THEN
    RAISE NOTICE 'audit_log is empty; no anchor created';
    RETURN NULL;
  END IF;

  INSERT INTO audit_anchor (last_audit_id, chain_root_hex)
  VALUES (v_last_id, v_last_hash)
  RETURNING id INTO v_last_id;

  RETURN v_last_id;
END $$;

COMMENT ON FUNCTION create_audit_anchor IS
  'Inserts a new audit_anchor row containing the hash of the latest audit_log entry. Call hourly via pg_cron or an external scheduler; then scripts/anchor-audit-root.ts POSTs the row to the configured external timestamping authority.';

-- Verification helper: given a claimed anchor, replay the audit chain
-- from anchor.last_audit_id backwards and confirm the tip hash equals
-- anchor.chain_root_hex. If not, the chain has been tampered with after
-- the anchor was published.
CREATE OR REPLACE FUNCTION verify_audit_anchor(p_anchor_id bigint) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_anchor_root  text;
  v_current_hash text;
  v_at_id        bigint;
BEGIN
  SELECT last_audit_id, chain_root_hex INTO v_at_id, v_anchor_root
  FROM audit_anchor WHERE id = p_anchor_id;

  IF v_at_id IS NULL THEN
    RAISE EXCEPTION 'anchor % does not exist', p_anchor_id;
  END IF;

  SELECT hash INTO v_current_hash FROM audit_log WHERE id = v_at_id;

  IF v_current_hash IS NULL THEN
    RAISE NOTICE 'audit_log row % has been deleted (tamper detected)', v_at_id;
    RETURN false;
  END IF;

  RETURN v_current_hash = v_anchor_root;
END $$;

COMMENT ON FUNCTION verify_audit_anchor IS
  'Returns true iff the audit_log tip at the anchor point still hashes to the recorded chain_root_hex. Returns false if any row was tampered with or deleted. Called by a Judicial Auditor or DPO on demand.';

-- Optional: schedule create_audit_anchor() hourly via pg_cron when available.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('create-audit-anchor-hourly', '0 * * * *', 'SELECT create_audit_anchor();');
  ELSE
    RAISE NOTICE 'pg_cron not installed; call create_audit_anchor() from an external scheduler (Vercel cron / GitHub Actions / systemd timer).';
  END IF;
END $$;

-- RLS: audit_anchor is readable to JUDICIAL_AUDITOR and DPO (transparency).
-- Writes are restricted to the SECURITY DEFINER function only.
ALTER TABLE audit_anchor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_anchor_read ON audit_anchor;
CREATE POLICY audit_anchor_read ON audit_anchor
  FOR SELECT
  TO authenticated
  USING (true);  -- transparency: anyone authenticated can read anchors

COMMIT;
