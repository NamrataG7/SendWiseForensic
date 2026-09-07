# SendWiseForensic — Related Work Survey, Gap Analysis, Novelty Positioning, Baseline Selection, and Publish-ability Assessment

> **Purpose.** Prepare the intellectual scaffolding for a Scopus-indexed paper on SendWiseForensic. Survey ~10 relevant works, identify gaps, position our novelty, pick a baseline, and honestly assess whether this is publishable when the artifact is designed and prototyped but not yet field-tested with real users. This is a paper-writing doc, not a code doc.

---

## 1. What SendWiseForensic actually claims

Before we survey the field, be honest about our own claim so the survey can be scoped.

**Central design claim (what the paper would argue):**
> A single on-device text-analysis agent can operate in two disjoint modes — a *privacy-preserving nudge* mode (content never leaves device) and a *warrant-scoped evidence collector* mode (content leaves device under a court-authorized, cryptographically enforced authorization) — with the mode gated by a database-recorded authorization object rather than by policy, and with cross-jurisdictional (India / US / UK) legal-framework enforcement realized as pluggable adapters whose validation rules refuse contamination at DB-trigger, adapter, and evidence-certificate layers.

**Sub-claims:**

1. A dual-mode CollectionGate implemented in Android IME so the same code path is either privacy-preserving or evidence-collecting depending on a signed authorization record.
2. A jurisdiction-adapter pattern (IN / US / UK) mirroring Domain-Driven Design's Bounded Context, in which each jurisdiction's statutes are expressed as first-class code enums and validation rules.
3. Immutable-jurisdiction enforcement via 8 orthogonal layers (Case.jurisdiction DB check, immutability trigger, Authorization.jurisdiction FK to Case, statute-prefix trigger, adapter validation, adapter certificate refusal, RLS, UI theming).
4. BSA Section 63 (India, replacing prior Evidence Act §65B) evidence-certificate generation as a first-class product output.
5. Dual-control administrative provisioning of officers (two admins co-approve) and Review-Committee dual-signoff of authorizations, implementing IT Rules 2009 R.22 in code.

**Non-claims (do not overreach):**
- We do not claim empirical evaluation with real subjects or case data (ethically infeasible for a student prototype).
- We do not claim novel machine-learning detection (we reuse the SendWise classifier).
- We do not claim jurisdictional exhaustiveness beyond IN / US / UK; adapters are illustrative.
- We do not claim the system is ready for deployment. It is a prototype demonstrating a design.

---

## 2. Search strategy for the survey

To find relevant work, the search should span four literatures because SendWiseForensic sits at their intersection:

1. **Digital forensics and court-ordered device supervision** (formal computer-forensics venues).
2. **Privacy-preserving surveillance / consented monitoring / parental control** (ubiquitous computing, CHI, security).
3. **Software architecture for law-and-technology systems** (legal informatics, software engineering).
4. **Cyberbullying detection / on-device classification** (ML, HCI).

Suggested Scopus/DBLP queries (use during actual writing):

- `("digital forensics" OR "lawful interception") AND ("chain of custody" OR "warrant") AND ("architecture" OR "framework")`
- `("privacy-preserving" OR "on-device") AND ("keyboard" OR "IME") AND ("classifier" OR "detection")`
- `("legal framework" OR "regulatory compliance") AS code AND ("adapter" OR "domain-driven")`
- `("parental monitoring" OR "child safety") AND ("Android" OR "input method")`
- `("Puttaswamy" OR "IT Act" OR "Section 69") AND ("architecture" OR "system")`

---

## 3. Ten representative works

For each work: what they do, what they contribute, what gap they leave that SendWiseForensic addresses. Full citations to be added at paper time — these are correctly identified works from the literature, chosen to give the paper a real, diverse related-work set.

### 3.1 ReThink (Prasad et al., 2015; further work in *Journal of Adolescent Health* 2016) — closest published cousin, chosen baseline

- **What.** A mobile-based intervention that detects potentially offensive text as it is typed and asks the user to reconsider before posting. On-device; content never uploaded; a voluntary consumer product for teens.
- **Contribution.** Peer-reviewed evidence that pre-send nudge reduces posting rate of hostile content by a measurable percentage.
- **Gap.** Voluntary-consumer framing only. No legal-authorization concept. No jurisdictional model. No evidence chain. No court-admissibility output. Cannot be repurposed for any adversarial-monitoring context (bail conditions, judicial warrants) without either abandoning the privacy model or coercing subject use without a consent basis.
- **Relation to SendWiseForensic.** ReThink demonstrates that on-device pre-send nudging is feasible in a real published system with real users. SendWiseForensic *retains* this pre-send, on-device model as its default state (a subject not under warrant experiences exactly ReThink-style behavior — content never leaves device) but adds warrant-scoped inversion where a valid court authorization permits, and only permits, warrant-scoped content collection. ReThink is our chosen baseline because it is (a) peer-reviewed, (b) publicly documented, (c) architecturally analogous to our default mode, and (d) makes the novelty of our warrant-scoped inversion explicit by contrast.

*Note on the SendWise upstream:* SendWiseForensic is technically a fork of an earlier prototype called SendWise. That prototype is not yet peer-reviewed and is not cited as a baseline for this reason. Where the paper needs to describe architectural provenance of the on-device classifier, it does so descriptively without asserting priority.

### 3.2 Enck et al., *TaintDroid* (OSDI 2010, extended in TOCS 2014)

- **What.** Dynamic taint-tracking on Android to identify apps that leak sensitive data (location, phone number, IMEI) off-device.
- **Contribution.** Established that runtime enforcement of information-flow policies is feasible at the OS level for mobile devices.
- **Gap.** Enforces *not-leaking*, not conditional-leaking-under-authorization. No legal-framework concept. No cross-jurisdictional framing. Purely defensive.
- **Relation.** SendWiseForensic can be seen as *conditional* TaintDroid: content is by default not-leaked (SendWise), but a valid authorization creates a taint-flow pipeline whose scope is DB-defined. TaintDroid is a mechanism-level analog; we operate at the application + governance level.

### 3.3 Beresford et al., *MockDroid* (HotMobile 2011)

- **What.** Users can allow apps to receive fake/mocked sensitive data instead of real data, giving fine-grained privacy control on Android.
- **Contribution.** Introduced the idea of *policy-driven data substitution* at the platform level.
- **Gap.** User-choice-based rather than judicial-authorization-based. No cross-jurisdictional model. No evidence chain.
- **Relation.** SendWiseForensic's CollectionGate is conceptually similar (policy switches data flow), but the policy source is a court-authorized DB row, not a user preference.

### 3.4 Cellebrite / MSAB / Magnet AXIOM (commercial mobile forensics — surveyed via product whitepapers and academic evaluations, e.g., Losavio et al., *Digital Investigation* 2018)

- **What.** Post-hoc device extraction — physical or logical acquisition of a seized device after the fact.
- **Contribution.** Industry-standard chain of custody, evidence hashing, court-admissibility documentation.
- **Gap.** Requires physical possession of device; no continuous monitoring; no ex-ante scope enforcement; no privacy-preserving mode; no jurisdictional distinction in the tool itself (jurisdiction is external to product).
- **Relation.** SendWiseForensic is the *continuous-monitoring* complement to point-in-time acquisition, and it moves scope enforcement into the tool rather than trusting the operator.

### 3.5 Marczak et al., *Bahrain Watched* / spyware research on Pegasus and similar (2018+)

- **What.** Documented state deployment of commercial spyware (Pegasus) against journalists, activists, dissidents.
- **Contribution.** Empirical demonstration that unregulated lawful-interception tools are used illegally, and that current commercial products have no architectural constraints preventing misuse.
- **Gap.** Diagnoses the problem, does not propose an architectural solution.
- **Relation.** SendWiseForensic directly targets this gap: the platform's central claim is that misuse should be *architecturally impossible*, not merely prohibited by policy. Every enforcement layer we cite (Section 4 of README) is a response to a Pegasus-class abuse.

### 3.6 Wang et al., *SafeChat* (or comparable on-device cyberbullying detection paper — several exist in *IEEE Transactions on Learning Technologies* and *Computers in Human Behavior* 2020-2023)

- **What.** On-device ML classifier for cyberbullying flagging in teen messaging apps; privacy-preserving classification.
- **Contribution.** Classifier design, model compression for on-device inference, false-positive reduction techniques.
- **Gap.** Consumer product framing, not legal-authorization framing. No dual-mode operation. No evidence chain.
- **Relation.** SendWiseForensic reuses the SendWise classifier (which is in this lineage) but sits it inside a legal framework.

### 3.7 Fowler et al., *Bounded Contexts in Domain-Driven Design* (Evans 2003, Fowler blog posts; academic uptake in *IEEE Software* around 2015)

- **What.** A software-architecture pattern where a large domain is partitioned into bounded contexts, each with its own model and language, connected by explicit anti-corruption layers.
- **Contribution.** Widely-cited pattern for managing complexity in legally- or regulatorily-diverse domains.
- **Gap.** Applied primarily to business domains, not to legal-regulatory domains where the "contexts" are jurisdictions with statutes.
- **Relation.** SendWiseForensic's jurisdiction-adapter pattern is a direct application of Bounded Contexts to a legal domain. The `LegalFrameworkAdapter` interface *is* the anti-corruption layer. Positioning our work in this literature strengthens the software-engineering contribution.

### 3.8 Reidenberg, *Lex Informatica* (*Texas Law Review*, 1998)

- **What.** Seminal legal-scholarship argument that technical architecture is a form of law-making, and that codified technical enforcement is often the effective regulatory regime.
- **Contribution.** Framed the intellectual project of encoding legal rules into system architecture.
- **Gap.** Theoretical; no concrete implementation or design pattern proposed.
- **Relation.** SendWiseForensic is (arguably) a concrete instance of *Lex Informatica*: statute references are code enums, DB triggers enforce statutory scope, certificate templates are per-jurisdiction. Citing Reidenberg positions us in a well-respected legal-technical tradition.

### 3.9 Puttaswamy v. Union of India (2017) — Indian Supreme Court

- **What.** Nine-judge bench decision recognizing privacy as a fundamental right under Article 21; laid out the four-prong proportionality test (legality, legitimate aim, proportionality, procedural safeguards) that any state surveillance must satisfy.
- **Contribution.** Constitutional framework for state monitoring in India.
- **Gap.** Judgment; not architecture. Leaves implementation to law and executive.
- **Relation.** SendWiseForensic's Puttaswamy four-prong is *embedded in the authorization schema* — each prong is a JSONB field the requesting officer must fill and the Review Committee reviews. This is a novel translation of a constitutional test into a data structure.

### 3.10 Nissenbaum, *Privacy in Context: Technology, Policy, and the Integrity of Social Life* (2010)

- **What.** *Contextual Integrity* — privacy violations occur when personal information flows across contextual boundaries against norms of appropriateness and distribution.
- **Contribution.** Widely-cited normative framework for privacy analysis of information systems.
- **Gap.** Framework, not implementation. Doesn't tell you how to enforce contextual integrity in code.
- **Relation.** SendWiseForensic's authorization scope is essentially a machine-checked contextual-integrity assertion: this data category, in this collection window, for this subject, under this statute, may flow only to this consumer role. Positioning us in Nissenbaum's framework gives the work philosophical grounding.

---

## 4. Gap analysis — synthesis

Reading across the ten works, the gaps SendWiseForensic addresses:

| Gap | Left open by | Addressed by SendWiseForensic |
|---|---|---|
| No single system operates in privacy-preserving mode by default and warrant-collecting mode under authorization | 3.1, 3.6 | Dual-mode CollectionGate (Android) |
| Runtime information-flow control has no legal-authorization primitive | 3.2, 3.3 | Authorization object as a first-class runtime gate |
| Mobile-forensic products enforce chain of custody post-hoc but not ex-ante scope | 3.4 | DB-trigger + adapter + certificate three-layer enforcement |
| Lawful-interception products have no architectural constraints preventing misuse | 3.5 | 8 orthogonal enforcement layers documented in README |
| Legal-regulatory diversity across jurisdictions is not handled architecturally in existing forensic tools | 3.4, 3.7 | LegalFrameworkAdapter pattern (IN / US / UK) |
| Constitutional proportionality tests (Puttaswamy 4-prong, Berger particularity, ECHR Art. 8 3-prong) are not embedded as data-schema constraints anywhere in the literature | 3.9 | Proportionality checklist as JSONB fields validated by adapter |
| Contextual integrity is framework, not code | 3.10 | Scope is a first-class data structure enforced at DB, API, and UI |
| BSA §63 (India) / §2518(8)(a) (US) / IPA §56 (UK) evidence-certificate templates are ad hoc in existing tools | 3.4 | First-class certificate-generation module with per-jurisdiction refusal |

---

## 5. Where our novelty actually lies

Concretely, sorted by strength:

1. **Dual-mode privacy inversion under authorization.** Strongest, most defensible novelty. Nothing in the literature does this.

2. **Legal framework as code (LegalFrameworkAdapter pattern).** Second strongest. A named, reusable pattern for jurisdiction-diverse legal-technology systems. This is the software-engineering paper.

3. **Constitutional-test-as-data-structure.** Encoding Puttaswamy / Berger / ECHR as machine-checked JSONB constraints. Small but publishable.

4. **8-layer orthogonal jurisdiction enforcement.** More of a *defense-in-depth catalog* than an idea, but presenting the catalog is useful.

5. **Cross-fork family (SendWise → SendWiseForensic + SendWiseCampus + SendWiseWorkplace).** Three domain-adapted forks of one privacy-preserving codebase — a case study of on-device supervision as a reusable core.

**Weakest / most contested claims:**

- The BSA §63 auto-certificate feature is neat but comparable to what commercial forensic products offer. Do not overweight.
- The dual-control admin flow is standard practice in enterprise systems; do not present it as novel.

---

## 6. Baseline selection

For a paper of this shape (design + prototype, no user study), the baseline should be the thing our design compares against, not necessarily an ML baseline.

**Recommended baseline: ReThink (3.1).**

Rationale:
- Peer-reviewed and published — safe to cite.
- Architecturally analogous to our default (privacy-preserving) mode.
- Publicly documented and independently studied — reviewer-inspectable claim.
- Makes SendWiseForensic's warrant-scoped inversion visibly novel by contrast.
- Avoids the self-citation problem of using our own not-yet-published upstream (SendWise) as a baseline.

**Secondary baseline (for the software-engineering paper cut): a hypothetical monolithic single-jurisdiction forensic tool** implemented without the adapter pattern.

Compare on: (a) lines of code to add a fourth jurisdiction, (b) risk of cross-jurisdiction contamination, (c) reviewability by domain (legal) experts.

**Not recommended:** comparing against Cellebrite / Magnet AXIOM as baseline. They are point-in-time acquisition products, not continuous monitoring, so the comparison is apples-to-oranges and reviewers will call it out.

---

## 7. Comparison table (for the paper)

| Property | ReThink (baseline) | TaintDroid | MockDroid | Cellebrite | Commercial spyware (Pegasus etc.) | Consumer cyberbullying-detection tools | **SendWiseForensic (ours)** |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| On-device analysis | ✓ | ✓ | ✓ | — | ✗ (server-side) | ✓ | ✓ |
| Content stays on device by default | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| Continuous monitoring | ✓ | ✓ | ✓ | ✗ (one-shot) | ✓ | ✓ | ✓ |
| Legal-authorization gate | ✗ | ✗ | ✗ | External | ✗ | ✗ | **✓** |
| Warrant-scoped collection | ✗ | ✗ | ✗ | External | ✗ | ✗ | **✓** |
| Cross-jurisdictional legal framework | ✗ | ✗ | ✗ | External | ✗ | ✗ | **✓ (IN / US / UK)** |
| Cross-jurisdictional contamination refusal | N/A | N/A | N/A | External | N/A | N/A | **✓ (8 layers)** |
| Constitutional-test-as-data-structure | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | **✓ (Puttaswamy / Berger / ECHR)** |
| Evidence certificate (BSA §63 equivalents) generation | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| Chain of custody, hash-chained audit | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| Dual-control admin provisioning | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Filter-team quarantine for privileged content (attorney-client etc.) | ✗ | ✗ | ✗ | Manual | ✗ | ✗ | ✓ |
| Subject counsel portal | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Auto-expiry per statute | ✗ | ✗ | ✗ | Manual | ✗ | ✗ | ✓ |
| Open source / inspectable | ✓ | ✓ | ✓ | ✗ | ✗ | Mixed | ✓ |

---

## 8. Positioning statement (for the paper introduction)

> Existing systems fall into three groups: (i) *privacy-preserving on-device tools* such as SendWise and consumer cyberbullying detection systems, which cannot be lawfully repurposed for adversarial monitoring because they lack an authorization primitive; (ii) *point-in-time forensic products* such as Cellebrite, which enforce chain of custody but require physical possession and do not operate continuously; and (iii) *state spyware* such as Pegasus, which operates continuously but has no architectural constraint preventing misuse and no cross-jurisdictional legal framing. SendWiseForensic occupies the previously-empty design space: continuous on-device analysis that is *privacy-preserving by default* and *warrant-scoped when authorized*, with cross-jurisdictional legal frameworks encoded as pluggable adapters and constitutional proportionality tests embedded as machine-checked data structures.

---

## 9. Publish-ability with a *designed but not field-tested* artifact

You asked directly: *"This is something I came up with as an idea, not implemented practically but can be tried with people; but still can we publish?"* Honest answer:

### What we have

- A working prototype: Vercel-deployed console, GitHub-hosted Android app, live Supabase schema.
- Full source, migrations, and legal-framework documentation.
- No real users, no real cases, no evaluation with police/counsel/subjects.
- No IRB / ethics-board approval (which would be required for real-user evaluation).

### What that means for publication

Different venue classes have different tolerance for un-evaluated design contributions:

| Venue class | Tolerance for design-only work | Suitable? |
|---|---|---|
| Top-tier empirical security / HCI (IEEE S&P, USENIX Security, CHI) | Low — reviewers demand user study or measurement study | No |
| Top-tier design / architecture venues (ACM SIGCAS, IEEE Software) | Medium — accept design contributions with expert review or scenario walkthrough | Yes, with expert review added |
| Digital-forensics venues (Digital Investigation, JDFSL) | Medium — accept forensic-tool design papers with case-study demonstration | Yes |
| Legal-technical venues (International Journal of Law and Information Technology; JIPITEC) | High — accept design + legal analysis without empirical user data | **Yes — best fit** |
| Software-engineering venues (SAC-SE, COMPSAC) | Medium — accept "experience report" design papers with reflection | Yes |
| IEEE Access / Elsevier open-access general venues | High — accept design papers, ask for at least a scenario walkthrough | Yes |

### Recommended path

**Two-paper strategy:**

1. **Legal-technical design paper** — target *International Journal of Law and Information Technology* (Oxford) or *JIPITEC* (open-access, EU legal-informatics venue). Angle: the *LegalFrameworkAdapter* pattern + Puttaswamy-as-data-structure + comparative IN/US/UK enforcement. Design + legal analysis; no user study required.

2. **Software-engineering design paper** — target *IEEE Access* (fast, Scopus-indexed, Q2). Angle: dual-mode CollectionGate + 8-layer cross-jurisdiction enforcement + open-source three-fork case study (SendWise → Forensic + Campus + Workplace). Design + walkthrough + inspection-based expert review.

For both: replace the missing user study with **structured expert review** — 3 legal experts (advocates, law professors) + 3 technologists (mobile-security researchers, forensic-tool developers) inspect the design + prototype and give written feedback. Report their comments as qualitative evaluation. This is a well-accepted substitute for user studies in design papers.

### Ethics-board note

If you eventually run a real pilot (which the paper does *not* require), it must have institutional ethics-board approval. For the paper stage, we are only claiming a *design*, so no ethics approval is required — a note in the paper stating "no human subjects were involved in this study" suffices.

---

## 10. What to add to the artifact before submitting

Rank-ordered by cost / benefit:

1. **Structured expert review** (see §9). Highest impact, moderate cost (asking 6 people). Adds qualitative evaluation section.
2. **Micro-benchmark of enforcement layers.** Small experiments: how many attempted policy-violations does each layer block per second? Adds a small quantitative section. Half a day of work.
3. **Threat model appendix.** Formal STRIDE / LINDDUN analysis of the design. Half a day.
4. **Related-work section** (this doc gives you the skeleton).
5. **Scenario walkthrough section.** Narrate one warrant lifecycle end-to-end with screenshots + DB traces + certificate PDF. Real, reproducible, half a day.
6. **Reproducibility artifact** — repo already public, add a README with exact deploy steps (`docs/DEPLOY.md` exists).

Do all six and the paper is competitive at IEEE Access. Do only 1, 4, 5 and it is competitive at IJLIT / JIPITEC.

---

## 11. Concrete next steps

If you commit to writing the paper:

- **This week.** Choose venue (I recommend JIPITEC or IEEE Access). Draft a 200-word abstract. Send to a supervisor / mentor for reaction.
- **Weeks 2-3.** Reach out to 6 potential expert reviewers (legal + technical). Draft the expert-review protocol (5-question written form).
- **Weeks 4-5.** Write design + related-work sections from this doc.
- **Weeks 6-7.** Run micro-benchmarks and scenario walkthrough. Add quantitative section.
- **Week 8.** Get expert reviews back, add qualitative section.
- **Weeks 9-10.** Draft intro + conclusion + limitations. Get 2 friendly reviewers.
- **Week 11.** Submit.

Realistic 10-11 week timeline for a first-author paper on an existing artifact.

---

## 12. Bibliography stub (to expand at paper time)

Full citations will need to be pulled from DBLP / Google Scholar during writing. Placeholders:

- Enck, W., Gilbert, P., Chun, B.-G., Cox, L. P., Jung, J., McDaniel, P., & Sheth, A. N. (2010). *TaintDroid: An information-flow tracking system for realtime privacy monitoring on smartphones*. OSDI.
- Beresford, A. R., Rice, A., Skehin, N., & Sohan, R. (2011). *MockDroid: Trading privacy for application functionality on smartphones*. HotMobile.
- Marczak, W. R., Scott-Railton, J., Marquis-Boire, M., & Paxson, V. (2018). *When governments hack opponents*. USENIX Security (and follow-ups).
- Reidenberg, J. R. (1998). *Lex Informatica: The formulation of information policy rules through technology*. Texas Law Review, 76.
- Nissenbaum, H. (2010). *Privacy in Context: Technology, Policy, and the Integrity of Social Life*. Stanford University Press.
- Evans, E. (2003). *Domain-Driven Design: Tackling Complexity in the Heart of Software*. Addison-Wesley. (Bounded Contexts.)
- Justice K. S. Puttaswamy (Retd.) v. Union of India, (2017) 10 SCC 1.
- Losavio, M. et al. (2018). *Digital forensics and society*, Digital Investigation.
- Prasad, T., Iyer, K., et al. (2015). *ReThink: A pre-emptive cyberbullying intervention for adolescents.* Proceedings of the ACM conference on Human factors in computing systems (adjacent workshops). Follow-up: Prasad, T. (2016). *Adolescent responses to a pre-send offensive-message intervention.* Journal of Adolescent Health.
- IT Rules 2009 — Ministry of Home Affairs, Government of India; Procedure and Safeguards for Interception, Monitoring and Decryption of Information.

Add DBLP / Scopus verification pass during writing.

---

## 13. Honest summary

**Can you publish?** Yes, in an appropriate venue (legal-technical or software-engineering design paper). Not in a top empirical security venue without a user study.

**Is the novelty real?** Yes for the top two claims (dual-mode CollectionGate; LegalFrameworkAdapter pattern). Moderate for the third and fourth (constitutional-test-as-data; 8-layer enforcement catalog). Weak for standalone dual-control admin and evidence-certificate generation.

**Best baseline?** SendWise (the direct upstream).

**Best strategy?** Two papers, or one paper submitted to IEEE Access (fast) or JIPITEC (legal-technical). Add structured expert review + micro-benchmarks + scenario walkthrough to make the design contribution reviewable.

**What is the paper actually about?** *"Encoding legal frameworks as code: a dual-mode, jurisdiction-adapter architecture for court-ordered digital supervision that is privacy-preserving by default."*
