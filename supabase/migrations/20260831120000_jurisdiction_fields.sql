-- SendWiseForensic — Jurisdiction fields, immutability, and cross-jurisdiction contamination guards.
--
-- Complements the trunk-based adapter model documented in README.md
-- ("Jurisdiction adapters" section) and in docs/LEGAL_FRAMEWORK_{IN,US,UK}.md.
--
-- This migration implements four of the eight technical enforcement mechanisms:
--   (1) immutable jurisdiction on Case and Subject
--   (2) Authorization inherits Case.jurisdiction (defense in depth)
--   (4) statute references are jurisdiction-prefixed
--   (5) RLS filters by officer home_jurisdiction (+ explicit grants)
--
-- The remaining four (adapter registry, distinct UI, distinct certificate templates,
-- distinct dummy-verification providers) live in packages/legal-framework/
-- and forensic-console/ and are delivered by sibling PRs.
--
-- NOTE: case.jurisdiction and officer.jurisdiction already exist from the initial
-- migrations. We use ADD COLUMN IF NOT EXISTS where relevant, and add a new
-- officer.home_jurisdiction column as specified in the design.

-- ==================================================================
-- 1. Immutable jurisdiction on Case
-- ==================================================================

-- case.jurisdiction was introduced in 20260831110902_case_subject_device.sql.
-- We re-declare via IF NOT EXISTS for idempotency in downstream environments.
ALTER TABLE "case"
  ADD COLUMN IF NOT EXISTS jurisdiction jurisdiction NOT NULL DEFAULT 'IN';

COMMENT ON COLUMN "case".jurisdiction IS
  'Immutable after INSERT. Fixes the legal-framework adapter for the entire case lifetime. '
  'Changing jurisdiction mid-case would be a BSA_S63 / US_FRE_901 / UK_IPA_2016_S56 '
  'admissibility risk (cross-jurisdiction certificate mixing). Enforced by trigger '
  'case_jurisdiction_immutable.';

CREATE OR REPLACE FUNCTION case_jurisdiction_immutable_fn()
RETURNS trigger AS $$
BEGIN
  IF OLD.jurisdiction IS DISTINCT FROM NEW.jurisdiction THEN
    RAISE EXCEPTION
      'case.jurisdiction is immutable (was %, attempted %). '
      'Cross-jurisdiction re-classification is refused at the DB layer '
      '(README.md "Jurisdiction adapters" mechanism 1).',
      OLD.jurisdiction, NEW.jurisdiction
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS case_jurisdiction_immutable ON "case";
CREATE TRIGGER case_jurisdiction_immutable
  BEFORE UPDATE ON "case"
  FOR EACH ROW EXECUTE FUNCTION case_jurisdiction_immutable_fn();

-- ==================================================================
-- 2. Immutable jurisdiction on Subject
-- ==================================================================

ALTER TABLE subject
  ADD COLUMN IF NOT EXISTS jurisdiction jurisdiction NOT NULL DEFAULT 'IN';

COMMENT ON COLUMN subject.jurisdiction IS
  'Immutable after INSERT. A subject may be involved in multiple cases only within '
  'the same jurisdiction; cross-jurisdiction subjects are modelled as distinct '
  'subject rows per jurisdiction. Enforced by trigger subject_jurisdiction_immutable.';

CREATE OR REPLACE FUNCTION subject_jurisdiction_immutable_fn()
RETURNS trigger AS $$
BEGIN
  IF OLD.jurisdiction IS DISTINCT FROM NEW.jurisdiction THEN
    RAISE EXCEPTION
      'subject.jurisdiction is immutable (was %, attempted %).',
      OLD.jurisdiction, NEW.jurisdiction
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subject_jurisdiction_immutable ON subject;
CREATE TRIGGER subject_jurisdiction_immutable
  BEFORE UPDATE ON subject
  FOR EACH ROW EXECUTE FUNCTION subject_jurisdiction_immutable_fn();

-- ==================================================================
-- 3. Authorization inherits Case.jurisdiction (defense in depth)
-- ==================================================================

ALTER TABLE authorization
  ADD COLUMN IF NOT EXISTS jurisdiction jurisdiction NOT NULL DEFAULT 'IN';

COMMENT ON COLUMN authorization.jurisdiction IS
  'Echoes case.jurisdiction. Defense in depth: even if a service-layer bug wrote '
  'the wrong case_id, the DB trigger authorization_jurisdiction_matches_case '
  'refuses INSERT/UPDATE when this column disagrees with the parent case. '
  'IN_ / US_ / UK_ statute-reference prefix enforcement (trigger '
  'authorization_statute_prefix_matches_jurisdiction) keys off this column.';

CREATE OR REPLACE FUNCTION authorization_jurisdiction_matches_case_fn()
RETURNS trigger AS $$
DECLARE
  case_jur jurisdiction;
BEGIN
  SELECT c.jurisdiction INTO case_jur FROM "case" c WHERE c.id = NEW.case_id;
  IF case_jur IS NULL THEN
    RAISE EXCEPTION
      'authorization.case_id % does not resolve to a case row', NEW.case_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.jurisdiction IS DISTINCT FROM case_jur THEN
    RAISE EXCEPTION
      'authorization.jurisdiction (%) does not match case.jurisdiction (%) for case_id %. '
      'Cross-jurisdiction contamination refused (README.md "Jurisdiction adapters" mechanism 2).',
      NEW.jurisdiction, case_jur, NEW.case_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS authorization_jurisdiction_matches_case ON authorization;
CREATE TRIGGER authorization_jurisdiction_matches_case
  BEFORE INSERT OR UPDATE OF case_id, jurisdiction ON authorization
  FOR EACH ROW EXECUTE FUNCTION authorization_jurisdiction_matches_case_fn();

-- ==================================================================
-- 4. Statute-reference prefix matches jurisdiction
-- ==================================================================
--
-- Every element of authorization.statute_references must start with the
-- jurisdiction's prefix: 'IN_', 'US_', or 'UK_'.
--
-- Empty arrays are allowed (a DRAFT authorization may not yet have citations).
--
-- Legacy exception: the constitutional Puttaswamy code
-- 'CONST_ART_21_PUTTASWAMY_2017' is permitted as-is for backward compatibility
-- with early India records, but new code SHOULD use 'IN_CONST_ART_21_PUTTASWAMY'.

-- Data migration: prefix legacy India codes emitted before this migration.
UPDATE authorization
SET statute_references = ARRAY(
  SELECT
    CASE
      WHEN elem LIKE 'IT_%'
        OR elem LIKE 'BNSS_%'
        OR elem LIKE 'BNS_%'
        OR elem LIKE 'BSA_%'
        OR elem LIKE 'DPDPA_%'
        OR elem LIKE 'CONST_ART_21_PUTTASWAMY%'
      THEN 'IN_' || elem
      ELSE elem
    END
  FROM UNNEST(statute_references) AS elem
)
WHERE jurisdiction = 'IN';

CREATE OR REPLACE FUNCTION authorization_statute_prefix_matches_jurisdiction_fn()
RETURNS trigger AS $$
DECLARE
  elem text;
  required_prefix text;
BEGIN
  -- Empty array is fine (permitted while status = DRAFT).
  IF NEW.statute_references IS NULL OR array_length(NEW.statute_references, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  required_prefix := NEW.jurisdiction::text || '_';

  FOREACH elem IN ARRAY NEW.statute_references LOOP
    -- Legacy exception: the pre-prefix constitutional Puttaswamy code.
    -- Prefer the jurisdiction-prefixed form IN_CONST_ART_21_PUTTASWAMY going forward.
    IF elem LIKE 'CONST_ART_21_PUTTASWAMY%' AND NEW.jurisdiction = 'IN' THEN
      CONTINUE;
    END IF;

    IF position(required_prefix in elem) <> 1 THEN
      RAISE EXCEPTION
        'authorization.statute_references contains element % which does not carry '
        'the jurisdiction prefix % (jurisdiction = %). Cross-prefix contamination '
        'refused (README.md "Jurisdiction adapters" mechanism 4).',
        elem, required_prefix, NEW.jurisdiction
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS authorization_statute_prefix_matches_jurisdiction ON authorization;
CREATE TRIGGER authorization_statute_prefix_matches_jurisdiction
  BEFORE INSERT OR UPDATE OF statute_references, jurisdiction ON authorization
  FOR EACH ROW EXECUTE FUNCTION authorization_statute_prefix_matches_jurisdiction_fn();

-- ==================================================================
-- 5. Officer home_jurisdiction + cross-jurisdiction grant table
-- ==================================================================

ALTER TABLE officer
  ADD COLUMN IF NOT EXISTS home_jurisdiction jurisdiction NOT NULL DEFAULT 'IN';

COMMENT ON COLUMN officer.home_jurisdiction IS
  'Officer''s primary jurisdiction. RLS default is that an officer can only see '
  'case/authorization/evidence rows where row.jurisdiction = officer.home_jurisdiction. '
  'Cross-jurisdiction access requires an explicit officer_jurisdiction_grant row '
  '(rare, e.g., mutual legal assistance).';

CREATE TABLE IF NOT EXISTS officer_jurisdiction_grant (
  officer_id     uuid NOT NULL REFERENCES officer(id) ON DELETE CASCADE,
  jurisdiction   jurisdiction NOT NULL,
  granted_by     uuid NOT NULL REFERENCES officer(id) ON DELETE RESTRICT,
  granted_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  reason         text,
  PRIMARY KEY (officer_id, jurisdiction)
);

COMMENT ON TABLE officer_jurisdiction_grant IS
  'Explicit, uncommon cross-jurisdiction access grant. Populated for the rare officer '
  'who needs read access outside their home_jurisdiction (e.g., MLAT liaison). '
  'TODO(RLS-JURISDICTION-GRANT-UI): forensic-console page to manage these grants '
  'is not yet built; grants are inserted manually via privileged migration for now.';

COMMENT ON COLUMN officer_jurisdiction_grant.granted_by IS
  'Officer who authorised the grant. Audit-log entry ROLE_GRANT is emitted at API layer.';

CREATE INDEX IF NOT EXISTS officer_jurisdiction_grant_officer_idx
  ON officer_jurisdiction_grant(officer_id)
  WHERE revoked_at IS NULL;

-- ==================================================================
-- 6. RLS: jurisdiction filter on case / authorization / evidence
-- ==================================================================
--
-- These policies COMPLEMENT (they do not replace) the existing case-scoped
-- read policies in 20260831110906_rls_and_query_gates.sql. An officer must
-- satisfy BOTH the existing case-scope policy AND the jurisdiction filter.
-- Both are expressed as permissive policies, so PostgreSQL ORs permissive
-- policies within the same command — to get AND semantics we express the
-- jurisdiction check as a RESTRICTIVE policy.

-- Helper: current officer's effective jurisdictions (home + active grants).
CREATE OR REPLACE FUNCTION current_officer_jurisdictions()
RETURNS jurisdiction[] AS $$
DECLARE
  officer_uuid uuid;
  result jurisdiction[];
BEGIN
  BEGIN
    officer_uuid := (auth.jwt() ->> 'officer_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN ARRAY[]::jurisdiction[];
  END;

  IF officer_uuid IS NULL THEN
    RETURN ARRAY[]::jurisdiction[];
  END IF;

  SELECT ARRAY(
    SELECT o.home_jurisdiction FROM officer o WHERE o.id = officer_uuid
    UNION
    SELECT g.jurisdiction
      FROM officer_jurisdiction_grant g
      WHERE g.officer_id = officer_uuid AND g.revoked_at IS NULL
  ) INTO result;

  RETURN COALESCE(result, ARRAY[]::jurisdiction[]);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION current_officer_jurisdictions() IS
  'Effective jurisdiction set for the current auth.jwt() officer: home + active grants. '
  'Empty array if no officer_id claim (blocks all rows under the RESTRICTIVE policies).';

-- case
DROP POLICY IF EXISTS case_jurisdiction_restrict ON "case";
CREATE POLICY case_jurisdiction_restrict
  ON "case"
  AS RESTRICTIVE
  FOR SELECT
  USING (jurisdiction = ANY (current_officer_jurisdictions()));

-- authorization
DROP POLICY IF EXISTS authorization_jurisdiction_restrict ON authorization;
CREATE POLICY authorization_jurisdiction_restrict
  ON authorization
  AS RESTRICTIVE
  FOR SELECT
  USING (jurisdiction = ANY (current_officer_jurisdictions()));

-- evidence (jurisdiction derived via the parent case; we look it up).
-- Evidence rows do not carry a jurisdiction column of their own in the prototype;
-- the parent case's jurisdiction governs. A future migration MAY denormalise
-- jurisdiction onto evidence for performance -- TODO(RLS-JURISDICTION-DENORM).
DROP POLICY IF EXISTS evidence_jurisdiction_restrict ON evidence;
CREATE POLICY evidence_jurisdiction_restrict
  ON evidence
  AS RESTRICTIVE
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM monitoring_session ms
      JOIN authorization a ON a.id = ms.authorization_id
      WHERE ms.id = evidence.session_id
        AND a.jurisdiction = ANY (current_officer_jurisdictions())
    )
  );

-- ==================================================================
-- End of migration.
-- Triggers installed:
--   - case_jurisdiction_immutable            (immutability on case)
--   - subject_jurisdiction_immutable         (immutability on subject)
--   - authorization_jurisdiction_matches_case
--         (authorization.jurisdiction = case.jurisdiction, on INSERT + UPDATE of case_id/jurisdiction)
--   - authorization_statute_prefix_matches_jurisdiction
--         (each statute_references element carries IN_/US_/UK_ prefix, with the
--          legacy CONST_ART_21_PUTTASWAMY exception for India)
-- ==================================================================
