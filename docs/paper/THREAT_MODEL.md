# Threat Model — SendWiseForensic

> STRIDE + LINDDUN + our own additional adversary classes. This is a paper-ready threat model that formalizes what SendWiseForensic defends against, what it does not, and where the residual risk sits.

---

## 1. Assets to protect

Ranked by sensitivity:

| Asset | Confidentiality | Integrity | Availability |
|---|:-:|:-:|:-:|
| Subject's collected message content (evidence payloads) | Critical | Critical | High |
| Subject's on-device typed input (before evidence tagging) | Critical | High | Medium |
| Warrant authorization records | High | Critical | High |
| Officer credentials + session tokens | Critical | Critical | Medium |
| Audit log chain | Medium | Critical | Critical |
| Attorney-client / medical / clergy privileged content (Filter Team queue) | Critical | Critical | High |
| BSA §63 / §2518(8)(a) certificates | High | Critical | High |
| Hash-chained evidence integrity | Medium | Critical | Medium |
| Legal-framework adapter code (statute encoding) | Medium | High | High |
| Cross-jurisdictional grant records | High | High | Medium |

---

## 2. Adversary classes

### A. External attacker (unauthenticated)

- Standard web attacker. Wants to steal data, extract credentials, or DoS.
- Capabilities: internet-facing scanning, XSS/CSRF/SQLi attempts, credential stuffing.

### B. Rogue authenticated officer

- Legitimate officer with valid credentials who wants to see data outside their case scope or jurisdiction.
- Capabilities: authenticated API calls, browser-based lookups, potentially social engineering of admin.

### C. Rogue admin

- Legitimate admin who wants to create fictitious officer accounts, escalate roles, or delete audit trails.
- Capabilities: admin console access, indirect API access.

### D. Compromised officer credential

- External attacker who has stolen an officer's login + password / session token.
- Capabilities: full officer permissions until token expires.

### E. Compromised admin credential

- External attacker with stolen admin credentials.
- Capabilities: full admin permissions until token expires.

### F. Insider Filter-Team member abusing quarantine

- Filter Team member who wants to leak privileged material they legitimately see.
- Capabilities: read access to PENDING_FILTER queue.

### G. Compromised Supabase / infrastructure provider

- Cloud provider itself is subverted (nation-state pressure, insider at Supabase, misconfigured tenant).
- Capabilities: full DB read/write, bypass of RLS.

### H. Subject attempting to evade collection

- The subject under warrant tries to detect, disable, uninstall, or spoof the app.
- Capabilities: root access to their own device, factory reset, side-loaded modifications.

### I. Corrupt Judicial / Review Committee member

- The authority whose signature legitimizes the warrant is themselves corrupt or subverted.
- Capabilities: valid statutory approvals of unlawful surveillance.

### J. Cross-jurisdictional contamination (intentional or accidental)

- Actor uses a US-jurisdiction warrant to justify collection under Indian statutes, or mixes IN and UK statute references.
- Capabilities: API-level attempts to submit mixed authorizations.

### K. Court challenge / suppression motion adversary

- Defense counsel who wants to invalidate the entire evidence chain to get the case dismissed.
- Capabilities: subpoena of platform records, expert testimony against integrity claims.

### L. Downstream evidence tampering by prosecution

- After legitimate collection, prosecution attempts to modify evidence before trial to strengthen case.
- Capabilities: hash re-computation attempts, certificate forgery.

---

## 3. STRIDE analysis (per component × per adversary)

### 3.1 Android on-device agent (SupervisedKeyboardApp)

| Threat | Adversary | Defense in SendWiseForensic | Residual risk |
|---|---|---|---|
| **S**poofing (fake evidence upload from non-authorized source) | A, D | Hardware-backed Keystore signature on each batch; server rejects unsigned uploads | Medium (software-key fallback on prototype) |
| **T**ampering with collection scope | H | CollectionGate is the only code path; scope inherited from server-signed authorization | Medium (rooted device can modify agent) |
| **R**epudiation of collected content | H | Hash chain per session; per-batch device signature | Low if signature verified |
| **I**nformation disclosure (agent leaks content to attacker) | A, H | Content encrypted at rest; upload over TLS; no local retention beyond batch buffer | Medium (compromised app could exfiltrate) |
| **D**oS of collection | H | Not defended against — subject can uninstall, factory-reset, or replace device | High. Detection only (tamper receiver + audit) |
| **E**levation of privilege on device | A, H | Agent runs with normal IME privileges; no root escalation attempted | Low |

### 3.2 Backend API (forensic-console)

| Threat | Adversary | Defense | Residual risk |
|---|---|---|---|
| **S**poofing (fake authenticated calls) | A | Supabase JWT session + PKCE code exchange | Low |
| **T**ampering with authorization records | B, C | RLS + immutable jurisdiction trigger + adapter validation | Low |
| **R**epudiation of admin actions | C | Audit chain writes every admin action | Low if audit chain integrity preserved |
| **I**nformation disclosure across cases/jurisdictions | B, D | RLS per case + jurisdiction match trigger + case_officer join | Low |
| **D**oS of platform | A | Vercel + Supabase native protections; not custom | Medium (no rate limiting on prototype) |
| **E**levation to admin from officer | B, D | Admin role requires bootstrap SQL (not console-invitable); refuse_admin_via_client trigger | Low |

### 3.3 Database (Supabase Postgres)

| Threat | Adversary | Defense | Residual risk |
|---|---|---|---|
| **S**poofing (unauthorized DB access) | A | RLS on every relevant table; service-role secret in Vercel Env only | Medium (secret rotation not automated) |
| **T**ampering with evidence rows | B, G | Append-only audit log with hash chain; evidence table triggers | Medium if attacker has direct psql access (bypass RLS with service role) |
| **T**ampering with statute references | B, G | Statute-prefix trigger blocks cross-jurisdictional inserts | Low |
| **R**epudiation of DB writes | G | Audit chain records who wrote what | Low if audit chain not truncated |
| **I**nformation disclosure via SQL injection | A | Parameterized queries via Supabase JS client only | Low |
| **D**oS via query complexity | A | Supabase native rate limits | Medium |
| **E**levation to superuser | G | Depends on Supabase tenancy isolation | Low but not zero |

### 3.4 Audit log

| Threat | Adversary | Defense | Residual risk |
|---|---|---|---|
| Tampering with past entries | B, C, G | Hash chain; UPDATE/DELETE refused by role privileges | Medium (service-role bypass) |
| Truncation of chain | G | Hash chain detects gap; last-known-hash publication would raise the bar | High until external anchoring is implemented (TODO in code) |
| Volume overflow / cost DoS | A | No mitigation | Medium |

---

## 4. LINDDUN privacy analysis

LINDDUN is the privacy-focused threat modeling framework (Linkability, Identifiability, Non-repudiation, Detectability, Disclosure, Unawareness, Non-compliance). Applied to the *subject* under warrant:

| LINDDUN dimension | Threat | Defense in SendWiseForensic | Residual risk |
|---|---|---|---|
| **L**inkability of subject sessions | An observer correlates multiple monitoring sessions to build a longitudinal profile | Sessions are per-authorization; expiring a warrant seals its evidence | Medium (long-running warrants with many extensions still enable profile) |
| **I**dentifiability of subject | Metadata leakage identifies subject to non-authorized viewers | Pseudonymous labels in UI; identity refs are hashed | Low |
| **N**on-repudiation (subject cannot deny messages) | Subject wants to plausibly deny an incriminating message | Hash chain + device signature makes messages non-repudiable | *This is intentional* — the platform's forensic purpose *requires* non-repudiation |
| **D**etectability of monitoring by subject | Subject wants to remain unaware of monitoring OR wants to know they are being monitored | *Intentionally detectable* — persistent "SUPERVISED" notification, IME status pill, both required for Puttaswamy procedural safeguard | Design choice; some regimes might prefer covert monitoring (we refuse this) |
| **D**isclosure of collected content to unauthorized parties | Officer outside case scope accesses evidence | RLS scope enforcement | Low |
| **U**nawareness of processing | Subject does not know what categories of data are collected | Counsel portal shows scope; subject can request via counsel | Medium (counsel portal magic-link stubbed) |
| **N**on-compliance with legal frameworks | System collects data outside statutory permission | 8-layer cross-jurisdictional enforcement | Low |

**LINDDUN summary:** SendWiseForensic *intentionally reduces* non-repudiation and detectability *asymmetrically* — the subject *cannot* repudiate messages (forensic requirement) but *must* know they are being monitored (Puttaswamy procedural safeguard). This is a considered design trade-off, not a privacy failure.

---

## 5. Attacks the design does NOT prevent (honest disclosure)

These belong in the paper's *Limitations* section, not swept under the rug.

1. **A corrupt judicial authority issuing a legally-signed unjust warrant.** The platform faithfully executes valid-looking warrants. If the Home Secretary is corrupt or subverted, the platform's role is post-hoc audit visibility (Judicial Auditor role reads the audit log), not prevention.

2. **A rooted subject device.** The Android agent can be disabled, spoofed, or modified. The platform detects tamper events, but this is detection, not prevention.

3. **A compromised Supabase tenancy.** Service-role secrets or Postgres superuser access bypass RLS. This is a cloud-provider trust assumption; the platform assumes Supabase's own security posture.

4. **A colluding pair (admin + review committee member).** Two-person control defeats one bad actor; two colluding actors defeat two-person control. Real-world mitigations (rotating committees, ombudsman, external audit) are policy, not code.

5. **A rogue Filter Team member leaking privileged content.** Filter Team members legitimately see privileged content. They can leak it. The platform provides an audit trail but not prevention.

6. **A downstream storage service that retains evidence beyond the statutory purge window.** Once evidence is exported to prosecution systems, the platform's control ends. Retention discipline is external.

7. **A well-resourced state actor (nation-state adversary).** SendWiseForensic assumes commodity threat model. A nation-state actor targeting the platform infrastructure — with zero-day capability, coercion of cloud providers, or supply-chain attack — is out of scope.

8. **Legal challenges based on doctrinal reinterpretation.** If a court subsequently rules that a statute the platform relies on is unconstitutional or reinterpreted (Puttaswamy analogs continue to evolve), the platform's compliance framing may fail retroactively. This is a legal risk, not a technical one.

---

## 6. Threat model summary for the paper

Two paragraphs, ready to include:

> SendWiseForensic assumes a commodity threat model in which adversaries include external attackers (A), rogue officers and admins with valid credentials (B, C, D, E), compromised Filter Team members (F), a partially-compromised cloud infrastructure provider (G), a subject actively evading collection (H), a corrupt judicial authority (I), attempted cross-jurisdictional contamination (J), a court challenge adversary (K), and downstream evidence tampering (L). Nation-state actors and colluding-authority attacks are out of scope. The design employs STRIDE-per-component and LINDDUN-per-subject analyses to identify defenses; residual risks are documented explicitly, not sanitized.
>
> The strongest defenses are the DB-trigger + adapter validation for cross-jurisdictional contamination, and the append-only audit chain for repudiation. The weakest defenses are (i) prevention of a corrupt authority issuing a valid-looking warrant, (ii) prevention of collusion between admin and Review Committee, and (iii) prevention of a rooted-device subject disabling the agent. These weaknesses are structural to any lawful-supervision system and are best mitigated by policy, oversight, and detection rather than by additional architectural constraint.

---

## 7. Comparison of threat coverage to alternatives

For the paper's evaluation section:

| Adversary class | Cellebrite | Pegasus | Consumer parental controls | Enterprise DLP | **SendWiseForensic** |
|---|:-:|:-:|:-:|:-:|:-:|
| External attacker (A) | ✓ | Weak (state target) | Weak | ✓ | ✓ |
| Rogue officer (B) | Manual audit | ✗ | ✗ | Partial | **✓ (RLS)** |
| Compromised credentials (D, E) | Depends on org | ✗ | ✗ | ✓ | ✓ |
| Insider filter-team abuse (F) | N/A | N/A | N/A | Partial | **Documented gap** |
| Compromised infrastructure (G) | On-prem often | N/A | ✗ | Enterprise varies | **Documented gap** |
| Evading subject (H) | Not applicable (post-hoc) | Partially | ✗ | ✗ | **Detected, not prevented** |
| Corrupt authority (I) | N/A | Exploits this | N/A | N/A | **Documented gap** |
| Cross-jurisdiction contamination (J) | External to product | ✗ | N/A | Partial | **✓ (8-layer)** |
| Court challenge (K) | Well-supported | ✗ | N/A | N/A | ✓ (BSA §63) |
| Downstream tampering (L) | Chain-of-custody | ✗ | N/A | ✗ | ✓ (hash chain) |

This comparison table is publishable in the *Evaluation* section.
