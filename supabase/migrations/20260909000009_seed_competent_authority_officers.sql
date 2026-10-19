-- Fix: India Competent Authority allowlist used non-UUID string stubs
-- ("IN-UNION-HS-STUB", "IN-STATE-HS-MH-STUB", ...) as officerId, but
-- authorization.issuing_authority_id is `uuid NOT NULL REFERENCES
-- officer(id)` (20260831110903). No value could satisfy both the
-- app-layer Competent Authority allowlist check (lib/authz.ts /
-- india/index.ts) and the DB FK simultaneously -- meaning no
-- JUDICIAL_WARRANT could ever be created for India jurisdiction.
--
-- Fix: seed real officer rows (role COMPETENT_AUTHORITY) with FIXED,
-- well-known UUIDs so the TS-side IN_COMPETENT_AUTHORITIES constant
-- (packages/legal-framework/src/india/index.ts, updated alongside this
-- migration) can reference the same UUIDs literally. These are
-- prototype/stub identities (see PROTOTYPE_NOTICE.md) -- not real Home
-- Secretaries -- but now backed by real officer.id rows satisfying the
-- FK.

BEGIN;

INSERT INTO officer (id, full_name, jurisdiction, organization, identity_verified, active)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'STUB — Union Home Secretary',       'IN', 'Union Ministry of Home Affairs',        true, true),
  ('a0000000-0000-4000-8000-000000000002', 'STUB — Maharashtra Home Secretary', 'IN', 'Government of Maharashtra, Home Dept.', true, true),
  ('a0000000-0000-4000-8000-000000000003', 'STUB — Karnataka Home Secretary',   'IN', 'Government of Karnataka, Home Dept.',   true, true),
  ('a0000000-0000-4000-8000-000000000004', 'STUB — Delhi Home Secretary',       'IN', 'GNCT of Delhi, Home Dept.',             true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO officer_role (officer_id, role_id)
SELECT o.id, r.id
FROM officer o, role r
WHERE o.id IN (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000004'
)
AND r.name = 'COMPETENT_AUTHORITY'
ON CONFLICT DO NOTHING;

COMMIT;
