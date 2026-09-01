# Design: Subject Notification Timing

## Problem
Puttaswamy procedural-safeguard prong requires the subject can eventually know and challenge. Same duty exists (differently timed) in US Title III and UK IPA. Currently: counsel portal + objection filing exist, but *when* the subject is told is undefined.

## Design (per jurisdiction)

### IN — 2009 Rules R.13 (records) + Puttaswamy safeguard
- **Notification event:** on warrant expiry OR cessation of monitoring, whichever earlier.
- **Content:** warrant reference, statutory ground(s), collection window, data categories collected (not payloads).
- **Delay:** up to 6 months post-cessation for records retention; notification issued at purge.
- Field: `Authorization.subjectNotifiedAt (timestamptz nullable)`.

### US — 18 U.S.C. §2518(8)(d)
- **Notification event:** within **90 days** of interception termination or of application denial.
- **Content:** fact of application, dates, whether intercepted.
- **Judicial delay:** postponed on court order for good cause.
- Field: `Authorization.subjectInventoryDueBy (timestamptz)` = terminationAt + 90d.

### UK — IPA 2016 §231 (Investigatory Powers Commissioner)
- **Notification event:** on IPC finding of serious error; otherwise **no automatic notification**.
- **Content:** the error and remedy options.
- Field: `Authorization.ipcErrorFindingRef (uuid nullable)` — populated by oversight only.

## Automation
- Cron `notify_subjects_due()` nightly:
  - IN: if `expiresOn + 180d < now()` and `subjectNotifiedAt is null` → enqueue notification job.
  - US: if `terminationAt + 90d < now()` and `subjectNotifiedAt is null` and no active delay order → enqueue.
  - UK: skip (event-driven).

## Delivery
Prototype: writes to `subject_notification` table with `deliveryMethod = MAGIC_LINK_STUB`. Real system: registered post + email + counsel portal. TODO(NOTIFICATION-DELIVERY-CHANNELS).

## Entity
```
subject_notification
├─ id
├─ subject_id
├─ authorization_id
├─ jurisdiction
├─ scheduledAt / deliveredAt
├─ deliveryMethod (MAGIC_LINK_STUB | POST | EMAIL | COURT_SERVICE)
├─ contentTemplateRef
└─ statuteReference
```

## Reuse
- Reuses counsel portal magic-link auth.
- Reuses `p_append_audit`.
- Reuses cron helper pattern from `expire_authorizations()`.

## TODO tags
- `TODO(NOTIFICATION-DELIVERY-CHANNELS)`
- `TODO(US-JUDICIAL-DELAY-ORDER-SUPPORT)` — court-approved postponement UI.
