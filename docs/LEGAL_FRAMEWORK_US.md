# Legal Framework — United States

Every technical feature in the US adapter of SendWiseForensic must be traceable to at least one statutory or constitutional basis. This document is the canonical mapping for the US jurisdiction. Every PR that adds or changes surveillance behaviour in the US adapter must cite the row(s) it implements or amends.

> **Scope:** United States federal law. State wiretap statutes (many of which are stricter than Title III — e.g., California Invasion of Privacy Act, Maryland's all-party consent rule) are out of scope for the MVP and tracked as `TODO(US-STATE-WIRETAP-OVERLAY)`. Foreign-intelligence surveillance (FISA) is deliberately out of scope — see §8.

## 1. Constitutional / rights foundation

### Fourth Amendment — unreasonable searches and seizures

> "The right of the people to be secure in their persons, houses, papers, and effects, against unreasonable searches and seizures, shall not be violated, and no Warrants shall issue, but upon probable cause, supported by Oath or affirmation, and particularly describing the place to be searched, and the persons or things to be seized."

Four Supreme Court decisions anchor the 4th-Amendment reading that the US adapter enforces:

1. **Katz v. United States, 389 U.S. 347 (1967)** — the 4th Amendment "protects people, not places." Established the *reasonable expectation of privacy* test (Harlan, J., concurring). Electronic surveillance is a "search" for constitutional purposes.
2. **Berger v. New York, 388 U.S. 41 (1967)** — struck down New York's eavesdropping statute for insufficient particularity, duration limits, and post-surveillance notice. Set the constitutional minima that Title III was drafted to satisfy.
3. **Riley v. California, 573 U.S. 373 (2014)** — a warrant is generally required to search a cell phone, even incident to arrest. Anchors the platform's insistence that device-side collection requires a warrant.
4. **Carpenter v. United States, 138 S. Ct. 2206 (2018)** — historical cell-site location information (CSLI) is protected by the 4th Amendment; the third-party doctrine does not extend to the "detailed chronicle of a person's physical presence." Anchors the platform's treatment of location-adjacent metadata as warrant-only.

**Design implication.** Every US `Authorization` object carries a **Berger/Title III checklist** with six prongs (probable cause, particularity, necessity / exhaustion of alternatives, duration cap, minimization, post-surveillance notice) recorded and justified by the applying agent, and reviewed by the authorizing judge. Authorizations without a completed checklist cannot leave `DRAFT`. This is the US analogue of India's Puttaswamy proportionality checklist.

## 2. Substantive law of interception & monitoring

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **Title III of the Omnibus Crime Control and Safe Streets Act of 1968** (Wiretap Act) | 18 U.S.C. §2510 | Definitions — "wire communication", "oral communication", "electronic communication", "intercept". | Adapter maps `data_category` values to Title III categories; keystroke capture on a subject device is treated as interception of an electronic communication at acquisition. |
| Wiretap Act | 18 U.S.C. §2516 | Enumerates the federal offences for which a Title III order may be sought and identifies the DOJ officials who may authorize an application. | `Authorization.type = JUDICIAL_WARRANT` with US adapter requires `case.offences[]` to intersect the §2516 predicate-offence list; the applying official's role must be within §2516's authorized list. |
| Wiretap Act | 18 U.S.C. §2518(1)(b) | Application must state the offence, the facilities, a particular description of the communications sought, and the identity of the person, if known. | Enforces particularity — `authorization.scope` requires `dataCategories[]`, `devices[]`, and either a named `subject_id` or an explicit "identity unknown" justification. |
| Wiretap Act | 18 U.S.C. §2518(5) | Order duration ≤ 30 days; extensions require a fresh application; interception must terminate on attainment of the objective. | US adapter caps `expires_on ≤ issued_on + 30 days`; extension logic requires re-approval; the platform's "objective attained → auto-terminate" hook is Title III-driven, not just policy. |
| Wiretap Act | 18 U.S.C. §2518(7) | Emergency interception ≤ 48 hours pending judicial order. | `Authorization.type = JUDICIAL_WARRANT` with `emergency: true` — hard cap 48h, must be replaced by a full order or the collection is inadmissible. `TODO(US-2518-7-EMERGENCY)`. |
| Wiretap Act | 18 U.S.C. §2518(8)(a) | Recordings shall be sealed under the judge's directions immediately upon expiration; presence of the seal is a prerequisite to use. | Evidence export flow generates a sealed-package manifest signed at expiration; the seal record is a first-class artefact tied to the export event. |
| Wiretap Act | 18 U.S.C. §2518(8)(d) | Inventory notice to named persons within 90 days of order termination. | `TODO(US-2518-8D-INVENTORY-NOTICE)` — scheduled notice generator to be added to the auto-expiry cron. |
| **Electronic Communications Privacy Act of 1986** (ECPA) | Pub. L. 99-508 | Amended Title III to cover electronic communications; introduced SCA and Pen/Trap. | Adapter treats keystroke, app-event, and comms-metadata categories under the ECPA-amended definitions. |
| **Stored Communications Act** | 18 U.S.C. §§2701–2713 | Governs compelled disclosure of stored communications and records from providers. Different process thresholds by content vs. non-content and by age. | Out of primary path (SendWiseForensic is device-side, not provider-side), but adapter records SCA process references when parallel provider process exists. `TODO(US-SCA-PARALLEL-PROCESS)`. |
| **Pen Register / Trap and Trace Statute** | 18 U.S.C. §§3121–3127 | Non-content dialling / addressing information; lower "relevance to an ongoing investigation" threshold. | `Authorization.type` extension `US_PEN_TRAP` not in MVP; cross-referenced in warrant metadata when police also hold a Pen/Trap order for the same subject. |
| **All Writs Act** | 28 U.S.C. §1651 | Residual authority for courts to issue writs necessary or appropriate in aid of their jurisdictions. | Recorded, not invoked. Used by government to compel provider assistance in edge cases (e.g., *Apple*). The platform does not accept an All Writs order as a standalone basis for collection. |
| **Federal Rules of Criminal Procedure — Rule 41** | FRCP 41 | Warrants for search and seizure, including electronic storage media (Rule 41(e)(2)(B)). | Rule 41 warrants for device-side data are accepted as `JUDICIAL_WARRANT` with the US adapter's Rule 41 branch; the scope must still meet Title III particularity where interception (as opposed to seizure of stored content) occurs. |

## 3. Procedural / criminal law

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **Bail Reform Act of 1984** | 18 U.S.C. §3142 | Pretrial release conditions; court may impose conditions to assure appearance and community safety, including electronic monitoring. | `Authorization.type = BAIL_CONDITION`; `IssuingAuthority` = US Magistrate Judge / District Court; scope inherited from the release order. |
| **Probation** | 18 U.S.C. §3563 | Conditions of probation; court may impose discretionary conditions reasonably related to statutory factors. | `Authorization.type = PROBATION_ORDER`. Search conditions on supervised release are cited when applicable. |
| **Plea agreements** | FRCP 11 | Plea procedure; may include cooperation and monitoring conditions. | `Authorization.type = PLEA_AGREEMENT`; consent record from court-endorsed plea. |

## 4. Evidence

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **Federal Rules of Evidence — Rule 901** | FRE 901 | Authenticating or identifying evidence: sufficient evidence to support a finding that the item is what the proponent claims. | Every US evidence export triggers auto-generation of a **Rule 901 authentication certificate** with device details, collection window, integrity hash, and signing agent's identity. This is the US analogue of India's BSA §63 certificate. |
| **FRE 902(13)–(14)** | FRE 902 | Self-authenticating records generated by an electronic process, or copies of electronic data, when accompanied by a qualifying certification. | Rule 901 certificate is drafted to satisfy 902(13)/(14) form so parties may stipulate to authentication. |
| **Wiretap Act** | 18 U.S.C. §2518(8)(a) | Sealed recordings requirement (see §2). | Certificate references the sealing record. |
| **Wiretap Act** | 18 U.S.C. §2515 | Prohibition of use of intercepted communications obtained in violation of Title III. | Renderer refuses to emit a certificate if adapter validation flagged any §2518 violation on the underlying authorization. |

## 5. Data protection

The United States has no omnibus federal data-protection statute analogous to DPDPA or UK GDPR. The adapter models the following overlays instead:

| Instrument | Relevance | System mapping |
|---|---|---|
| **Privacy Act of 1974** | 5 U.S.C. §552a | Governs federal-agency systems of records. | If a deployment sits inside a federal agency, the deployment must be published as a System of Records Notice (SORN); the adapter carries a `sorn_ref` field on the tenant. `TODO(US-SORN-REGISTRATION)`. |
| **CJIS Security Policy** | FBI CJIS | Baseline security for criminal-justice information. | Deployment posture control; not a per-row field. |
| **State law overlays** | (varies) | e.g., CA CCPA/CPRA, IL BIPA, WA My Health My Data. | Out of scope for MVP. `TODO(US-STATE-PRIVACY-OVERLAY)`. |

## 6. Ancillary / referenced

| Statute | Section | System touchpoint |
|---|---|---|
| **18 U.S.C. §2511** | Interception and disclosure of wire, oral, or electronic communications prohibited except as authorized | Cited in the audit-log warning shown to every US-adapter user at login. |
| **18 U.S.C. §2520** | Civil remedies for unlawful interception | Cited in officer onboarding acknowledgement. |
| **28 C.F.R. §0.85** | DOJ authorization procedures | Cross-referenced when application is federal. |

## 7. Feature → statute traceability (US, MVP)

| Feature | Statute codes (US_ prefix) |
|---|---|
| Judicial-warrant issuance (interception) | `US_18USC_2518`, `US_18USC_2516`, `US_TITLE_III_1968` |
| Judicial-warrant issuance (stored device data) | `US_FRCP_41` |
| Particularity requirement | `US_18USC_2518_1_B`, `US_BERGER_1967` |
| 30-day duration cap | `US_18USC_2518_5` |
| Emergency 48h interception | `US_18USC_2518_7` |
| Sealing at expiration | `US_18USC_2518_8_A` |
| Inventory notice within 90 days | `US_18USC_2518_8_D` |
| Berger/Title III proportionality checklist | `US_BERGER_1967`, `US_KATZ_1967`, `US_18USC_2518` |
| Cell-phone and metadata warrant treatment | `US_RILEY_2014`, `US_CARPENTER_2018` |
| Evidence authentication certificate | `US_FRE_901`, `US_FRE_902_13`, `US_FRE_902_14` |
| Exclusionary rule at export | `US_18USC_2515` |
| Bail-condition monitoring | `US_18USC_3142` |
| Probation-order monitoring | `US_18USC_3563` |
| Stored-content parallel process | `US_18USC_2703`, `US_ECPA_1986` |
| Pen/Trap parallel process | `US_18USC_3123` |

## 8. What the US adapter deliberately does **not** claim

- It is **not** a FISA tool. **FISA (50 U.S.C. §§1801–1885)** and orders of the Foreign Intelligence Surveillance Court are explicitly out of scope; the adapter refuses to accept a FISA authorization type. Foreign-intelligence surveillance requires a distinct legal, oversight, and classification posture that this platform does not provide. `TODO(US-FISA-OUT-OF-SCOPE-GUARD)`.
- It does not automate the *decision* to issue a Title III order; that is a judicial function.
- It does not replace DOJ Office of Enforcement Operations review of Title III applications — it records and structures it.
- It does not perform provider-side compelled disclosure under the SCA; it only records that parallel process exists.
- It does not adjudicate state-law wiretap overlays (all-party-consent states, etc.).
- It does not authenticate real signatures in the prototype (see `PROTOTYPE_NOTICE.md`); the US adapter uses a stubbed FRCP Rule 41 / Title III signature provider — `TODO(US-JUDICIAL-SIGNATURE-PROVIDER)`.

## 9. Open legal questions to resolve before US pilot

1. Which US federal district(s) would host the pilot, and does the district have local rules that alter Title III / Rule 41 handling? `TODO(US-DISTRICT-LOCAL-RULES)`.
2. State-law overlays: which state's wiretap statute applies to a subject present in an all-party-consent state? Requires per-state overlay before any state-level deployment.
3. Interaction between Rule 41 electronic-storage warrants and Title III when the same device is both seized (stored data) and monitored live (interception) — practice guidance to be codified before pilot.
4. `Carpenter` scope creep: does the platform's aggregation of app-event metadata over a 30-day window trigger a `Carpenter`-style analysis independent of Title III? Conservative posture: assume yes; warrant-gate all aggregation.
5. Inventory notice under §2518(8)(d) — automated generation vs. attorney-in-the-loop. Prototype defers to attorney-in-the-loop.
