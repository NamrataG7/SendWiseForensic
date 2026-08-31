-- supabase/seed.sql
-- PROTOTYPE — dummy identities. Do NOT deploy to any environment that touches real data.
-- Ensures a minimal, demo-ready officer roster with one officer per role.

-- Roles are already seeded by the officers_and_roles migration. This block is a no-op safety net.
INSERT INTO role (name, description)
  SELECT v.name::role_name, v.description
    FROM (VALUES
      ('INVESTIGATING_OFFICER',  'Case officer; files requests, reviews in-scope evidence.'),
      ('SUPERVISING_OFFICER',    'Signs off on requests before they leave the police organization; approves exports.'),
      ('COMPETENT_AUTHORITY',    'IT_ACT_S69: Union/State Home Secretary or delegate; issues §69 authorizations.'),
      ('REVIEW_COMMITTEE',       'IT_RULES_2009_R22: reviews authorizations every 2 months; approves/revokes.'),
      ('FILTER_TEAM',            'Independent reviewers of privilege-flagged content. TODO(FILTER-TEAM-INDEPENDENCE).'),
      ('PROSECUTOR',             'Read-only, case-scoped; sees exports directed to prosecution.'),
      ('DEFENSE_COUNSEL',        'Subject-side; sees warrant scope and metadata; files objections.'),
      ('JUDICIAL_AUDITOR',       'Cross-case oversight (judge / notified authority); read-only.'),
      ('DPO',                    'DPDPA Data Protection Officer; grievances, compliance.'),
      ('SYSTEM',                 'Automated jobs (expiry, quarantine routing, chain anchoring).')
    ) AS v(name, description)
  ON CONFLICT (name) DO NOTHING;

-- One demo officer per role.
-- PROTOTYPE — dummy identities. Every officer below is fictional.
WITH demo_officers(full_name, service_id, email, organization, role_slug) AS (
  VALUES
    ('Demo Investigating Officer',  'DEMO-IO-001',   'io.demo@example.invalid',       'Cyber Cell, Demo Police',                'INVESTIGATING_OFFICER'),
    ('Demo Supervising Officer',    'DEMO-SO-001',   'so.demo@example.invalid',       'Cyber Cell, Demo Police',                'SUPERVISING_OFFICER'),
    ('Demo Competent Authority',    'DEMO-CA-001',   'ca.demo@example.invalid',       'Home Department, Demo State',            'COMPETENT_AUTHORITY'),
    ('Demo Review Committee Member','DEMO-RC-001',   'rc.demo@example.invalid',       'Review Committee, Demo Jurisdiction',    'REVIEW_COMMITTEE'),
    ('Demo Filter Team Reviewer',   'DEMO-FT-001',   'ft.demo@example.invalid',       'Independent Filter Team, Demo',          'FILTER_TEAM'),
    ('Demo Prosecutor',             'DEMO-PR-001',   'pr.demo@example.invalid',       'Directorate of Prosecution, Demo',       'PROSECUTOR'),
    ('Demo Defense Counsel',        'DEMO-DC-001',   'dc.demo@example.invalid',       'Bar Council of Demo (dummy)',            'DEFENSE_COUNSEL'),
    ('Demo Judicial Auditor',       'DEMO-JA-001',   'ja.demo@example.invalid',       'Notified Judicial Auditor, Demo',        'JUDICIAL_AUDITOR'),
    ('Demo DPO',                    'DEMO-DPO-001',  'dpo.demo@example.invalid',      'Data Protection Office, Demo',           'DPO'),
    ('SYSTEM',                      'SYSTEM',        'system@example.invalid',        'Automated jobs',                         'SYSTEM')
),
inserted_officers AS (
  INSERT INTO officer (full_name, service_id, email, organization, identity_verified, jurisdiction)
    SELECT d.full_name, d.service_id, d.email, d.organization, false, 'IN'
      FROM demo_officers d
    ON CONFLICT (service_id) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id, service_id
)
INSERT INTO officer_role (officer_id, role_id)
SELECT o.id, r.id
  FROM demo_officers d
  JOIN inserted_officers o ON o.service_id = d.service_id
  JOIN role r              ON r.name        = d.role_slug::role_name
ON CONFLICT DO NOTHING;

-- Marker row in audit_log so downstream consumers can see the chain is alive.
SELECT p_append_audit(
  NULL,
  'SYSTEM',
  'LOGIN',
  'seed',
  NULL,
  '{"note":"PROTOTYPE — dummy identities seeded"}'::jsonb
);
