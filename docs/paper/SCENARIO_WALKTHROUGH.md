# Scenario Walkthrough — SendWiseForensic

> One end-to-end warrant lifecycle, step-by-step, with what-to-screenshot markers. Follow this exactly to produce Figures 1-8 of the paper. Every step is a real click on the live prototype at https://sendwiseforensic.vercel.app.
>
> This document is a *script*, not narrative. Do each step in order. When you see **[Screenshot N]** take one PNG at 1920×1080 and save as `docs/paper/figures/fig-N.png`.

---

## Fixtures needed before running

You need in the DB:
- One Admin (bootstrap via `docs/ADMIN_BOOTSTRAP.md`) with `home_jurisdiction='IN'`.
- One INVESTIGATING_OFFICER (invited by admin, jurisdiction IN).
- One SUPERVISING_OFFICER (invited by admin, jurisdiction IN).
- One COMPETENT_AUTHORITY (invited by admin, jurisdiction IN, in this case a "Union Home Secretary" stub).
- One REVIEW_COMMITTEE member (invited by admin, jurisdiction IN).
- One DEFENSE_COUNSEL registered via `/counsel` request-access flow.

Recruit help — use 3 email accounts you control. Do NOT invite real strangers.

---

## Act I — Case creation and warrant issuance

### Step 1. Officer signs in

- URL: `https://sendwiseforensic.vercel.app/login`
- Sign in as INVESTIGATING_OFFICER (`ip.officer@yourdomain.com`).
- **[Screenshot 1]** — the login page just before submitting credentials.

### Step 2. Officer completes onboarding

- Redirect: `/onboarding/jurisdiction` → pick **IN**.
- Land at `/cases`.
- **[Screenshot 2]** — the empty case dashboard with jurisdiction status bar reading "IN THE MATTER OF" in slate-navy header.

### Step 3. Officer creates a case

- Click `/cases/new`.
- Fill:
  - Jurisdiction: **IN** (radio, with the IMMUTABLE orange callout visible)
  - Case ref (FIR): `FIR-DL-2024-1234`
  - Offences: `BNS §351 (Criminal intimidation), BNS §75 (insulting modesty via electronic communication)`
- Submit.
- **[Screenshot 3]** — the case creation form with the "IMMUTABLE" callout and locked-jurisdiction radio.

### Step 4. Officer adds a subject to the case

- On the case detail page, click **Add Subject**.
- Fill:
  - Pseudonymous label: `Subject-A`
  - Aadhaar (dummy): `1234-5678-9012` (banner: "DUMMY VERIFICATION — PROTOTYPE ONLY")
  - Name: `John Doe` (for demo)
- Submit.
- **[Screenshot 4]** — subject creation with the DUMMY VERIFICATION banner.

### Step 5. Officer opens the warrant issuance wizard

- Click **Issue Authorization** on the case detail page.
- Land at `/authorizations/new` — the 7-step wizard.
- Step 1 of the wizard shows the case name + a locked "JURISDICTION: IN" pill. Caption reads "Jurisdiction is fixed by the case."
- **[Screenshot 5]** — Wizard Step 1 with the locked jurisdiction pill.

### Step 6. Officer fills Legitimate Aim (Wizard step 2)

- Dropdown branches to **LegitimateAimIN** with §69 grounds:
  - Sovereignty and integrity of India
  - Defence of India
  - Security of the State
  - Friendly relations with foreign States
  - **Public order** ← officer selects this
  - Preventing incitement to a cognizable offence
- Inline caption: "IT Rules 2009 R.3 — legitimate aim must be one of §69 grounds."
- **[Screenshot 6]** — the Legitimate Aim dropdown showing IN-only grounds with the statute cite.

### Step 7. Officer fills Scope (Wizard step 3)

- Data categories: `KEYSTROKE_BATCH`, `APP_EVENT`, `COMMS_METADATA`
- Devices: Subject-A's registered device
- Time windows: 24/7
- Keywords (narrowing scope): `funds`, `transfer`, `foreign`
- Context apps: `com.whatsapp`, `org.telegram.messenger`
- **[Screenshot 7]** — scope form filled in.

### Step 8. Officer fills Puttaswamy proportionality (Wizard step 4)

- Four textareas labeled with the Puttaswamy prongs:
  - **Legality**: "Interception is under IT Act §69 read with 2009 Rules R.3(1)."
  - **Legitimate aim**: "Preventing incitement to a cognizable offence — narcotics conspiracy."
  - **Proportionality**: "Least intrusive means: keyword-filtered keystrokes, not full-content upload; 60-day cap; contact filter for privileged calls."
  - **Procedural safeguards**: "Review Committee under R.22; subject counsel notified via counsel portal; audit chain enabled."
- **[Screenshot 8]** — Wizard step 4 with all four prongs filled and the "Puttaswamy 2017" statute cite visible.

### Step 9. Officer uploads Competent Authority signed order (Wizard step 5)

- Single upload field: "Union/State Home Secretary signed order (PDF)"
- Upload a mock PDF (any PDF for the demo).
- The DUMMY UIDAI e-Sign — PROTOTYPE stamp appears next to the upload.
- **[Screenshot 9]** — the upload with the visible dummy stamp.

### Step 10. Review Committee approval (Wizard step 6)

- Prototype shows the Review Committee form with a single-user stub, tagged `TODO(REVIEW-COMMITTEE-QUORUM)`.
- Fill dummy quorum: Cabinet Secretary + Secretary Legal + Secretary Telecom (all stubs).
- **[Screenshot 10]** — the review committee stub form.

### Step 11. Officer confirms and submits (Wizard step 7)

- Confirmation page shows all statute references being cited, all prefixed `IN_*`.
- If any prefix mismatches were mistakenly entered, a red "REJECTED — cross-jurisdiction contamination" panel would appear (do not need to demonstrate; comparison shown in Figure X of the paper via error injection).
- Submit.
- Redirect to `/authorizations/[id]` — the warrant is now `PENDING_REVIEW` status.
- **[Screenshot 11]** — the created warrant summary page with all fields and the pending status.

---

## Act II — Review Committee review and approval

### Step 12. Review Committee member signs in

- Log out. Sign back in as the REVIEW_COMMITTEE user.
- Land at `/cases` — sees only cases in their jurisdiction.

### Step 13. Review Committee opens the pending warrant

- Navigate to the warrant issued in Step 11.
- The review controls are visible — "Approve" / "Reject with reason".
- **[Screenshot 12]** — the warrant view from the Review Committee perspective, controls visible.

### Step 14. Review Committee approves

- Click **Approve**. Warrant status flips to `ACTIVE` and `review_status` = `APPROVED`.
- The `review_approved_by` and `review_approved_at` fields populate.
- **[Screenshot 13]** — the warrant post-approval showing ACTIVE + APPROVED review status.

---

## Act III — Evidence flow and audit chain

### Step 15. Show the Android agent uploading evidence

- (This step requires either a physical device running SupervisedKeyboardApp OR a simulated `POST /api/evidence/ingest` from `curl`).
- Simulated `curl`:

```bash
curl -X POST https://sendwiseforensic.vercel.app/api/evidence/ingest \
  -H 'content-type: application/json' \
  -d '{
    "batches": [{
      "batchId": "8a1e...",
      "sessionId": "session-abc",
      "capturedAt": "2024-11-15T09:00:00Z",
      "category": "KEYSTROKE_BATCH",
      "payloadBase64": "aGVsbG8gd29ybGQ=",
      "prevBatchHashHex": "0000...0000",
      "batchHashHex": "abc123...def",
      "privilegeFlag": "NONE",
      "contextAppPackage": "com.whatsapp",
      "signatureBase64": "sig..."
    }],
    "device": {
      "deviceId": "device-xxx",
      "publicKeyBase64": "pk...",
      "attestation": {"ok": false, "kind": "PLAY_INTEGRITY_STUB", "verdict": "..."}
    },
    "clientVersion": "0.1.0"
  }'
```

- Returns `{"ok": true, "accepted": 1}` on 202.
- **[Screenshot 14]** — the terminal showing the curl request + 202 response.

### Step 16. Officer views the evidence log

- Log back in as INVESTIGATING_OFFICER.
- Navigate to `/cases/[caseId]/evidence`.
- The recorded evidence row appears with hash prefix, category, capturedAt.
- **[Screenshot 15]** — the evidence log.

### Step 17. Officer views the audit chain

- Navigate to `/audit`.
- The hash-chained audit entries for warrant issuance, review approval, and evidence ingestion appear in order.
- **[Screenshot 16]** — the audit chain view with chain-link visualization.

---

## Act IV — Counsel portal

### Step 18. Defense counsel requests access

- Log out. Navigate to `/counsel`.
- Fill:
  - Full name: `Advocate Priya Verma`
  - Bar Council ID: `MH/123/2020`
  - Email: your third test account
  - Case ref: `FIR-DL-2024-1234`
  - Jurisdiction: IN
  - Reason: "Represent Subject-A; wish to review warrant scope and file objection."
- Submit.
- Success message appears.
- **[Screenshot 17]** — the request submitted state.

### Step 19. Admin reviews counsel request

- Log in as ADMIN. Navigate to `/admin/counsel`.
- Pending request from Advocate Verma appears.
- Click **Approve**.
- The system fires a magic-link email; the counsel_access_request row transitions PENDING → APPROVED → GRANTED.
- **[Screenshot 18]** — the admin counsel-request queue with the Approve button and post-approval state.

### Step 20. Counsel signs in and views the warrant

- Open the magic-link email as counsel. Land at `/counsel`.
- The counsel case portal shows the warrants on the case, metadata only.
- **[Screenshot 19]** — the counsel case view with warrant metadata, no evidence content, and the objection filing form.

### Step 21. Counsel files an objection

- In the objection form, type: "Warrant scope exceeds §69 grounds; keywords are overbroad."
- Submit.
- Objection appears in the case's audit trail.
- **[Screenshot 20]** — the objection filed confirmation.

---

## Act V — Cross-jurisdictional contamination refusal (adversarial demo)

### Step 22. Officer attempts cross-jurisdictional statute reference

- Return to warrant issuance wizard. Fill everything IN, but on step 5 submit statute references `['IN_IT_ACT_S69', 'US_18USC_2518']`.
- The API rejects with the red panel: "REJECTED — cross-jurisdiction contamination. Offending: US_18USC_2518."
- **[Screenshot 21]** — the contamination-refusal panel showing the offending statute.

This proves the platform's central design claim visibly in the demo.

---

## Act VI — Warrant extension flow

### Step 23. Officer requests warrant extension

- Navigate to `/authorizations/[id]` and click **Request Extension**.
- Fill:
  - New expires-on: 60 days from original expiry
  - Justification: "Investigation still ongoing; new leads require continuation."
  - Proportionality refresh: same 4 prongs updated.
  - Statute ref: `IN_IT_RULES_2009_R11`
- Submit.
- The extension appears in `authorization_extension` as PENDING.
- **[Screenshot 22]** — the extension request submitted.

### Step 24. Review Committee approves the extension

- Log in as REVIEW_COMMITTEE.
- On the extension row, click **Approve**.
- The parent authorization's `expires_on` is patched to the new date; the extension row is APPROVED.
- **[Screenshot 23]** — the extension approved view.

---

## Total: 23 screenshots covering the complete warrant lifecycle

These 23 screenshots cover:

- Case creation with locked jurisdiction (fig 3)
- Wizard with all 7 steps (figs 5-11)
- Review Committee approval (figs 12-13)
- Evidence ingestion + audit chain (figs 14-16)
- Counsel portal end-to-end (figs 17-21)
- Cross-jurisdictional contamination refusal (fig 21) — the money shot
- Warrant extension flow (figs 22-23)

Paper Figure 1 (system overview architecture) is drawn separately in draw.io or similar. Paper Figure 2 (state machine of warrant lifecycle) is drawn separately.

---

## Post-run cleanup

After screenshots, delete the demo evidence to avoid leaving PII in the DB:

```sql
DELETE FROM evidence WHERE session_id IN (
  SELECT id FROM monitoring_session WHERE authorization_id IN (
    SELECT id FROM authorization WHERE case_id IN (
      SELECT id FROM "case" WHERE external_case_ref = 'FIR-DL-2024-1234'
    )
  )
);
DELETE FROM authorization_extension WHERE parent_authorization_id IN (
  SELECT id FROM authorization WHERE case_id IN (
    SELECT id FROM "case" WHERE external_case_ref = 'FIR-DL-2024-1234'
  )
);
DELETE FROM authorization WHERE case_id IN (
  SELECT id FROM "case" WHERE external_case_ref = 'FIR-DL-2024-1234'
);
DELETE FROM subject WHERE id IN (
  SELECT subject_id FROM case_subject WHERE case_id IN (
    SELECT id FROM "case" WHERE external_case_ref = 'FIR-DL-2024-1234'
  )
);
DELETE FROM "case" WHERE external_case_ref = 'FIR-DL-2024-1234';
```

Also delete the demo counsel_access_request row.

---

## Paper section this feeds into

Section 4 (System and Design), subsection 4.3 (Scenario walkthrough). Two paragraphs of narrative plus 23 figures. Every claim in the design section (dual-mode, jurisdiction adapter, contamination refusal, dual-control, counsel portal, extension flow) is demonstrated by at least one screenshot in this walkthrough.
