# Pending Implementation & Enhancements — SendWiseForensic

> Prioritized backlog of what could still be built. Each item graded by impact on paper defensibility × build cost. Reject-list at the bottom lists items we should NOT build.

Rating key:

- **Impact P (paper):** 1–5. How much does this strengthen the paper's novelty or reviewer defensibility?
- **Impact D (deployability):** 1–5. How much does this move the prototype toward pilot readiness?
- **Cost:** hours of focused work.
- **Verdict:** BUILD (do it before submission), OPTIONAL (nice-to-have), DEFER (do after paper), REJECT (do not build).

---

## Tier 1 — Build before paper submission (high P/cost ratio)

### 1. Externally-anchored audit chain

- **What.** Publish the audit-log Merkle root every hour to a public timestamping API (e.g., OpenTimestamps → Bitcoin, or a govt-notified registry when available). Documents `TODO(EXTERNAL-ANCHORING)` in `docs/PROTOTYPE_NOTICE.md`.
- **Why for the paper.** Closes the biggest weakness in the threat model (rogue admin + service_role bypass → silent audit truncation). Reviewers on any forensic-computing paper will ask "how do you prevent audit tampering by a compromised operator?" Right now the answer is "we detect gaps in the hash chain." With external anchoring, the answer becomes "an external timestamping authority holds a hash that must match, so tampering is publicly detectable." This is a real, cited-in-forensic-literature technique.
- **Novelty angle.** Combined with the eight-layer cross-jurisdictional refusal, this becomes the "nine-layer defense-in-depth" catalog. Better story.
- **Impact P:** 5 | **Impact D:** 4 | **Cost:** 4h | **Verdict:** BUILD

### 2. Warrant-extension cap enforcement in adapter + trigger

- **What.** Adapter method `computeCumulativeCapRemaining(parentAuth, priorExtensions)` + Postgres trigger that enforces per-jurisdiction cap. India: sum of durations ≤ 180 days. US: null (no cap; document each renewal). UK: 6 months per grant, no absolute. Design already documented in `docs/design/WARRANT_EXTENSION.md`.
- **Why for the paper.** IT Rules 2009 R.11's 180-day cap is one of the most-cited statutory constraints in Indian surveillance law. If the paper claims the platform enforces the 2009 Rules and this constraint is only documented in a design note, a reviewer will flag it as unimplemented. Adding it makes the claim honest.
- **Impact P:** 4 | **Impact D:** 3 | **Cost:** 3h | **Verdict:** BUILD

### 3. Formal STRIDE/LINDDUN threat-model diagram

- **What.** Convert `docs/paper/THREAT_MODEL.md` into a single-page Mermaid or draw.io diagram: components on the left, adversary classes on top, cells marked with defense mechanism. Ships as `docs/paper/figures/threat-model.svg`.
- **Why for the paper.** Reviewers of security-forensic papers expect a diagram, not just prose. Every 50%-tier paper in *Digital Investigation* has one.
- **Impact P:** 4 | **Impact D:** 1 | **Cost:** 2h | **Verdict:** BUILD

### 4. Related-work librarian consultation

- **What.** Book 1 hour with a Cummins librarian OR Cisco technical librarian to search LexisNexis, Westlaw, HeinOnline, IEEE Xplore full-text, ACM DL full-text, ETSI standards, and Espacenet patents. `docs/paper/ORIGINALITY_SEARCH.md` §Limitations lists the exact terms to run.
- **Why for the paper.** Closes the biggest reviewer-question risk: "did you check paywalled sources?" We need this answer to be "yes, and here are the results."
- **Impact P:** 5 | **Impact D:** 0 | **Cost:** ~1h your time (librarian does the search) | **Verdict:** BUILD

### 5. Semantic Scholar + arXiv originality run

- **What.** Repeat the 5 queries from `ORIGINALITY_SEARCH.md` against Semantic Scholar's API and arXiv (different indexing coverage from Google Scholar). Update `ORIGINALITY_SEARCH.md` with any new hits.
- **Why for the paper.** Belt-and-braces originality check. Cheap and closes a reviewer objection.
- **Impact P:** 3 | **Impact D:** 0 | **Cost:** 1h | **Verdict:** BUILD

### 6. Micro-benchmark actually run + results committed

- **What.** Run `scripts/benchmark-enforcement-layers.ts` against a local Postgres, save output to `docs/paper/results/benchmark.md`.
- **Why for the paper.** The evaluation section needs real numbers, not "expected values."
- **Impact P:** 4 | **Impact D:** 1 | **Cost:** 1h | **Verdict:** BUILD (your action — I cannot run against your local Postgres)

### 7. Expert review protocol executed

- **What.** Send invitations per `docs/paper/EXPERT_REVIEW_PROTOCOL.md`, collect 6 responses.
- **Why for the paper.** Substitutes for a user study. Required for design-paper evaluation section.
- **Impact P:** 5 | **Impact D:** 0 | **Cost:** ~4h your time spread across 4 weeks | **Verdict:** BUILD (your action)

### 8. Scenario walkthrough screenshots captured

- **What.** Take the 23 screenshots per `docs/paper/SCENARIO_WALKTHROUGH.md`, commit under `docs/paper/figures/fig-{1..23}.png`.
- **Why for the paper.** Figures are non-negotiable in a design paper.
- **Impact P:** 4 | **Impact D:** 0 | **Cost:** ~3h your time | **Verdict:** BUILD (your action)

---

## Tier 2 — Optional; strengthen paper but not required

### 9. Full brand rename inside Android app

- **What.** `SafeKeyboardIME` → `SupervisedKeyboardIME`, `Theme.SafeKeyboard` → `Theme.SupervisedKeyboard`, JS asset name, keystore prop names. Currently cosmetic residue from the SendWise fork.
- **Why for the paper.** Zero paper impact. Reviewer might spot it in the screenshots and think we didn't finish. Minor polish.
- **Impact P:** 1 | **Impact D:** 2 | **Cost:** 2h | **Verdict:** OPTIONAL

### 10. `TODO(AUDIT-ATOMICITY)` fix (plpgsql-wrapped route + audit writes)

- **What.** Convert the compensating-rollback pattern in ~10 mutating routes into single plpgsql stored procedures so the mutation and audit write share one Postgres transaction. Existing TODO tags scattered across `/api/*/route.ts`.
- **Why for the paper.** Reviewer might ask "is your audit atomic with the write it audits?" Current answer is "compensating rollback on failure." A stronger answer is "single-transaction plpgsql." But the paper doesn't stand or fall on this.
- **Impact P:** 2 | **Impact D:** 3 | **Cost:** 4h | **Verdict:** OPTIONAL

### 11. Android → console authorization-state channel (FCM push)

- **What.** Replace `StubAuthorizationClient` (which reads state from local encrypted prefs) with a real refresh path: `GET /api/devices/[deviceId]/authorization/state` + FCM push on authorization changes so the Android app immediately reflects Review-Committee approve/revoke.
- **Why for the paper.** Makes the dual-mode design end-to-end real, not just designed. Currently the Android side is disconnected from console-side authorization state.
- **Novelty angle.** Moderate. Not new; but demonstrable.
- **Impact P:** 3 | **Impact D:** 4 | **Cost:** 6h | **Verdict:** OPTIONAL

### 12. Aggregate Review-Committee dashboard (IT Rules 2009 R.22 2-monthly review)

- **What.** From `docs/design/OVERSIGHT_DASHBOARD.md`: `/oversight` route with active-warrants table, expiring-in-14-days queue, pending extension requests, objections filed, plus a "Generate 2-monthly review report" button that renders a PDF.
- **Why for the paper.** R.22 is the biggest India-specific statutory requirement not yet implemented in code (only designed in a markdown). Implementing it closes the "PoSH-analog gap" for oversight.
- **Impact P:** 3 | **Impact D:** 4 | **Cost:** 6h | **Verdict:** OPTIONAL

### 13. Retention & sealing lifecycle cron

- **What.** From `docs/design/RETENTION_SEALING.md`: implement `advance_retention_lifecycle()` cron that flips ACTIVE→EXPIRED→SEALED→PURGED transitions with the per-jurisdiction schedule. Currently only auto-expiry from ACTIVE→EXPIRED is coded.
- **Impact P:** 2 | **Impact D:** 4 | **Cost:** 5h | **Verdict:** OPTIONAL

### 14. Multi-device / co-accused schema (auth_subject + auth_device joins)

- **What.** From `docs/design/MULTI_DEVICE_COACCUSED.md`: add `authorization_subject` and `authorization_device` M-N joins. Update CollectionGate + RLS + admin console accordingly.
- **Impact P:** 2 | **Impact D:** 4 | **Cost:** 6h | **Verdict:** OPTIONAL

### 15. US/UK dummy-verification providers

- **What.** Currently `packages/dummy-verification/` implements only India (Aadhaar / e-Sign / Review-Committee stubs). Add US "Judge e-Sig" and UK "Secretary-of-State + Judicial Commissioner double-lock" analogs.
- **Impact P:** 2 | **Impact D:** 3 | **Cost:** 3h | **Verdict:** OPTIONAL

---

## Tier 3 — Defer (do after paper submission)

### 16. Real UIDAI e-KYC / e-Sign integration

- Requires a UIDAI AUA/KUA licence + govt partnership. Not for prototype. Documented in `docs/PROTOTYPE_NOTICE.md`.
- **Verdict:** DEFER (pilot phase)

### 17. Play Integrity + real hardware Keystore attestation

- Requires Google Play publish + StrongBox hardware. Documented.
- **Verdict:** DEFER (pilot phase)

### 18. Subject-side self-harm / mental-health resource nudges

- Would extend the Filter-Team quarantine pattern for self-harm categories. Ethically fraught in a forensic context; better fit for SendWiseCampus/Workplace forks.
- **Verdict:** DEFER (not in scope for this paper)

### 19. Cross-jurisdictional MLA (Mutual Legal Assistance) authorization type

- New `MLA_REQUEST` authorization type carrying two jurisdictions' citations legitimately (e.g., UK warrant + India cooperation). Currently we hard-refuse cross-jurisdiction contamination.
- **Verdict:** DEFER (would be a second paper on its own)

### 20. Federated / cross-instance deployments

- One SendWiseForensic instance per state police organization, with federated evidence-export protocols. Real deployment concern; academic paper doesn't need it.
- **Verdict:** DEFER

---

## Reject-list — DO NOT BUILD

Explicitly refusing these because they either weaken the paper or drift the design:

### R1. Bulk collection features

- ETSI-style aggregate handover to LEA. Refused by design — SendWiseForensic is explicitly per-warrant, not bulk. Building this destroys our positioning against Pegasus/Chatcontrol.
- **Verdict:** REJECT

### R2. Voice/audio call transcription

- Different acquisition surface (telecom-side, not device-side). Different legal framework. Different technical stack. Belongs in a different paper.
- **Verdict:** REJECT

### R3. Location tracking beyond what MDM provides

- Not part of our claim. Ethics-adjacent scope creep.
- **Verdict:** REJECT

### R4. Real-time anomaly detection / ML-driven officer scoring

- Novel-sounding but reviewer will call it "surveillance-of-surveillance" without empirical grounding. Not defensible without a labelled dataset we do not have.
- **Verdict:** REJECT

### R5. Additional jurisdictions (EU / Canada / Australia adapters)

- Diminishing returns. Three jurisdictions are enough to demonstrate the adapter pattern. More adapters = more test surface = more paper pages without more novelty.
- **Verdict:** REJECT (for the paper; may build after)

### R6. Public-facing deployment of the prototype (real subjects)

- Ethics-board approval + partner LEA + legal indemnities required. Impossible for a student project.
- **Verdict:** REJECT (for the prototype; only for a real pilot)

### R7. Rewrite in Rust / Go / any other stack

- Reviewers care about design and evaluation, not implementation language. Rewrite would kill 60% of the artifact time budget with zero paper impact.
- **Verdict:** REJECT

---

## Recommended sequenced plan (my honest pick)

If you have 20 focused hours over 2-3 weeks before submission:

| Order | Item | Hours | Cumulative |
|---|---|:-:|:-:|
| 1 | Externally-anchored audit chain (#1) | 4 | 4 |
| 2 | Semantic Scholar + arXiv originality run (#5) | 1 | 5 |
| 3 | Librarian consultation (#4) — schedule while you do others | ~1 your time | 6 |
| 4 | Warrant-extension cap enforcement (#2) | 3 | 9 |
| 5 | Threat-model diagram (#3) | 2 | 11 |
| 6 | Micro-benchmark run + commit results (#6) | 1 | 12 |
| 7 | Expert review kickoff (#7) — send 16 invitations, then wait 4 weeks | ~4 your time | 16 |
| 8 | Scenario walkthrough screenshots (#8) | 3 | 19 |

Everything else in Tier 2 becomes revision material if a reviewer asks for it. Do NOT try to build all of Tier 2 pre-submission.

## Non-recommended sequenced plan (what I would push back against)

If you were tempted to build all of Tier 2 first: don't. The paper's novelty is already sufficient with what's built; Tier 2 items are for the pilot, not the paper. Cost-benefit says Tier 1 is enough.

---

## Summary

- **Build (Tier 1):** 8 items. Cost roughly 15 hours of my/your combined work over 2-3 weeks. Materially strengthens the paper.
- **Optional (Tier 2):** 7 items. Nice-to-have. Do if a reviewer asks. Deferable to revision round.
- **Defer (Tier 3):** 5 items. Pilot-stage work.
- **Reject:** 7 items. Explicit refusal to prevent scope drift.

Your call on which Tier 1 items you want me to actually build (as opposed to items 4, 6, 7, 8 which are yours). Say **build #1 #2 #3** or any subset and I'll do them in this session.
