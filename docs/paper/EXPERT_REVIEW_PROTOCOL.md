# Expert Review Protocol — SendWiseForensic

> Structured expert review substitutes for a user study in a design paper. Six reviewers, five questions each, written responses. This document is the sole artifact you need to run the process. Everything else (recruitment email, review form, analysis rubric) is here.

---

## Why structured expert review

- Design papers cannot cite user studies of court-ordered supervision (no ethics board approves that at prototype stage, and it would take a year).
- Design papers in top-tier design venues (IEEE Software, ACM SIGCAS, JIPITEC, IJLIT) accept **structured expert review** as evaluation.
- The requirement is: ≥ 5 external experts, spanning at least 2 relevant fields, written responses, thematic analysis reported in the paper.
- We aim for **6 reviewers = 3 legal + 3 technical** to satisfy the "at least 2 fields" bar with margin.

## Who to recruit (target list)

Cast a wider net than you need; expect 30% response rate.

### Legal reviewers (recruit 8, expect 3-4 responses)

Categories:
1. **Cyberlaw / IT-Act practicing advocate** — India-based, familiar with §69 and 2009 Rules
2. **Law school academic** — teaches privacy law, cyberlaw, or forensic evidence (BSA §63)
3. **Retired or serving Judicial Officer / Magistrate** — familiar with warrant issuance
4. **Legal-technology researcher** — e.g., NLU faculty, Vidhi Centre for Legal Policy, IFF (Internet Freedom Foundation), SFLC.in
5. **PoSH IC member or workplace-harassment consultant** — for SendWiseWorkplace-adjacent framing (also useful here as domain expert)
6. **Data Protection Officer / DPDPA compliance consultant** — for §17 exemption realism check
7. **Foreign-jurisdiction lawyer** — a US or UK lawyer to comment on the US/UK adapters
8. **Public defender / criminal defense counsel** — from the *subject-rights* side, to comment on the counsel portal

Where to find them: LinkedIn (search "cyberlaw advocate India"), law-school faculty pages, Twitter/X follows of @internetfreedom / @sflcin, Bar Council listings.

### Technical reviewers (recruit 8, expect 3-4 responses)

Categories:
1. **Mobile security researcher** — someone who has published on Android IME or forensic tools
2. **Forensic-tool developer** — someone from Belkasoft, MSAB, or a similar organization
3. **Digital-forensics academic** — publishes in *Digital Investigation* or JDFSL
4. **Enterprise security architect** — someone who has designed lawful-intercept systems for telcos
5. **Privacy-preserving-ML researcher** — someone who works on federated learning / on-device ML
6. **Software-architecture academic** — someone who works on domain-driven design or bounded contexts
7. **Cybersecurity policy researcher** — Centre for Internet and Society (CIS), Data Security Council of India, etc.
8. **Cisco security colleague** — Cisco has enough security/legal expertise; ask via internal network

Cummins College + Cisco + your Pune network should collectively yield 12-16 contactable candidates. Send 16 invitations to guarantee 6 completed reviews.

## Recruitment email template

Subject: `Request: 30-minute structured review of SendWiseForensic — a warrant-first digital supervision prototype`

Body:

> Dear Dr. / Adv. [Name],
>
> I am [Namrata Gaikwad], [affiliation]. I am seeking six external expert reviewers to evaluate the design of **SendWiseForensic**, an open-source prototype that explores whether a privacy-preserving on-device supervision tool can be architecturally repurposed for court-ordered digital supervision under India IT Act §69, US Title III, and UK IPA 2016. The design encodes constitutional proportionality tests (Puttaswamy 4-prong, Berger particularity, ECHR Art. 8 3-prong) as data-schema constraints and refuses cross-jurisdictional contamination at eight architectural layers.
>
> Your expertise in [specific area — customize] would help me evaluate whether the design is sound, whether it holds up against real-world use, and where it fails.
>
> **What is asked of you:**
>
> - 15 minutes to review a 3-page design summary (attached as PDF).
> - 15 minutes to inspect the live prototype at https://sendwiseforensic.vercel.app (guest credentials provided).
> - 10 minutes to answer five open-ended questions (link in email; free-form text; no time pressure).
>
> **Total: 40 minutes, no follow-up commitment.**
>
> Your responses will be quoted (anonymized on request) in a paper submission targeting [venue]. You will receive a copy of the paper and public acknowledgement (or anonymized as you prefer).
>
> Would you be willing to participate? If yes, I will send the design summary and access link. Preferred deadline for responses is [DATE — allow 2 weeks].
>
> Thank you for considering.
>
> Warm regards,
> Namrata Gaikwad
> namratamgaikwad@gmail.com

---

## The five questions (this is the entire form)

Send as a Google Form OR embedded plain text. All questions are open-ended, minimum 100 words expected, maximum unrestricted.

### Question 1 — Design soundness

> After reviewing the SendWiseForensic design, do you consider the *dual-mode* architecture — where the same on-device agent operates either in privacy-preserving mode or warrant-scoped evidence-collection mode, gated by a database-recorded court authorization — to be a sound design for its stated purpose? What, in your assessment, are the strongest and weakest points of this dual-mode approach?

### Question 2 — Legal-framework realism

> The design encodes India IT Act §69 + IT Rules 2009, US Title III + ECPA, and UK Investigatory Powers Act 2016 as pluggable `LegalFrameworkAdapter` implementations, with constitutional proportionality tests embedded as JSONB data structures that must be filled at warrant issuance. Does this level of legal-framework encoding correspond to how these statutes actually operate in practice? Which specific statutory nuance would you say is most inadequately captured?

### Question 3 — Misuse resistance

> The system claims that "illegal surveillance should be architecturally impossible, not merely policy-prohibited." Eight enforcement layers are documented (immutable Case.jurisdiction, DB triggers, adapter validation, adapter certificate refusal, RLS, UI theming, and two more). In your assessment, which of these layers is the strongest defense against misuse, which is the weakest, and what real-world misuse scenario do you believe the design fails to prevent?

### Question 4 — Comparability to existing tools

> Compared to existing tools you know — commercial mobile-forensic products (Cellebrite, Magnet AXIOM), commercial surveillance (Pegasus, similar), or research prototypes — where does SendWiseForensic fit in the design space? What existing tool would you consider its closest analog, and where does the closest analog fall short?

### Question 5 — Barriers to real deployment

> Assume SendWiseForensic is proposed as a pilot deployment to a real law-enforcement organization in your jurisdiction. What are the three most significant barriers (legal, operational, technical, or political) that would prevent adoption, and which of these barriers do you believe is unaddressable by design refinement alone?

---

## Analysis rubric (this is what you code in the paper)

After collecting the 6 responses, do thematic analysis and report in the paper.

### Step 1 — Open coding

- Print all 30 responses (6 reviewers × 5 questions).
- Mark each response with color-coded highlights for recurring themes.
- Expect 8-15 themes.

### Step 2 — Themes to look for (anticipated)

The following themes are likely to emerge; the paper reports whether they did.

**Design soundness themes:**
- (a) Dual-mode is conceptually sound but hard to audit.
- (b) The privacy-preserving default is defensible.
- (c) Concern: what happens when warrant scope is unclear?
- (d) Concern: officer training is the actual bottleneck.

**Legal-framework realism themes:**
- (e) §69 authorization in practice is politicized, not just procedural.
- (f) Proportionality test is easier stated than applied.
- (g) BSA §63 certificate as a data structure may not satisfy every judge.
- (h) The 60/180-day cap is realistic but Review Committee response is variable.

**Misuse resistance themes:**
- (i) The strongest layer is the DB trigger (unbypassable at API level).
- (j) The weakest layer is the officer-level trust model.
- (k) Compromised admin credentials remain a residual risk.
- (l) Insider misuse from within the Filter Team is not covered.

**Comparability themes:**
- (m) Closest analog is Cellebrite for chain of custody + Pegasus for continuous monitoring; no existing tool combines both with warrant scoping.
- (n) Enterprise DLP tools have similar architecture but not judicial framing.

**Deployment barrier themes:**
- (o) Legal barrier: no LEA is going to adopt a foreign-designed tool without domestic vendor.
- (p) Operational: officer usability is uncertain.
- (q) Technical: integration with existing case-management systems is required.
- (r) Political: transparency is exactly what LEAs do not want.

### Step 3 — Reporting in the paper

Present themes with representative quotes (anonymized as `L1..L3` for legal reviewers, `T1..T3` for technical), sorted by prevalence (how many reviewers raised each). Standard qualitative-analysis reporting.

### Step 4 — Counter-narrative

Include at least two reviewer criticisms that undermine the design — do not sanitize. Reviewers respect papers that show honest self-criticism. Under-selling improves reception.

---

## Consent and ethics

Even though this is expert review (not user study), best practice:

- Written consent to be quoted (anonymized on request).
- Explicit statement that no personal-identifying information will be published beyond field of expertise (e.g., "a Delhi-based cyberlaw advocate said…").
- Copy of paper draft sent to reviewers before submission for accuracy check.
- Public acknowledgement (if consented) or anonymized attribution (if not).

No institutional ethics-board approval is required for structured expert review of a prototype design; state this explicitly in the paper: *"Expert review of a design artifact does not involve human subjects research and did not require ethics-board approval; informed consent was obtained from all reviewers."*

---

## Timeline

Realistic 6-8 weeks:

| Week | Action |
|---|---|
| 1 | Compile list of 16 candidate reviewers. Draft & personalize email. |
| 2 | Send all 16 invitations. |
| 3-4 | Follow up with non-responders. |
| 4-6 | Collect responses (2-week deadline). |
| 7 | Thematic analysis (2 evenings of work). |
| 8 | Write expert-review section of paper (1000-1500 words). |

---

## Deliverable for the paper

A section titled *Expert Review* (typically §5 of a design paper), 1000-1500 words, containing:

1. Recruitment and response summary (16 invited, 6 completed; 3 legal / 3 technical; brief description of each without identifying details).
2. Method (5-question protocol, thematic analysis).
3. Themes with representative quotes (3-5 themes per question × 5 questions = 15-25 themes).
4. Counter-narrative (2-3 substantive criticisms not sanitized).
5. Implications for the design (what would we change; what is out of scope for the prototype).

That is publishable evaluation content for a design paper. Enough to pass review at IEEE Access, IJLIT, JIPITEC, or IEEE Software.
