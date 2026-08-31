-- Authorization — the warrant / order that gates all collection.
-- See docs/ENTITY_MODEL.md §1 and §3.6.

CREATE TABLE authorization (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                         uuid NOT NULL REFERENCES "case"(id)   ON DELETE RESTRICT,
  subject_id                      uuid NOT NULL REFERENCES subject(id)  ON DELETE RESTRICT,
  type                            authorization_type NOT NULL,
  -- Free-text legitimate aim; adapter validates against jurisdiction-specific enum at API layer.
  legitimate_aim                  text NOT NULL,
  issuing_authority_id            uuid NOT NULL REFERENCES officer(id),
  issued_on                       timestamptz NOT NULL,
  expires_on                      timestamptz NOT NULL,
  -- scope: { dataCategories[], devices[], timeWindows[], keywords[], contextApps[] }
  scope                           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 4 Puttaswamy prongs: legality, legitimateAim, necessity, proportionality.
  proportionality_checklist       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Review Committee approval object. REQUIRED for JUDICIAL_WARRANT before ACTIVE (enforced at API layer).
  -- TODO(REVIEW-COMMITTEE-QUORUM): prototype allows single-user approval.
  review_committee_approval       jsonb,
  statute_references              text[] NOT NULL DEFAULT '{}',
  -- SHA-256 of the uploaded, signed order PDF.
  -- TODO(ESIGN-VERIFICATION): prototype does not verify signing cert.
  signed_order_document_hash      text,
  signed_order_document_ref       text,   -- encrypted storage ref
  dpdpa_exemption_ref             text,   -- required if invoking DPDPA §17
  status                          authorization_status NOT NULL DEFAULT 'DRAFT',
  revocation_log                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT authorization_expiry_after_issue CHECK (expires_on > issued_on),
  CONSTRAINT authorization_scope_is_object    CHECK (jsonb_typeof(scope) = 'object'),
  CONSTRAINT authorization_revocation_is_array CHECK (jsonb_typeof(revocation_log) = 'array'),
  CONSTRAINT authorization_prop_is_object     CHECK (jsonb_typeof(proportionality_checklist) = 'object'),
  -- Judicial warrants MUST carry a signed order document hash before leaving DRAFT.
  -- Full "ACTIVE requires all four prongs justified + review committee" invariant is
  -- enforced at API/service layer (see ENTITY_MODEL.md §3.6). We keep only the
  -- structurally checkable pieces at the DB.
  CONSTRAINT authorization_active_requires_signed_order CHECK (
    status IN ('DRAFT', 'PENDING_REVIEW')
    OR signed_order_document_hash IS NOT NULL
  )
);

COMMENT ON TABLE  authorization IS
  'IT_ACT_S69 / IT_RULES_2009: legal basis for collection. Immutable once ACTIVE except for status transitions and revocation_log appends.';
COMMENT ON COLUMN authorization.expires_on IS
  'IT_RULES_2009_R11: max 60 days per order, 180 days total per subject for JUDICIAL_WARRANT. Cumulative cap enforced at API layer.';
COMMENT ON COLUMN authorization.scope IS
  'IT_RULES_2009_R7: scope is narrow-tailored — dataCategories[], devices[], timeWindows[], keywords[], contextApps[].';
COMMENT ON COLUMN authorization.proportionality_checklist IS
  'PUTTASWAMY_2017: four prongs (legality, legitimateAim, necessity, proportionality) — each with justification text.';
COMMENT ON COLUMN authorization.review_committee_approval IS
  'IT_RULES_2009_R22: approval by Review Committee. TODO(REVIEW-COMMITTEE-QUORUM).';
COMMENT ON COLUMN authorization.statute_references IS
  'Statute codes invoked, e.g., ["IT_ACT_S69","IT_RULES_2009_R3","BNSS_S94"].';
COMMENT ON COLUMN authorization.signed_order_document_hash IS
  'BSA_S63: SHA-256 hash of the uploaded, e-signed order PDF. TODO(ESIGN-VERIFICATION).';
COMMENT ON COLUMN authorization.dpdpa_exemption_ref IS
  'DPDPA_S17: reference to the exemption notification invoked, if any.';
COMMENT ON COLUMN authorization.revocation_log IS
  'Append-only JSONB array: [{actor, reason, timestamp}]. Never overwrite prior entries.';

CREATE TRIGGER authorization_set_updated_at
  BEFORE UPDATE ON authorization
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX authorization_case_idx           ON authorization(case_id);
CREATE INDEX authorization_subject_idx        ON authorization(subject_id);
CREATE INDEX authorization_status_idx         ON authorization(status);
CREATE INDEX authorization_active_expiry_idx  ON authorization(expires_on) WHERE status = 'ACTIVE';
