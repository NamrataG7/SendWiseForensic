-- Append-only, hash-chained audit log.
-- See docs/ENTITY_MODEL.md §3.7 and attack model.
-- TODO(EXTERNAL-ANCHORING): periodic Merkle root anchoring to external timestamping authority.

CREATE TABLE IF NOT EXISTS audit_log (
  id             bigserial PRIMARY KEY,
  prev_hash      text,               -- hex-encoded sha256; NULL only for the very first row
  actor_id       uuid,               -- officer.id or NULL for SYSTEM
  actor_role     role_name NOT NULL,
  action         audit_action NOT NULL,
  target_type    text,
  target_id      text,
  context        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip             inet,
  device_info    text,
  timestamp      timestamptz NOT NULL DEFAULT now(),
  hash           text NOT NULL       -- hex-encoded sha256 over prev_hash || canonical payload
);

COMMENT ON TABLE  audit_log IS
  'Append-only hash-chained audit log. Writable only via p_append_audit(). UPDATE/DELETE revoked from all non-superuser roles.';
COMMENT ON COLUMN audit_log.hash IS
  'BSA_S63 / integrity: sha256(prev_hash || canonical row payload). Chain break detects tampering.';

CREATE INDEX IF NOT EXISTS audit_log_actor_idx     ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx    ON audit_log(action);
CREATE INDEX IF NOT EXISTS audit_log_target_idx    ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON audit_log(timestamp);

-- ------------------------------------------------------------------
-- Hash computation trigger
-- ------------------------------------------------------------------
-- The trigger:
--   1. Fetches the most recent row's hash and pins NEW.prev_hash to it.
--   2. Computes NEW.hash = sha256(prev_hash || canonical_payload).
-- Any client-supplied prev_hash/hash is overwritten — the DB is the source of truth.
CREATE OR REPLACE FUNCTION audit_log_compute_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_hash  text;
  v_payload    text;
BEGIN
  SELECT hash
    INTO v_prev_hash
    FROM audit_log
   ORDER BY id DESC
   LIMIT 1;

  NEW.prev_hash := v_prev_hash;  -- NULL for the first row

  v_payload := concat_ws('|',
    COALESCE(v_prev_hash, ''),
    COALESCE(NEW.actor_id::text, ''),
    NEW.actor_role::text,
    NEW.action::text,
    COALESCE(NEW.target_type, ''),
    COALESCE(NEW.target_id, ''),
    COALESCE(NEW.context::text, '{}'),
    COALESCE(NEW.ip::text, ''),
    COALESCE(NEW.device_info, ''),
    NEW.timestamp::text
  );

  NEW.hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_compute_hash_trg ON audit_log;
CREATE TRIGGER audit_log_compute_hash_trg
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_compute_hash();

-- ------------------------------------------------------------------
-- Append-only enforcement
-- ------------------------------------------------------------------
-- Even if a role somehow slips past the REVOKE, the trigger below rejects
-- UPDATE and DELETE unconditionally.
CREATE OR REPLACE FUNCTION audit_log_reject_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only; % is forbidden', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

-- Revoke UPDATE/DELETE from all Supabase-facing roles.
-- (Postgres superuser bypasses these grants; that is acceptable for the prototype.)
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON audit_log FROM anon';
    EXECUTE 'REVOKE INSERT             ON audit_log FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON audit_log FROM authenticated';
    EXECUTE 'REVOKE INSERT             ON audit_log FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON audit_log FROM service_role';
    -- service_role retains INSERT so the sanctioned function can run under it.
  END IF;
END $$;

-- ------------------------------------------------------------------
-- Sanctioned write path
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION p_append_audit(
  p_actor_id      uuid,
  p_actor_role    role_name,
  p_action        audit_action,
  p_target_type   text        DEFAULT NULL,
  p_target_id     text        DEFAULT NULL,
  p_context       jsonb       DEFAULT '{}'::jsonb,
  p_ip            inet        DEFAULT NULL,
  p_device_info   text        DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO audit_log (
    actor_id, actor_role, action, target_type, target_id, context, ip, device_info
  ) VALUES (
    p_actor_id, p_actor_role, p_action, p_target_type, p_target_id, p_context, p_ip, p_device_info
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION p_append_audit IS
  'Only sanctioned write path for audit_log. SECURITY DEFINER — grants callers the ability to append rows without direct INSERT privilege.';

-- Grant execute to Supabase-facing roles (guarded).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_append_audit(uuid, role_name, audit_action, text, text, jsonb, inet, text) TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION p_append_audit(uuid, role_name, audit_action, text, text, jsonb, inet, text) TO service_role';
  END IF;
END $$;
