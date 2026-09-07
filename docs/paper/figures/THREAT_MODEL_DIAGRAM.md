# Threat Model Diagram

Single-page diagrammatic summary of `docs/paper/THREAT_MODEL.md`. Two views: (a) STRIDE per component, (b) adversary-to-defense mapping. Both are Mermaid so they render inline on GitHub and export to SVG via mermaid-cli for the paper.

---

## Diagram 1 — Component-level defense stack

```mermaid
flowchart TB
    subgraph Device[Android SupervisedKeyboardApp]
        IME[SafeKeyboardIME]
        CG[CollectionGate]
        ES[EvidenceSigner<br/>HW Keystore-attempted]
        TAMP[SelfTamperReceiver]
        IME -->|input events| CG
        CG -->|allowed batches| ES
        ES -->|signed evidence| BATCH[Evidence batch]
    end

    subgraph Console[forensic-console API + DB]
        API[Next.js API routes]
        RLS[Postgres RLS]
        DBT[DB Triggers L1-L3]
        ADAPT[Adapter validate L4]
        CERT[Adapter certificate L5]
        AUDIT[Hash-chained audit_log]
        ANCHOR[External anchor L9]
        API --> DBT
        DBT --> ADAPT
        ADAPT --> CERT
        API -->|writes| AUDIT
        AUDIT -->|hourly root| ANCHOR
        API --> RLS
    end

    BATCH -->|POST /api/evidence/ingest| API

    UI[UI: locked jurisdiction<br/>L7 theme + L8 form UX]
    UI --> API

    subgraph Adversaries
        A[External attacker]
        B[Rogue officer]
        C[Rogue admin]
        F[Filter Team insider]
        G[Compromised Supabase]
        H[Evading subject]
        I[Corrupt authority]
        J[Cross-jurisdiction contamination]
    end

    A -.blocked at.-> API
    B -.blocked at.-> RLS
    C -.detected by.-> AUDIT
    C -.detected by.-> ANCHOR
    F -.audited by.-> AUDIT
    G -.detected by.-> ANCHOR
    H -.detected by.-> TAMP
    I -.-> POLICY[Policy only:<br/>Judicial Auditor role]
    J -.blocked at.-> DBT
    J -.blocked at.-> ADAPT
    J -.blocked at.-> CERT
```

---

## Diagram 2 — LINDDUN privacy analysis (subject view)

```mermaid
flowchart LR
    SUBJ((Subject)) --> DEV[On-device agent]
    DEV -->|content in local buffer only<br/>ephemeral| BUFFER[[Buffer]]
    BUFFER -->|nudge/warning| SUBJ
    BUFFER -.if warrant ACTIVE.-> UPLOAD[Signed evidence upload]
    UPLOAD --> CONSOLE[Console]

    subgraph LINDDUN[LINDDUN dimensions]
        L[Linkability - session-per-authorization]
        I[Identifiability - pseudonymous label]
        N[Non-repudiation - INTENTIONAL for forensic]
        D[Detectability - INTENTIONAL: persistent notification + IME pill]
        DI[Disclosure - RLS scope enforcement]
        U[Unawareness - counsel portal shows scope]
        NC[Non-compliance - 8/9-layer refusal]
    end

    CONSOLE --> L
    CONSOLE --> DI
    CONSOLE --> NC
    DEV --> D
    DEV --> N
    SUBJ --> U
```

---

## Diagram 3 — Cross-jurisdictional refusal (Element 6, the money shot)

```mermaid
flowchart TD
    OFFICER[Officer submits<br/>warrant with mixed<br/>statute references] --> API[/api/authorizations POST/]

    API --> L4{Adapter L4:<br/>validateAuthorization}
    L4 -->|contamination| REJECT1[REJECT<br/>with statute list]
    L4 -->|clean| DBW[DB write]

    DBW --> L1{L1: case.jurisdiction<br/>immutable trigger}
    L1 --> L2{L2: auth.jurisdiction<br/>= case.jurisdiction}
    L2 --> L3{L3: statute_references<br/>prefix matches jurisdiction}
    L3 -->|contamination| REJECT2[REJECT<br/>at DB layer]
    L3 -->|clean| INSERTED[(Authorization inserted)]

    INSERTED --> CERT{L5: Adapter certificate<br/>generation refuses<br/>cross-prefix mix}
    CERT -->|contamination| REJECT3[REJECT<br/>at cert layer]
    CERT -->|clean| PDF[BSA §63 / §2518(8)(a) / IPA §56<br/>certificate]

    INSERTED -.-> RLS{L6: RLS scoping<br/>on read time}
    RLS -->|different jurisdiction| SILENT[Silent zero rows]

    style REJECT1 fill:#fee,stroke:#c00
    style REJECT2 fill:#fee,stroke:#c00
    style REJECT3 fill:#fee,stroke:#c00
    style SILENT fill:#fee,stroke:#c00
    style PDF fill:#efe,stroke:#0a0
```

---

## Rendering to SVG for the paper

```bash
npm install -g @mermaid-js/mermaid-cli
mkdir -p docs/paper/figures
mmdc -i docs/paper/figures/THREAT_MODEL_DIAGRAM.md -o docs/paper/figures/threat-model.svg
```

Or copy each ```mermaid block into https://mermaid.live and export.

---

## Caption for the paper

> **Figure X — Cross-jurisdictional contamination refusal at five architectural layers.** An officer submits an authorization whose `statute_references` mix `IN_*` and `US_*` prefixes. The request is refused at (L4) the adapter's `validateAuthorization` before any DB write; if bypassed via service-role, it is refused at (L1–L3) the Postgres triggers on the `case`, `authorization`, and `statute_references` columns; if the record already exists, the certificate generator (L5) refuses to render a §63 / §2518(8)(a) / §56 certificate carrying mixed prefixes; and at read-time, RLS (L6) silently returns zero rows to officers whose `home_jurisdiction` does not match. Layers L7 (per-jurisdiction UI theming) and L8 (case-jurisdiction is set at creation and never at authorization time) prevent honest human error at the officer level. Layer L9 (externally-anchored audit chain) makes any silent tamper by a service-role attacker publicly detectable.
