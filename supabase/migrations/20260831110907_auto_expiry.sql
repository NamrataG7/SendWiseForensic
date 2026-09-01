-- Auto-expiry job.
-- See docs/ENTITY_MODEL.md §4.
-- Flips ACTIVE → EXPIRED, cascades sessions → AUTO_TERMINATED, and appends audit rows.

CREATE OR REPLACE FUNCTION expire_authorizations()
RETURNS TABLE (
  expired_authorizations bigint,
  terminated_sessions    bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_ids   uuid[];
  v_session_ids   uuid[];
  v_expired_count bigint := 0;
  v_session_count bigint := 0;
  v_auth_id       uuid;
  v_session_id    uuid;
BEGIN
  -- 1) Flip authorizations.
  WITH expired AS (
    UPDATE "authorization"
       SET status     = 'EXPIRED',
           updated_at = now()
     WHERE status     = 'ACTIVE'
       AND expires_on < now()
     RETURNING id
  )
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_expired_ids FROM expired;

  v_expired_count := COALESCE(array_length(v_expired_ids, 1), 0);

  -- 2) Cascade sessions.
  IF v_expired_count > 0 THEN
    WITH terminated AS (
      UPDATE monitoring_session
         SET status     = 'AUTO_TERMINATED',
             updated_at = now()
       WHERE authorization_id = ANY (v_expired_ids)
         AND status IN ('ACTIVE','PAUSED')
       RETURNING id
    )
    SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_session_ids FROM terminated;

    v_session_count := COALESCE(array_length(v_session_ids, 1), 0);
  END IF;

  -- 3) Append audit rows via the sanctioned function.
  IF v_expired_count > 0 THEN
    FOREACH v_auth_id IN ARRAY v_expired_ids LOOP
      PERFORM p_append_audit(
        NULL, 'SYSTEM', 'AUTH_EXPIRE',
        'authorization', v_auth_id::text,
        jsonb_build_object('reason', 'expires_on < now()')
      );
    END LOOP;
  END IF;

  IF v_session_count > 0 THEN
    FOREACH v_session_id IN ARRAY v_session_ids LOOP
      PERFORM p_append_audit(
        NULL, 'SYSTEM', 'SESSION_AUTO_TERMINATE',
        'monitoring_session', v_session_id::text,
        jsonb_build_object('reason', 'parent authorization expired')
      );
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_expired_count, v_session_count;
END;
$$;

COMMENT ON FUNCTION expire_authorizations IS
  'IT_RULES_2009_R11 auto-enforcement: expire ACTIVE authorizations past expires_on and terminate their sessions. See ENTITY_MODEL.md §4.';

-- ------------------------------------------------------------------
-- Scheduling
-- ------------------------------------------------------------------
-- Preferred: pg_cron every minute. Guarded so migration does not fail when the
-- extension is not available (e.g., local Supabase without pg_cron enabled).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
      -- Remove any prior schedule with the same name (idempotent re-run).
      PERFORM cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname = 'sendwiseforensic_expire_authorizations';
      PERFORM cron.schedule(
        'sendwiseforensic_expire_authorizations',
        '* * * * *',
        $cron$SELECT public.expire_authorizations();$cron$
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron present but unable to schedule (insufficient privilege?). See supabase/README.md.';
    END;
  ELSE
    RAISE NOTICE 'pg_cron not available. Configure Supabase Scheduled Function to call public.expire_authorizations() every minute. See supabase/README.md.';
  END IF;
END $$;

-- TODO(NIGHTLY-SEAL): nightly job to move evidence under EXPIRED/REVOKED authorizations
-- older than 6 months into sealed cold storage per IT_RULES_2009_R23. Not implemented in prototype.
