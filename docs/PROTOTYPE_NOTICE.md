# PROTOTYPE NOTICE

**This is an academic prototype of SendWiseForensic. It is not fit for use against real subjects, real cases, or real evidence collection.**

## Prototype shortcuts

The following components are intentionally stubbed for the prototype and MUST be replaced before any pilot deployment:

### 1. Aadhaar / identity verification — **DUMMY**

- Real system will use **UIDAI Aadhaar e-KYC** for subject identity, and **UIDAI e-Sign / DigiLocker** for judicial digital signature on warrant orders.
- Prototype accepts an uploaded PDF and a text field for "Aadhaar (masked)" and stores a SHA-256 hash. No real UIDAI API is called.
- Every screen that displays "verified" identity in the prototype shows a red banner: **"DUMMY VERIFICATION — PROTOTYPE ONLY."**
- Replacement task tracked as `TODO(UIDAI-INTEGRATION)` in code.

### 2. Judicial signature on warrants — **DUMMY**

- Real system will require a UIDAI e-Sign digital signature from a Competent Authority (Home Secretary at Union or State level per IT Act §69 + 2009 Rules) or from a Magistrate (BNSS bail/probation pathways).
- Prototype accepts an uploaded signed-PDF and stores its SHA-256 hash + issuer name from a form field.
- No cryptographic verification of the signing certificate is performed.
- Replacement task tracked as `TODO(ESIGN-VERIFICATION)`.

### 3. Review Committee (§69 2009 Rules) — **SINGLE-USER STUB**

- Real §69 authorizations must be reviewed by a Review Committee (Cabinet Secretary + Secretary Legal Affairs + Secretary Telecommunications at Union; equivalent at State).
- Prototype allows a single user with `REVIEW_COMMITTEE` role to approve, with a note that in production this must be a quorum record.
- Replacement task tracked as `TODO(REVIEW-COMMITTEE-QUORUM)`.

### 4. Device attestation — **DEFERRED**

- Real system will use Google Play Integrity API on Android to refuse installation on rooted/tampered devices (evidence-integrity requirement).
- Prototype logs a warning if attestation fails but does not block.
- Replacement task tracked as `TODO(PLAY-INTEGRITY)`.

### 5. Hardware-backed evidence signing — **SOFTWARE KEY**

- Real system will sign each keystroke/event batch with an Android Keystore hardware-backed key so evidence carries a per-device provenance chain admissible under Bharatiya Sakshya Adhiniyam §63.
- Prototype uses a software-only key stored in app SharedPreferences.
- Replacement task tracked as `TODO(HARDWARE-KEYSTORE)`.

### 6. Independent Filter Team — **SIMULATED**

- Real system requires an organizationally independent team (typically judicial officers, not police) to review privilege-flagged material before investigators can see any of it.
- Prototype uses a distinct role and separate login but no organizational separation is enforced.
- Replacement task tracked as `TODO(FILTER-TEAM-INDEPENDENCE)`.

### 7. Public timestamping / anchoring of audit chain — **INTERNAL ONLY**

- Real system will anchor the Merkle root of the audit log periodically to an external timestamping authority or a govt-notified registry so tampering by a rogue insider is detectable.
- Prototype maintains the hash chain internally only.
- Replacement task tracked as `TODO(EXTERNAL-ANCHORING)`.

### 8. Subject / defense counsel portal — **BASIC**

- Real system will support secure lawyer login (Bar Council ID + e-Sign), scoped read of warrant metadata, and machine-readable objection filing to the Review Committee.
- Prototype exposes a scoped read-only page behind a shared magic-link token.
- Replacement task tracked as `TODO(COUNSEL-PORTAL)`.

## What is **not** stubbed

- Warrant-gated writes (enforced at DB + API layer).
- Scope-based query rewriting.
- Auto-expiry cron.
- Hash-chained audit log (internal).
- Privilege quarantine routing (rule + contact-list based).
- BSA §63 certificate generation.
- Role separation and RBAC.

These form the architectural core; the stubs above are the pieces that require external integrations, government partnerships, or hardware.
