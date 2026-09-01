# Design: Review Committee Aggregate Dashboard

## Problem
IN 2009 Rules R.22 requires the Review Committee to review all interceptions every 2 months. UK IPA §229 Investigatory Powers Commissioner audits handling. US has DOJ IG oversight. Current UI shows one warrant at a time.

## Design

### New route: `/oversight`
Role-gated: `REVIEW_COMMITTEE` (IN), `JUDICIAL_AUDITOR` (US oversight), `IPC_AUDITOR` (UK). Add `IPC_AUDITOR` to `RoleName` enum.

### Views
1. **Active warrants** — table: subject (pseudonymous), case ref, jurisdiction pill, aim, expires-in, scope categories, extension count. Sortable, filterable by jurisdiction/aim/near-expiry.
2. **Expiring in next 14 days** — same table filtered; each row has "Approve extension" (opens extension request created by officer) or "Let expire" action.
3. **Pending extension requests** — from `AuthorizationExtension` where `decisionStatus=PENDING`. Row: parent warrant summary + requested duration + proportionality-refresh JSON view + Approve/Deny buttons.
4. **Recently expired / revoked** — last 60 days, with cooldown/seal/purge status pill.
5. **Objections filed** — from `subject_objection` where `status=OPEN`.
6. **Anomaly panel** — hooks into item 6/design (future) placeholder card "Real-time anomaly detection — TODO(OVERSIGHT-ANOMALY-FEED)".

### Periodic-review artefact
Button "Generate 2-monthly review report" → renders a PDF via `@sendwise-forensic/evidence-certificate` new function `toReviewReportPdf(period)`. Cites R.22 (IN) / §229 (UK) / statute per jurisdiction. Signed by Review Committee (dummy in prototype).

### Data source
- Reuses `authorization`, `authorization_extension`, `subject_objection`, `audit_log`.
- One new view: `oversight_warrant_summary` (materialised, refreshed hourly).

### RLS
`REVIEW_COMMITTEE` sees metadata across all cases in own jurisdiction. Reads to raw evidence still blocked; oversight ≠ case investigation.

## Reuse
- Reuses existing case/audit tables + entities.ts types.
- Reuses pdf-lib via evidence-certificate package.
- Reuses jurisdiction-theme + Filter Team page layout patterns.

## TODO tags
- `TODO(OVERSIGHT-ANOMALY-FEED)`
- `TODO(REVIEW-REPORT-PDF-TEMPLATE)`
- `TODO(OVERSIGHT-MATERIALIZED-VIEW-REFRESH)`

## Statute anchors
| Jurisdiction | Section | Cadence |
|---|---|---|
| IN | IT Rules 2009 R.22 | 2-monthly |
| US | DOJ OIG oversight (Title III §2519 annual reports) | annual + on-demand |
| UK | IPA 2016 §§229–234 | continuous IPC + annual report |
