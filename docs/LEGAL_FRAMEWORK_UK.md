# Legal Framework — United Kingdom

Every technical feature in the UK adapter of SendWiseForensic must be traceable to at least one statutory or convention basis. This document is the canonical mapping for the UK jurisdiction. Every PR that adds or changes surveillance behaviour in the UK adapter must cite the row(s) it implements or amends.

> **Scope:** United Kingdom (England & Wales primarily; Scotland and Northern Ireland have distinct criminal-procedure rules noted where relevant). Investigatory Powers Act 2016 (IPA 2016) is the primary instrument; RIPA 2000 is treated as legacy but is still cited for directed/intrusive surveillance and legacy §49 encryption-key powers.
>
> **Terminology clarification.** "BSA" in this document, where it appears at all, refers to Bharatiya Sakshya Adhiniyam 2023 (India) and is used only to contrast admissibility frameworks. The **British Statute of Frauds** is irrelevant here. The UK admissibility framework is materially different from India's BSA §63 regime and is anchored in PACE 1984, the Criminal Justice Act 2003, and IPA 2016 §56 (which excludes intercept material from most legal proceedings entirely).

## 1. Constitutional / rights foundation

The UK has no single written constitution; the surveillance framework is anchored in the **European Convention on Human Rights (ECHR) Article 8** as incorporated by the **Human Rights Act 1998**.

### ECHR Article 8 — right to respect for private and family life

> "1. Everyone has the right to respect for his private and family life, his home and his correspondence.
> 2. There shall be no interference by a public authority with the exercise of this right except such as is in accordance with the law and is necessary in a democratic society in the interests of national security, public safety or the economic well-being of the country, for the prevention of disorder or crime, for the protection of health or morals, or for the protection of the rights and freedoms of others."

Two decisions set the three-prong test the UK adapter enforces:

1. **Malone v. United Kingdom (1984) 7 EHRR 14** — UK telephone-metering regime violated Art. 8 because it lacked "in accordance with the law" quality: no accessible legal basis, insufficient foreseeability. Established that surveillance interference must have a clear statutory basis of sufficient quality.
2. **Weber and Saravia v. Germany (2006) 46 EHRR SE5** — set out the six minimum safeguards for strategic monitoring regimes, elaborating the **"necessary in a democratic society"** limb into (a) nature of offences, (b) categories of persons, (c) duration limits, (d) procedure for examining/using/storing data, (e) precautions when communicating data, (f) circumstances for erasure/destruction. The UK adapter's proportionality checklist is modelled on these six safeguards.

**The three-prong "necessary in a democratic society" test** the adapter enforces:

1. **In accordance with the law** — clear statutory basis (IPA 2016 §§15, 17, 19 for targeted interception; RIPA Part 2 for surveillance).
2. **Legitimate aim** — one of the Art. 8(2) grounds; IPA 2016 §20 codifies national security, serious crime, economic well-being.
3. **Necessary and proportionate in a democratic society** — Weber safeguards, IPA 2016 §§19(2)–(3) necessity and proportionality tests, double-lock scrutiny.

**Design implication.** Every UK `Authorization` object carries a **Weber/IPA checklist** with the three prongs decomposed into the six Weber safeguards, recorded by the applying agency and reviewed both by the Secretary of State (or designated authoriser) and by a Judicial Commissioner under the double-lock. Authorizations without a completed checklist cannot leave `DRAFT`.

## 2. Substantive law of interception & monitoring

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **Human Rights Act 1998** | §§3, 6 | Public authorities must act compatibly with Convention rights; legislation must be read compatibly so far as possible. | Adapter treats every UK code path as a "public authority act" for §6 purposes; refusal codes cite Art. 8 where applicable. |
| **Investigatory Powers Act 2016** | §15 | Subject-matter of targeted interception warrants — persons, premises, or groups sharing a common purpose. | `authorization.scope.targetKind` enum: `PERSON | PREMISES | GROUP`. |
| **IPA 2016** | §17 | Targeted interception: what conduct a warrant authorises. | Adapter maps `data_category` to §17 authorised conduct. |
| **IPA 2016** | §19 | Grounds on which warrants may be issued (national security, serious crime, economic well-being) and necessity/proportionality tests. | `authorization.legitimate_aim` must be one of `NATIONAL_SECURITY | SERIOUS_CRIME | ECONOMIC_WELLBEING`; Weber checklist attached. |
| **IPA 2016** | §23 | **Double-lock**: warrant issued by Secretary of State only takes effect after approval by a Judicial Commissioner. | Adapter refuses to transition an interception `authorization` to `ACTIVE` without two distinct approval records — one Secretary of State (or delegate), one Judicial Commissioner (JC). |
| **IPA 2016** | §26 | Special protections where a Member of Parliament's communications are targeted — Prime Minister must be consulted (Wilson Doctrine codified). | `authorization.subject_role = MP` triggers PM-consultation record requirement; adapter refuses `ACTIVE` without it. |
| **IPA 2016** | §§28–29 | Additional safeguards for confidential journalistic material and sources of journalistic material. | `authorization.privilege_flags.journalistic = true` triggers the enhanced safeguard workflow and JC-source approval. |
| **IPA 2016** | §29 | **Urgent case** — warrant may take effect before JC approval but must be reviewed by a JC within **5 working days**; if the JC refuses approval, the warrant is quashed and material must be destroyed unless the JC directs otherwise. | Adapter accepts `emergency: true` with a hard cap of 5 working days; scheduled JC review is enqueued at issuance; auto-quash + destroy hook on refusal. `TODO(UK-JC-URGENT-REVIEW-QUEUE)`. |
| **IPA 2016** | §32 | **Duration** — warrants cease to have effect at end of 6 months (for national security / economic well-being) or 3 months (for serious crime), unless renewed. | UK adapter caps `expires_on - issued_on` per this section; renewal path required for extension. |
| **IPA 2016** | §56 | **Exclusion of matters from legal proceedings** — intercept material is generally inadmissible in legal proceedings and its existence cannot ordinarily be disclosed. | This is the **critical divergence from India and the US.** UK evidence exports for intercept material do **not** flow to open court; the adapter refuses to generate an "open-court" export for §56-scope material and instead generates a **§56-compliant closed-material handling packet**. `TODO(UK-S56-CLOSED-MATERIAL-PACKET)`. |
| **IPA 2016** | §§99, 102 | Targeted equipment interference (EI) warrants and their double-lock. | Where the adapter is used for on-device equipment interference (which is the SendWiseForensic use case), the EI warrant regime applies rather than the interception regime; adapter selects the EI branch based on `case.collection_mode`. |
| **IPA 2016** | §108 | EI: subject-matter categories. | `authorization.ei_target_kind` enum. |
| **IPA 2016** | §113 | EI duration and renewal — analogous 6/3-month cap. | Mirror of §32 cap for EI warrants. |
| **IPA 2016** | §§150–152 | **Handling, retention, disclosure and destruction arrangements** — the Secretary of State must ensure arrangements exist that limit copying, disclosure, and require destruction when retention is no longer necessary. | Storage, RLS, and auto-purge configuration references its §150 handling-arrangements ID; every evidence row carries a `handling_arrangement_ref`. |
| **IPA 2016** | §§229–241 | **Investigatory Powers Commissioner (IPC)** and Judicial Commissioners — oversight body. | `officer.role = JUDICIAL_COMMISSIONER` for JC approvals; audit-log stream is exposed to IPC inspection endpoints. `TODO(UK-IPC-INSPECTION-ENDPOINT)`. |
| **Regulation of Investigatory Powers Act 2000 (RIPA)** — legacy | Part 2 | Authorises directed surveillance and intrusive surveillance (i.e., surveillance not amounting to interception under IPA). | Legacy path retained for directed/intrusive surveillance authorisations; new deployments should prefer IPA equivalents. |
| **RIPA 2000** — legacy | §49 | Notice requiring disclosure of encryption keys / plaintext. | Legacy; adapter records a §49 notice reference when applicable but does not issue notices. |

## 3. Procedural / criminal law (bail, probation, evidence handling)

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **Bail Act 1976** | §3 | Court may grant bail subject to conditions "necessary to secure" attendance, non-commission of offence, non-interference with witnesses, etc. Electronic monitoring conditions supported by CJPOA 1994 §51 and later provisions. | `Authorization.type = BAIL_CONDITION`; issuer = Magistrates' Court / Crown Court; scope inherited from bail order. |
| **Criminal Justice and Public Order Act 1994** | §51 | Bail conditions may include electronic monitoring. | Cited on `BAIL_CONDITION` authorizations that impose monitoring. |
| **Powers of Criminal Courts (Sentencing) Act 2000** | (as amended by later Sentencing Act 2020) | Community orders including electronic monitoring requirement, supervision requirement. | `Authorization.type = PROBATION_ORDER` (mapped to "community order" / supervision requirement in UK). |
| **Police and Criminal Evidence Act 1984 (PACE)** | Codes of Practice | Overall handling framework for evidence, custody, and access. | Referenced in the evidence-integrity checklist. |
| **PACE 1984** | §§9–11, Sch. 1 | **Special procedure material** and **excluded material** — journalistic material, confidential personal records — requires production order or special procedure warrant. | `authorization.privilege_flags.journalistic` and `.confidential_personal` route through the special-procedure workflow. |

## 4. Evidence (admissibility, chain of custody)

The UK admissibility framework is materially different from India's BSA §63 regime and from US FRE 901. Two features dominate:

1. **IPA 2016 §56 exclusion.** Intercept material is generally inadmissible in legal proceedings, and its existence generally cannot be disclosed. This forces a bifurcated evidence pipeline: intercept-derived material flows only to closed-material handling; equipment-interference-derived material and non-intercept device data may flow to open court subject to PACE.
2. **PACE and CJA 2003 hearsay rules** govern admissibility of electronic records in open court.

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **IPA 2016** | §56 | Exclusion of intercept matters from legal proceedings (see §2). | Renderer branches on `authorization.collection_mode`: intercept → closed-material packet only; EI or non-intercept → open-court PACE bundle. |
| **Criminal Justice Act 2003** | §§114–121 | Hearsay in criminal proceedings — statutory admissibility of business/records exceptions. | Certificate template for open-court bundles cites CJA §117 (business documents) where applicable. |
| **PACE 1984** | §78 | Court may exclude evidence whose admission would have an adverse effect on fairness. | Adapter records a **fairness dossier** alongside each export to support §78 argument, including collection window, minimisation records, and JC-approval trail. |
| **Criminal Procedure Rules** | CrimPR Part 19 (expert evidence), Part 16 (written statements) | Procedure for expert and written evidence. | Signing officer's statement is generated in CrimPR-compliant form for UK exports. `TODO(UK-CRIMPR-TEMPLATE)`. |

## 5. Data protection

| Statute | Section | What it says | System mapping |
|---|---|---|---|
| **Data Protection Act 2018 Part 3** | §§29–81 | Law-enforcement processing regime — the LED-based UK domestic regime for competent authorities processing personal data for law-enforcement purposes. | UK adapter's tenant configuration declares "competent authority" status per §30; processing records kept per §61; DPIA per §64. |
| **UK GDPR** | Arts. 5, 6, 32 | General processing principles; lawful bases; security of processing. | Applies to non-law-enforcement tenants and to non-law-enforcement processing within a competent-authority tenant. |
| **DPA 2018** | §§35–40 | Data-protection principles for law enforcement — lawful, fair, purpose-limited, minimised, accurate, storage-limited, secure. | Mirror of Puttaswamy proportionality in the UK adapter's data-handling controls. |
| **DPA 2018** | §§44–48 | Rights of the data subject in law-enforcement context, with restrictions where necessary for the purposes. | Subject portal (defense counsel view) implements these rights with §45 restriction hooks. |

## 6. Ancillary / referenced

| Statute | Section | System touchpoint |
|---|---|---|
| **Wilson Doctrine** | (constitutional convention, codified at IPA 2016 §26) | MP-communications targeting requires PM consultation record. |
| **Official Secrets Act 1989** | §§1–4 | Cited in officer onboarding acknowledgement. |
| **Computer Misuse Act 1990** | §§1–3A | Cited in the audit-log warning at login regarding unauthorised access. |
| **Serious Crime Act 2015** | §41 | Serious-crime definition cross-reference for IPA §19 grounds. |

## 7. Feature → statute traceability (UK, MVP)

| Feature | Statute codes (UK_ prefix) |
|---|---|
| Targeted interception warrant | `UK_IPA_2016_S15`, `UK_IPA_2016_S17`, `UK_IPA_2016_S19` |
| Double-lock (Secretary of State + JC) | `UK_IPA_2016_S23` |
| Urgent-case 5-working-day JC review | `UK_IPA_2016_S29` |
| Duration (6/3 months) + renewal | `UK_IPA_2016_S32` |
| Targeted equipment interference warrant | `UK_IPA_2016_S99`, `UK_IPA_2016_S102`, `UK_IPA_2016_S108` |
| EI duration + renewal | `UK_IPA_2016_S113` |
| Handling arrangements | `UK_IPA_2016_S150`, `UK_IPA_2016_S151`, `UK_IPA_2016_S152` |
| MP-communications (Wilson Doctrine) | `UK_IPA_2016_S26` |
| Journalistic material safeguards | `UK_IPA_2016_S28`, `UK_IPA_2016_S29`, `UK_PACE_1984_S9`, `UK_PACE_1984_S11` |
| Intercept exclusion from legal proceedings | `UK_IPA_2016_S56` |
| Weber/proportionality checklist | `UK_ECHR_ART_8`, `UK_HRA_1998_S6`, `UK_MALONE_1984`, `UK_WEBER_SARAVIA_2006` |
| Oversight (IPC / JCs) | `UK_IPA_2016_S229`, `UK_IPA_2016_S241` |
| Directed/intrusive surveillance (legacy) | `UK_RIPA_2000_PART_2` |
| Encryption-key notice (legacy) | `UK_RIPA_2000_S49` |
| Bail-condition monitoring | `UK_BAIL_ACT_1976_S3`, `UK_CJPOA_1994_S51` |
| Probation / community order supervision | `UK_SENTENCING_ACT_2020_COMMUNITY_ORDER` |
| Open-court evidence (non-intercept) | `UK_CJA_2003_S117`, `UK_PACE_1984_S78`, `UK_CRIMPR_PART_19` |
| Data-protection processing (LE) | `UK_DPA_2018_PART_3`, `UK_DPA_2018_S35`, `UK_UKGDPR_ART_5`, `UK_UKGDPR_ART_6` |
| Data-subject rights (LE context) | `UK_DPA_2018_S44`, `UK_DPA_2018_S45` |

## 8. What the UK adapter deliberately does **not** claim

- It is **not** a bulk-powers tool. IPA 2016 bulk interception (Part 6, Chapter 1), bulk acquisition (Part 6, Chapter 2), bulk EI (Part 6, Chapter 3), and bulk personal datasets (Part 7) are **out of scope**. The adapter refuses bulk-warrant authorization types. `TODO(UK-BULK-POWERS-OUT-OF-SCOPE-GUARD)`.
- It does not automate the *decision* to issue a warrant or the JC's approval; those are executive and judicial functions.
- It does not replace the Investigatory Powers Commissioner's inspection function — it exposes structured audit endpoints to it.
- It does not adjudicate Scotland- or Northern Ireland-specific criminal-procedure differences; per-nation overlays deferred. `TODO(UK-SCOTLAND-NI-OVERLAY)`.
- It does not currently generate a §56-compliant closed-material packet — the placeholder branch exists but the template needs Home Office / Treasury Solicitor sign-off. `TODO(UK-S56-CLOSED-MATERIAL-PACKET)`.
- It does not authenticate real signatures in the prototype (see `PROTOTYPE_NOTICE.md`); the UK adapter uses a stubbed IPC / Judicial Commissioner double-lock provider — `TODO(UK-JC-SIGNATURE-PROVIDER)`.

## 9. Open legal questions to resolve before UK pilot

1. IPA §56 handling packet — engagement with Home Office and IPCO required to agree the closed-material template before any pilot.
2. EI vs. interception line for on-device keystroke capture: the platform sits closer to EI (§99) than to targeted interception (§15) for device-side collection. Confirm categorisation with counsel before pilot; adapter defaults to EI branch.
3. Wilson-Doctrine handling for MP subjects — process for PM-consultation record needs to be agreed with Cabinet Office before any deployment that could target an MP.
4. Scotland-specific rules under the Criminal Procedure (Scotland) Act 1995 for bail and evidence require an overlay before Scottish deployment.
5. IPCO inspection endpoints: format and access controls to be agreed with IPCO Technology Advisory Panel.
6. Interaction with EU adequacy decisions post-Brexit if any data flow crosses the EEA boundary — must be resolved before any cross-border deployment.
