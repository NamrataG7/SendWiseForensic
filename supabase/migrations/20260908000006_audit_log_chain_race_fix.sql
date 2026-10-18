-- Fix: audit_log_compute_hash() read-then-insert race (flagged by Oracle
-- during the AUDIT-ATOMICITY design gate, fixed here as its own change).
--
-- The trigger does `SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1`
-- with no locking. Under READ COMMITTED (Postgres default), two concurrent
-- transactions inserting into audit_log (e.g. two officers approving two
-- different warrants at the same instant, each going through one of the
-- AUDIT-ATOMICITY functions) can both read the same "latest" row before
-- either commits, producing two rows that both claim the same prev_hash --
-- a silent fork in the hash chain. No error, no constraint violation, just
-- two divergent "next" links from the same parent -- undermining the
-- tamper-evidence guarantee this table exists for (BSA_S63).
--
-- Fix (per Oracle design gate, APPROVE WITH MODIFICATIONS -- rejected a
-- pg_advisory_xact_lock(hashtext(...)) in favor of this): a dedicated
-- single-row sentinel table locked via SELECT ... FOR UPDATE immediately
-- before the existing SELECT. Reasons a sentinel row beats an advisory
-- lock here: (a) no hash-collision surface -- an unrelated advisory lock
-- elsewhere that happens to hash to the same 32-bit int would silently
-- coalesce with this one; a dedicated row has no such risk; (b) operational
-- observability -- row locks show up in pg_locks joined to pg_class/
-- pg_stat_activity with an actual relation name, legible during an
-- incident, whereas advisory lock integers are opaque; (c) semantic fit --
-- this is "the tail of the chain is a contended resource, serialize
-- access to it," which is exactly the row-lock model, not the
-- no-natural-row-exists case advisory locks are usually reached for.
--
-- Scope: deliberately GLOBAL (one lock for the whole audit_log table, not
-- scoped per target_type/case). The table has exactly one hash chain
-- (one prev_hash/hash lineage), not a partitioned one, so a scoped lock
-- would not actually eliminate the race for writes from different scopes
-- sharing the same global ORDER BY id DESC LIMIT 1 -- it would only
-- reintroduce the bug for cross-scope concurrency while adding complexity.
-- At this system's actual concurrency profile (a judicial-oversight
-- console, not a high-throughput consumer app), full serialization is the
-- correct, simple choice.
--
-- IMPORTANT latency note (per Oracle): this lock is held for the duration
-- of the ENTIRE enclosing transaction, not just this trigger's own few
-- lines -- since p_append_audit() (and this trigger) is typically called
-- from inside the AUDIT-ATOMICITY functions, which already hold OTHER row
-- locks (e.g. a `SELECT ... FOR UPDATE` on the authorization row being
-- mutated) acquired BEFORE this one. Lock ordering is uniformly
-- "domain row lock -> this sentinel lock," never the reverse, in every
-- caller in this codebase today -- so there is no deadlock cycle. But any
-- transaction that is slow for any reason holds this global lock for its
-- full duration, serializing every other audit write in the system behind
-- it. Keep these RPC functions short. No `lock_timeout` is set here --
-- if a stuck transaction becomes an operational problem, consider setting
-- `lock_timeout` at the connection/session level as a follow-up; not
-- added speculatively in this migration.

BEGIN;

CREATE TABLE audit_log_chain_tail (
  id boolean PRIMARY KEY DEFAULT true CHECK (id)
);

COMMENT ON TABLE audit_log_chain_tail IS
  'Single-row sentinel, locked via SELECT ... FOR UPDATE inside audit_log_compute_hash() to serialize concurrent audit_log inserts and prevent a read-then-insert hash-chain fork. Never updated; the row exists only to be locked.';

INSERT INTO audit_log_chain_tail (id) VALUES (true);

-- No RLS needed: this table is read-locked only, from inside a
-- SECURITY DEFINER trigger function (audit_log_compute_hash runs with the
-- definer's privileges same as the table owner), never queried directly
-- by any route or client role. Matches audit_log itself, which is also
-- writable only via p_append_audit(), not direct client access.
REVOKE ALL ON audit_log_chain_tail FROM PUBLIC;

CREATE OR REPLACE FUNCTION audit_log_compute_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_hash  text;
  v_payload    text;
BEGIN
  -- Serialize all audit_log inserts globally for the duration of the
  -- enclosing transaction (see migration comment above for rationale and
  -- the latency tradeoff this implies).
  PERFORM 1 FROM audit_log_chain_tail FOR UPDATE;

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

COMMIT;
