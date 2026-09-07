# L9 — Externally-Anchored Audit Chain

> Adds a ninth defense layer to the paper's cross-jurisdictional enforcement catalog. Closes the strongest weakness in the existing threat model: a rogue admin or compromised `service_role` credential that could silently rewrite past audit entries.

## Threat closed

Before L9:
- Adversary G (compromised Supabase / infrastructure) or Adversary C (rogue admin with service_role secret) can bypass the hash-chain integrity of `audit_log` by truncating rows and recomputing hashes from a chosen point onward. The chain still validates internally but is silently rewritten.
- Detection: gaps in monotonic ids, but only if we know the previous tip.

After L9:
- Every hour, `create_audit_anchor()` publishes the current audit chain-tip hash to `audit_anchor` table.
- `scripts/anchor-audit-root.ts` POSTs each new anchor's `chain_root_hex` to OpenTimestamps, receiving a Bitcoin-anchored `.ots` receipt (or an equivalent govt-notified registry receipt when available).
- Once the anchor's Bitcoin block is confirmed (~10 min to 1 hour later), the chain-root is **public and immutable**.
- Any subsequent rewrite of `audit_log` past the anchor point is publicly detectable by calling `verify_audit_anchor(anchor_id)`.

## Precedent in the literature

This is not novel technique. It is the standard forensic-integrity approach documented since Haber & Stornetta (*Journal of Cryptology*, 1991) and now available as a public service via OpenTimestamps (Todd, 2016). The novelty in our paper is applying it to a lawful-supervision audit chain and integrating it with the eight existing enforcement layers.

## Files added

- `supabase/migrations/20260904000000_external_anchor_layer_l9.sql` — table, hourly function, verification helper, pg_cron schedule
- `scripts/anchor-audit-root.ts` — publishes unsent anchors to OpenTimestamps

## Scheduling

Two supported patterns:

### Option A — Vercel Cron (recommended for prototype)

In `forensic-console/vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/anchor-audit-root", "schedule": "0 * * * *" }
  ]
}
```

Add `forensic-console/app/api/cron/anchor-audit-root/route.ts` that runs the same logic as `scripts/anchor-audit-root.ts` but as a Vercel serverless function. Deferred to a follow-up PR; the current PR provides the migration + the standalone script for a systemd/GitHub Actions caller.

### Option B — GitHub Actions

`.github/workflows/anchor-audit-root.yml`:

```yaml
name: Anchor audit root hourly
on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:
jobs:
  anchor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install pg tsx
      - run: npx tsx scripts/anchor-audit-root.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Paper section this feeds into

Section 4 (System and Design), extend the cross-jurisdictional enforcement catalog from 8 layers to 9. Also referenced in Section 5 (Evaluation) and the threat model table (`docs/paper/THREAT_MODEL.md`) — the "Documented gap" row for compromised infrastructure is now covered.

Updated novelty statement snippet:

> The design's defense-in-depth catalog spans nine layers, of which Layer 9 (externally-anchored audit commitments via OpenTimestamps) is a standard forensic-integrity technique (Haber & Stornetta, 1991; Todd, 2016) that we apply for the first time to a lawful-supervision audit chain.

## Verification demonstration

For the paper's evaluation section, the demo is:

1. Insert some `audit_log` entries.
2. Call `create_audit_anchor()`; note anchor id and its `chain_root_hex`.
3. Run `anchor-audit-root.ts`; note the `.ots` receipt.
4. Call `verify_audit_anchor(anchor_id)` → returns `true`.
5. As a simulated adversary, `DELETE FROM audit_log WHERE id = last_id;` (illegal — we grant temporary superuser to demonstrate).
6. Call `verify_audit_anchor(anchor_id)` → returns `false` and raises `tamper detected`.
7. Independently confirm via the OpenTimestamps receipt at https://opentimestamps.org that the pre-tamper root existed before the tamper time.

Screenshot the terminal output of steps 4 → 5 → 6 → 7 for the paper. This is a compelling demonstration.

## Limits

1. Bitcoin confirmation takes ~10 min to ~1 hour. Fresh anchors are not yet immutable during that window. This is inherent to any Bitcoin-timestamping approach and documented in the OpenTimestamps whitepaper.
2. If the machine running `anchor-audit-root.ts` is itself compromised, it can suppress anchor submissions. Mitigation: rotate the caller (Vercel Cron + GitHub Actions redundancy) and monitor `submitted_at` gap alarms.
3. OpenTimestamps free tier is best-effort. For a real deployment, run a private calendar server per Todd 2016 §4.
