-- SendWiseForensic seed (prototype)
-- Seeds base RBAC roles ONLY. No dummy officers.
-- Admins are provisioned by docs/ADMIN_BOOTSTRAP.md. Officers are invited via
-- the admin console (which now enforces dual-control + jurisdiction scoping).

INSERT INTO role (name, description)
VALUES
  ('INVESTIGATING_OFFICER',  'Case officer; files requests, reviews in-scope evidence.'),
  ('SUPERVISING_OFFICER',    'Signs off on requests before they leave the police organization.'),
  ('COMPETENT_AUTHORITY',    'Union/State Home Secretary or delegate; issues §69 warrants (IN).'),
  ('REVIEW_COMMITTEE',       '2009-Rules review committee; approves/revokes every 2 months.'),
  ('FILTER_TEAM',            'Independent reviewers of privilege-flagged content.'),
  ('PROSECUTOR',             'Read-only, case-scoped; sees exports directed to prosecution.'),
  ('DEFENSE_COUNSEL',        'Subject-side; reads warrant scope, files objections.'),
  ('JUDICIAL_AUDITOR',       'Cross-case oversight (judge / notified authority); read-only.'),
  ('DPO',                    'Data Protection Officer (DPDPA); grievances, compliance.'),
  ('ADMIN',                  'Manages officer accounts. Cannot access cases or evidence.')
ON CONFLICT (name) DO NOTHING;
