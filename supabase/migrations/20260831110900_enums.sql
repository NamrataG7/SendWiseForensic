-- SendWiseForensic — ENUM definitions
-- See docs/ENTITY_MODEL.md §1 for source.
-- PROTOTYPE — statute references cite Indian legal framework (IT Act, 2009 Rules, BNS, BNSS, BSA, DPDPA).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Jurisdiction: only IN is implemented in the prototype adapter.
-- TODO(LEGAL-FRAMEWORK-ADAPTER): US / UK adapters not yet implemented.
CREATE TYPE jurisdiction AS ENUM ('IN', 'US', 'UK');

-- Authorization pathway.
-- IT_ACT_S69 + IT_RULES_2009: JUDICIAL_WARRANT is the primary pathway for prototype.
CREATE TYPE authorization_type AS ENUM (
  'JUDICIAL_WARRANT',
  'BAIL_CONDITION',
  'PROBATION_ORDER',
  'PLEA_AGREEMENT',
  'CORPORATE_INSIDER',
  'VOLUNTARY_VICTIM'
);

CREATE TYPE authorization_status AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'REVOKED'
);

-- Data categories capturable under an authorization scope.
CREATE TYPE data_category AS ENUM (
  'KEYSTROKE_BATCH',
  'APP_EVENT',
  'COMMS_METADATA',
  'RISK_DETECTION'
);

-- Privilege categories per BSA / advocate-client privilege / medical confidentiality.
CREATE TYPE privilege_category AS ENUM (
  'NONE',
  'LEGAL',
  'MEDICAL',
  'CLERGY',
  'SPOUSAL',
  'UNKNOWN'
);

-- Evidence category mirrors data_category for evidence rows.
CREATE TYPE evidence_category AS ENUM (
  'KEYSTROKE_BATCH',
  'APP_EVENT',
  'COMMS_METADATA',
  'RISK_DETECTION'
);

CREATE TYPE quarantine_status AS ENUM (
  'PENDING_FILTER',
  'RELEASED',
  'SUPPRESSED'
);

CREATE TYPE case_status AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'CLOSED',
  'SEALED'
);

CREATE TYPE device_status AS ENUM (
  'ENROLLED',
  'UNINSTALLED',
  'TAMPERED'
);

CREATE TYPE monitoring_session_status AS ENUM (
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'AUTO_TERMINATED'
);

CREATE TYPE export_purpose AS ENUM (
  'COURT_SUBMISSION',
  'INTERNAL_REVIEW',
  'DEFENSE_DISCLOSURE'
);

-- Role names. See ENTITY_MODEL.md §2.
CREATE TYPE role_name AS ENUM (
  'INVESTIGATING_OFFICER',
  'SUPERVISING_OFFICER',
  'COMPETENT_AUTHORITY',
  'REVIEW_COMMITTEE',
  'FILTER_TEAM',
  'PROSECUTOR',
  'DEFENSE_COUNSEL',
  'JUDICIAL_AUDITOR',
  'DPO',
  'SYSTEM'
);

-- Audit actions. Extend as new event types are added; do NOT rename existing values.
CREATE TYPE audit_action AS ENUM (
  'LOGIN',
  'LOGOUT',
  'AUTH_ISSUE',
  'AUTH_APPROVE',
  'AUTH_ACTIVATE',
  'AUTH_SUSPEND',
  'AUTH_REVOKE',
  'AUTH_EXPIRE',
  'SESSION_START',
  'SESSION_END',
  'SESSION_AUTO_TERMINATE',
  'EVIDENCE_INGEST',
  'EVIDENCE_READ',
  'EVIDENCE_EXPORT',
  'EVIDENCE_QUARANTINE',
  'EVIDENCE_RELEASE',
  'EVIDENCE_SUPPRESS',
  'QUERY_REWRITE_BLOCKED',
  'FILTER_REVIEW',
  'SUBJECT_OBJECTION_FILED',
  'SUBJECT_OBJECTION_RESOLVED',
  'ROLE_GRANT',
  'ROLE_REVOKE'
);
