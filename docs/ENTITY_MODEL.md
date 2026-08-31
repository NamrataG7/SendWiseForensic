# Entity Model & Role Matrix

Draft ER model, role matrix, and enforcement rules for SendWiseForensic MVP (India, JUDICIAL_WARRANT pathway).

## 1. Core entities

```
Jurisdiction (enum: IN | US | UK)

LegalFrameworkAdapter (interface — one impl per jurisdiction)
  ├─ validateAuthorization(auth)
  ├─ computeMaxDuration(auth)
  ├─ getCompetentAuthorities()
  ├─ generateEvidenceCertificate(evidence, exportEvent)
  ├─ getPrivilegeCategories()
  └─ getPurgeSchedule(auth)

Case
  ├─ id
  ├─ jurisdiction (FK Jurisdiction)
  ├─ externalCaseRef (e.g., FIR number)
  ├─ offences[] (BNS section codes)
  ├─ status (OPEN | UNDER_REVIEW | CLOSED | SEALED)
  ├─ createdBy (Officer FK)
  ├─ assignedOfficers[] (Officer FK[])
  └─ createdAt / closedAt

Authorization  (polymorphic on type)
  ├─ id
  ├─ caseId (FK Case)
  ├─ subjectId (FK Subject)
  ├─ type (JUDICIAL_WARRANT | BAIL_CONDITION | PROBATION_ORDER |
            PLEA_AGREEMENT | CORPORATE_INSIDER | VOLUNTARY_VICTIM)
  ├─ legitimateAim (enum, statute-specific)
  ├─ issuingAuthorityId (FK Officer with COMPETENT_AUTHORITY role)
  ├─ issuedOn / expiresOn
  ├─ scope (JSONB):
  │   ├─ dataCategories[]    (KEYSTROKE, APP_EVENT, COMMS_METADATA, ...)
  │   ├─ devices[]           (deviceIds authorized)
  │   ├─ timeWindows[]       (optional: hours of day allowed)
  │   ├─ keywords[]          (optional: only capture around these)
  │   └─ contextApps[]       (optional: only in these apps)
  ├─ proportionalityChecklist (JSONB — 4 Puttaswamy prongs w/ justifications)
  ├─ reviewCommitteeApproval (JSONB — approvers, timestamps, notes)
  ├─ statuteReferences[] (e.g., ["IT_ACT_S69", "IT_RULES_2009_R3"])
  ├─ signedOrderDocumentHash (SHA-256 of uploaded PDF)
  ├─ signedOrderDocumentRef (storage ref, encrypted at rest)
  ├─ dpdpaExemptionRef (nullable; required if invoking DPDPA §17)
  ├─ status (DRAFT | PENDING_REVIEW | ACTIVE | SUSPENDED | EXPIRED | REVOKED)
  ├─ revocationLog[] (JSONB — actor, reason, timestamp)
  └─ createdAt / updatedAt

Subject
  ├─ id
  ├─ pseudonymousLabel (system-generated; used in most UI)
  ├─ identityRefs (JSONB):
  │     - aadhaarHash (SHA-256; raw never stored)
  │     - panHash (nullable, SHA-256)
  │     - verifiedByStub (bool; TRUE in prototype means dummy-verified)
  ├─ devices[] (Device FK[])
  ├─ authorizations[] (Authorization FK[])
  └─ createdAt

Device
  ├─ id
  ├─ subjectId (FK Subject)
  ├─ platform (ANDROID)
  ├─ deviceFingerprint (attestation payload; TODO Play Integrity)
  ├─ hardwareBackedPubKey (nullable; TODO(HARDWARE-KEYSTORE))
  ├─ enrolledAt / lastSeenAt
  └─ status (ENROLLED | UNINSTALLED | TAMPERED)

MonitoringSession
  ├─ id
  ├─ authorizationId (FK Authorization; REQUIRED)
  ├─ deviceId (FK Device)
  ├─ startedAt / endsAt   (endsAt ≤ authorization.expiresOn — DB CHECK)
  ├─ collectedCategories[] (subset of authorization.scope.dataCategories)
  ├─ autoTerminationTriggers (JSONB: on-expiry, on-revocation, on-tamper)
  └─ status (ACTIVE | PAUSED | ENDED | AUTO_TERMINATED)

Evidence
  ├─ id
  ├─ sessionId (FK MonitoringSession)
  ├─ category (KEYSTROKE_BATCH | APP_EVENT | COMMS_METADATA | RISK_DETECTION)
  ├─ capturedAt
  ├─ payloadHash (SHA-256 of raw payload)
  ├─ payloadRef (encrypted cold-storage ref; dual-key sealed)
  ├─ deviceSignature (bytes; TODO hardware-backed)
  ├─ prevEvidenceHash (chain link within session)
  ├─ privilegeFlag (NONE | LEGAL | MEDICAL | CLERGY | SPOUSAL | UNKNOWN)
  ├─ quarantineStatus (nullable; PENDING_FILTER | RELEASED | SUPPRESSED)
  ├─ redactionsApplied[] (JSONB — banking, health PII scrubbers)
  └─ createdAt

EvidenceExport
  ├─ id
  ├─ caseId
  ├─ evidenceIds[]
  ├─ requestedBy (Officer FK)
  ├─ approvedBy[] (Officer FK[]; dual-officer approval required)
  ├─ purpose (COURT_SUBMISSION | INTERNAL_REVIEW | DEFENSE_DISCLOSURE)
  ├─ bsaSection63CertificateRef (auto-generated document)
  ├─ exportedAt
  └─ recipientNotice (who receives the export outside the system)

PrivilegeContactRegistry
  ├─ id
  ├─ contactIdentifier (phone / email / handle; hashed)
  ├─ category (LEGAL | MEDICAL | CLERGY | SPOUSAL)
  ├─ source (BAR_COUNCIL_INDIA | MEDICAL_COUNCIL | SUBJECT_DECLARED | ...)
  └─ verifiedAt

FilterTeamReview
  ├─ id
  ├─ evidenceId (FK Evidence)
  ├─ reviewerId (Officer with FILTER_TEAM role)
  ├─ decision (RELEASE | SUPPRESS | REDACT_AND_RELEASE)
  ├─ reason
  └─ reviewedAt

SubjectObjection  (filed via defense counsel portal)
  ├─ id
  ├─ authorizationId
  ├─ filedByCounselId
  ├─ grounds
  ├─ status (OPEN | UNDER_REVIEW | UPHELD | DISMISSED)
  ├─ reviewedByReviewCommitteeAt
  └─ resolution

AuditLog  (append-only, hash-chained)
  ├─ id (monotonic)
  ├─ prevAuditHash
  ├─ actorId (Officer or SYSTEM)
  ├─ actorRole
  ├─ action (LOGIN | AUTH_ISSUE | AUTH_REVOKE | EVIDENCE_READ |
             EVIDENCE_EXPORT | QUERY_REWRITE_BLOCKED | ...)
  ├─ targetType / targetId
  ├─ context (JSONB)
  ├─ ip / deviceInfo
  ├─ timestamp
  └─ hash (SHA-256 over prev + payload)
```

## 2. Roles

| Role | Description | Can request auth? | Can issue auth? | Can view in-scope evidence? | Can view privileged queue? | Can export? |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `INVESTIGATING_OFFICER` | Case officer, files requests, reviews collected evidence in scope | ✓ | | ✓ (case-scoped) | | Requests only |
| `SUPERVISING_OFFICER` | Signs off on requests before they leave the police organization | | | ✓ (case-scoped) | | Approves export requests |
| `COMPETENT_AUTHORITY` | Union/State Home Secretary or delegate; issues §69 authorizations | | ✓ | | | |
| `REVIEW_COMMITTEE` | 2009-Rules review; approves/revokes; every 2 months | | ✓ (approval) | ✓ (metadata only) | | |
| `FILTER_TEAM` | Independent reviewers of privilege-flagged content | | | | ✓ | |
| `PROSECUTOR` | Read-only, case-scoped; sees exports directed to prosecution | | | ✓ (case-scoped, released only) | | |
| `DEFENSE_COUNSEL` | Subject-side; sees warrant scope, categories collected (metadata), files objections | | | | | |
| `JUDICIAL_AUDITOR` | Cross-case oversight (judge / notified authority); read-only | | | ✓ (audit-log level) | ✓ (metadata) | |
| `DPO` | Data Protection Officer (DPDPA); grievances, compliance | | | ✓ (metadata) | | |
| `SYSTEM` | Automated jobs (expiry, quarantine routing, chain anchoring) | | | | | |

## 3. Hard invariants (enforced at DB and API layers)

1. `Evidence.session_id → MonitoringSession.authorization_id → Authorization.status = 'ACTIVE'` at the time of insert. Reject otherwise.
2. `MonitoringSession.ends_at ≤ Authorization.expires_at` (CHECK).
3. `MonitoringSession.collected_categories ⊆ Authorization.scope.data_categories` (CHECK via trigger).
4. Every `SELECT` on `Evidence` for a non-SYSTEM actor is rewritten to include:
   ```
   WHERE evidence.session_id IN (
     SELECT id FROM monitoring_session
     WHERE authorization_id IN (
       SELECT id FROM authorization
       WHERE case_id IN (:caller_assigned_cases)
         AND status = 'ACTIVE'
     )
   )
   AND evidence.quarantine_status IS DISTINCT FROM 'PENDING_FILTER'
   AND evidence.quarantine_status IS DISTINCT FROM 'SUPPRESSED'
   ```
   Filter Team role gets the inverse (only PENDING_FILTER).
5. `EvidenceExport` requires `len(approved_by) ≥ 2` and at least one `SUPERVISING_OFFICER`.
6. `Authorization` cannot transition to `ACTIVE` without: signed order doc hash present, proportionality checklist all four prongs justified, Review Committee approval object present (JUDICIAL_WARRANT only), Competent Authority ID matching a valid `getCompetentAuthorities()` result.
7. `AuditLog` is append-only; `UPDATE` and `DELETE` are revoked at the role level and enforced by trigger.
8. Every API mutation writes at least one `AuditLog` entry in the same transaction.

## 4. Auto-expiry & sealing

- Cron every minute:
  - Any `Authorization` with `expires_at < now()` and `status = 'ACTIVE'` → `EXPIRED`, all its sessions → `AUTO_TERMINATED`.
  - Any device with an expired authorization receives a signed "stop-collection" message via FCM within the next heartbeat.
- Cron nightly:
  - Any `Authorization` where `EXPIRED`/`REVOKED` for ≥ 6 months → evidence moved to sealed cold storage per 2009 Rules R.23; requires judicial unseal event to access.

## 5. Attack model (what the architecture must resist)

| Threat | Mitigation |
|---|---|
| Rogue investigator queries evidence outside case scope | Scope-rewriting query layer; DB-level policy |
| Rogue supervisor exports without justification | Dual-officer approval; audit log; DPO alerts on volume anomalies |
| Insider tampering with evidence | Hash chain per session + audit chain; periodic external anchoring (post-MVP) |
| Insider deleting audit rows | Append-only role privileges; hash chain detects gaps |
| Subject uninstalls the app | Tamper event → bail-violation alert to court; no further collection until reinstall |
| Warrant scope drift | DB CHECK on collected_categories ⊆ scope; API rejects out-of-scope batches |
| Privileged content leak | Auto-quarantine → Filter Team; investigators cannot see PENDING_FILTER |
| Warrant issued by non-Competent Authority | `getCompetentAuthorities()` allowlist per jurisdiction |
| Time-limit evasion (rolling short warrants) | Sum of durations per subject enforced against 2009 Rules max (180d for §69) |

## 6. MVP delivery order

1. Schema migrations for the entity model above (Postgres via Supabase).
2. `LegalFrameworkAdapter` for India + statute reference tables.
3. Warrant issuance flow (dummy Aadhaar + e-Sign, visible prototype banner).
4. Device enrollment + session start with scope check.
5. Ingest endpoint with warrant-gated writes and scope enforcement.
6. Audit log + hash chain.
7. Privilege quarantine routing + Filter Team console.
8. BSA §63 certificate generator.
9. Subject / counsel portal (magic-link).
10. Auto-expiry cron.
11. Android app fork: rename to `SupervisedKeyboardApp`, replace on-device-only detection with dual-mode (privacy-preserving by default; content-collecting only under active authorization).
