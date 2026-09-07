-- 20260904000100_extension_cap_trigger.sql
-- Enforces IT Rules 2009 R.11's 180-day cumulative cap at the DB layer.
-- Only fires for India §69 warrants (jurisdiction = 'IN' AND type =
-- 'JUDICIAL_WARRANT'). US Title III renewals and UK IPA renewals have no
-- absolute cumulative cap in statute; the trigger is a no-op for those.

BEGIN;

CREATE OR REPLACE FUNCTION authorization_extension_within_cap()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_parent_jurisdiction jurisdiction;
  v_parent_type         authorization_type;
  v_parent_start        timestamptz;
  v_parent_expires      timestamptz;
  v_parent_days         numeric;
  v_prior_days          numeric;
  v_requested_days      numeric;
  v_total_cap           numeric := 180;  -- IT Rules 2009 R.11
BEGIN
  IF NEW.decision_status <> 'APPROVED' THEN
    RETURN NEW;
  END IF;

  SELECT jurisdiction, type, issued_on, expires_on
  INTO v_parent_jurisdiction, v_parent_type, v_parent_start, v_parent_expires
  FROM "authorization"
  WHERE id = NEW.parent_authorization_id;

  IF v_parent_jurisdiction <> 'IN' OR v_parent_type <> 'JUDICIAL_WARRANT' THEN
    -- No statutory cumulative cap outside India §69.
    RETURN NEW;
  END IF;

  v_parent_days :=
    EXTRACT(EPOCH FROM (v_parent_expires - v_parent_start)) / 86400.0;

  SELECT COALESCE(
    SUM(EXTRACT(EPOCH FROM (requested_new_expires_on - v_parent_expires)) / 86400.0),
    0)
  INTO v_prior_days
  FROM authorization_extension
  WHERE parent_authorization_id = NEW.parent_authorization_id
    AND id <> NEW.id
    AND decision_status = 'APPROVED';

  v_requested_days :=
    EXTRACT(EPOCH FROM (NEW.requested_new_expires_on - v_parent_expires)) / 86400.0;

  IF (v_parent_days + v_prior_days + v_requested_days) > v_total_cap THEN
    RAISE EXCEPTION
      'IT_RULES_2009_R11: cumulative duration would exceed 180 days (parent %.1f d + prior extensions %.1f d + this extension %.1f d = %.1f d)',
      v_parent_days, v_prior_days, v_requested_days,
      v_parent_days + v_prior_days + v_requested_days;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_authorization_extension_within_cap ON authorization_extension;
CREATE TRIGGER trg_authorization_extension_within_cap
  BEFORE INSERT OR UPDATE OF decision_status, requested_new_expires_on
  ON authorization_extension
  FOR EACH ROW EXECUTE FUNCTION authorization_extension_within_cap();

COMMENT ON FUNCTION authorization_extension_within_cap IS
  'Enforces IT Rules 2009 R.11 180-day cumulative cap on India §69 warrant extensions. No-op for US Title III and UK IPA renewals which have no absolute statutory cumulative cap. Fires only when an extension row transitions to APPROVED (or is inserted APPROVED).';

COMMIT;
