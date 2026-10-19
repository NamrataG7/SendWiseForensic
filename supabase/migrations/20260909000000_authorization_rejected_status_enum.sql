-- Enum-add-only migration (must run as its own SQL execution, before any
-- file that references the new label -- Postgres refuses to use a newly
-- added enum value in the same transaction that added it; same
-- same-transaction constraint as every other enum-add migration this
-- session, e.g. 20260905000000, 20260906001000, 20260908000003).
--
-- P1.1 (docs/TODO_GAPS.md): /api/authorizations/[id]/review/route.ts only
-- ever implements unconditional approve -- there is no reject path for
-- the initial PENDING_REVIEW warrant-approval step. A bad/incomplete
-- draft currently can only sit in PENDING_REVIEW forever; a Review
-- Committee member who wants to say "no, this warrant should not be
-- activated" has no way to record that decision.
--
-- REJECTED is intentionally distinct from REVOKED: REVOKED means a
-- warrant WAS active and collection then stopped; REJECTED means a
-- warrant never became active at all because the committee declined it
-- at the PENDING_REVIEW gate. Conflating the two would misrepresent the
-- warrant's actual history on any later audit/court review.

ALTER TYPE authorization_status ADD VALUE IF NOT EXISTS 'REJECTED';

-- Same migration, different enum type -- safe to add both here since
-- neither needs to be USED within this file itself (only the Postgres
-- same-transaction-as-the-ADD-VALUE restriction matters, not "one enum
-- per file").
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'AUTH_REJECT';

