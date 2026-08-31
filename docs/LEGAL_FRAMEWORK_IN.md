# Legal Framework — India

Every technical feature in SendWiseForensic must be traceable to at least one statutory basis. This document is the canonical mapping. Every PR that adds or changes surveillance behavior must cite the row(s) it implements or amends.

> **Scope:** India. US and UK equivalents live in `LEGAL_FRAMEWORK_US.md` and `LEGAL_FRAMEWORK_UK.md` on their respective jurisdiction branches.

## 1. Constitutional foundation

### Article 21 — Right to life and personal liberty

The **Puttaswamy v. Union of India (2017)** nine-judge bench decision recognised the right to privacy as a fundamental right, and set the **four-prong proportionality test** that any state surveillance must satisfy:

1. **Legality** — backed by a valid law.
2. **Legitimate aim** — serves a legitimate state interest.
3. **Proportionality** — least intrusive means; rational nexus between means and aim.
4. **Procedural safeguards** — oversight, review, redress.

**Design implication:** every `Authorization` object in the system carries a `ProportionalityChecklist` with the four prongs recorded and justified by the requesting officer. The Review Committee reviews this record. Warrants without a completed checklist cannot be issued.

## 2. Substantive law of interception & monitoring

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **Information Technology Act, 2000** | §69 | Central/State govt may direct interception, monitoring, decryption of any info generated, transmitted, received or stored in any computer resource, in the interest of sovereignty, defence, security, friendly relations, public order, or preventing incitement to a cognizable offence. | `Authorization.type = JUDICIAL_WARRANT`; `IssuingAuthority` must be a designated Competent Authority; `LegitimateAim` must be one of the §69 grounds (enum). |
| **IT (Procedure & Safeguards for Interception, Monitoring and Decryption) Rules, 2009** | R.2, R.3, R.7, R.11, R.22 | Competent Authority = Union Home Secretary (Union) or State Home Secretary (State). Duration ≤ 60 days per order, extendable up to 180 days total. Review Committee (Cabinet Secretary + Secretary Legal + Secretary Telecom at Union; equivalent at State) reviews every 2 months. Records must be destroyed within 6 months of cessation unless required for functional requirements. | `expiresOn ≤ issuedOn + 60 days`; extension logic capped at 180 days total; Review Committee approval object; auto-purge cron at 6 months post-cessation. |
| **IT Act, 2000** | §69B | Central govt may authorize monitoring and collection of traffic data or information for cyber security. | Optional `Authorization.type = §69B_TRAFFIC` (not in MVP). |
| **Indian Telegraph Act, 1885** | §5(2) | Interception of messages in the interest of public safety / sovereignty on public emergency. | Cross-referenced for telephony; SendWiseForensic operates on device-side inputs, not carriers, so §5(2) is out of primary scope but cited in warrant metadata when police also hold a §5(2) order for the same subject. |

## 3. Procedural / criminal law

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS)** | Ch. XXXV (bail) | Bail may be granted with conditions; court may impose conditions in the interest of justice. | `Authorization.type = BAIL_CONDITION`; `IssuingAuthority` = Magistrate / Sessions Court; scope inherited from the bail order text. |
| **BNSS 2023** | Ch. XXIII | Plea bargaining procedure. | `Authorization.type = PLEA_AGREEMENT`; consent record from court order. |
| **Probation of Offenders Act, 1958** | §4, §5 | Court may release offender on probation of good conduct with conditions including supervision. | `Authorization.type = PROBATION_ORDER`. |

## 4. Evidence

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **Bharatiya Sakshya Adhiniyam, 2023 (BSA)** | §63 (replaces old Evidence Act §65B) | Electronic records admissible when accompanied by a certificate signed by a person in a responsible official position identifying the record, the device, the manner of production, and stating the device was operating properly. | Every evidence export triggers auto-generation of a §63 certificate with device details, collection window, integrity hash, and signing officer's identity. Certificate is a first-class artefact tied to the export event. |
| **BSA 2023** | §61, §62 | Distinguishes primary and secondary electronic evidence. | Raw payloads stored as primary evidence in encrypted cold storage; investigators normally work with signed secondary copies with §63 certificate attached. |

## 5. Data protection

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **Digital Personal Data Protection Act, 2023 (DPDPA)** | §4–§8 | Consent, notice, purpose limitation, data minimisation. | `VOLUNTARY_VICTIM` and `CORPORATE_INSIDER` pathways require explicit consent records; subject portal shows purposes. |
| **DPDPA 2023** | §11–§15 | Rights of data principal: access, correction, erasure, grievance. | Subject portal implements access + grievance; erasure is scoped by warrant expiry + retention rules. |
| **DPDPA 2023** | §17 | Exemptions — govt agencies notified for national security, prevention/detection of offences, etc., are exempt from many obligations. | For `JUDICIAL_WARRANT` etc., §17 notification reference is captured on the Authorization; exemption is **not** self-declared — it must reference a valid Union govt notification. |

## 6. Ancillary / referenced

| Statute | Section | System touchpoint |
|---|---|---|
| **Bharatiya Nyaya Sanhita, 2023 (BNS)** | (offence sections) | `Case.offences[]` uses BNS section codes as the canonical taxonomy. |
| **IT Act 2000** | §43A | Reasonable security practices — informs `CORPORATE_INSIDER` employer obligations. |
| **IT Act 2000** | §72 | Penalty for breach of confidentiality by persons securing access under the Act — cited in the audit-log warning shown to every officer at login. |

## 7. Feature → statute traceability (MVP)

| Feature | Statutes referenced |
|---|---|
| Judicial-warrant issuance | IT Act §69; 2009 Rules R.2, R.3 |
| 60/180-day expiry | 2009 Rules R.11 |
| Review Committee approval | 2009 Rules R.22 |
| Proportionality checklist | Puttaswamy 2017 |
| Privilege quarantine (lawyer/doctor/clergy/spouse) | Constitution Art. 20(3); BSA privilege sections; case law (`RM Malkani`, `Selvi`) |
| Scope-gated queries | Puttaswamy proportionality; 2009 Rules R.3 |
| Auto-expiry + sealing | 2009 Rules R.11, R.23 |
| BSA §63 certificate generation | BSA §63 |
| Hash-chained audit log | Puttaswamy procedural safeguard; BSA §63 integrity |
| Subject portal | Puttaswamy procedural safeguard; DPDPA §11–§15 |
| Dual-officer decryption | Puttaswamy proportionality (organisational safeguard) |
| Data purge at 6 months post-cessation | 2009 Rules R.23 |

## 8. What SendWiseForensic deliberately does **not** claim

- It does not automate the *decision* to issue a warrant. That is a Competent Authority function.
- It does not claim §17 DPDPA exemption on behalf of an agency; the exemption reference must be provided.
- It does not authenticate real Aadhaar or real e-Sign in the prototype (see `PROTOTYPE_NOTICE.md`).
- It does not replace the Review Committee — it records and structures its reviews.

## 9. Open legal questions to resolve before pilot

1. Interaction between DPDPA §17 exemption notifications and the 2009 Rules — pending clarifications from MeitY.
2. Admissibility of on-device ML classifier outputs as opinion vs. fact under BSA — likely opinion; the underlying keystroke record is the fact.
3. Cross-border data-transfer implications if any component uses non-Indian infrastructure — must be resolved before pilot; MVP assumes India-resident infrastructure only.
4. Whether the on-device app must display a persistent "monitoring active" indicator to the subject (analogous to Miranda / caution) — the prototype does; law is not settled.
