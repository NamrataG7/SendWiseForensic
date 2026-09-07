#!/usr/bin/env tsx
/**
 * scripts/benchmark-enforcement-layers.ts
 *
 * Synthetic-attack benchmark for the 6 mechanical cross-jurisdictional
 * enforcement layers documented in docs/paper/MICRO_BENCHMARK.md.
 *
 * Prints a markdown table ready to paste into the paper.
 *
 * Preconditions:
 *   - Local Postgres 16 with all SendWiseForensic migrations applied.
 *   - DATABASE_URL env var (defaults to postgres://postgres:bench@localhost:5432/postgres).
 *
 * Run:
 *   npx tsx scripts/benchmark-enforcement-layers.ts
 */

import { Client } from 'pg';
import { performance } from 'node:perf_hooks';

const DB_URL =
  process.env.DATABASE_URL ??
  'postgres://postgres:bench@localhost:5432/postgres';

interface LayerResult {
  layer: string;
  attacks: number;
  blocks: number;
  benignControls: number;
  falsePositives: number;
  medianLatencyMs: number;
}

const results: LayerResult[] = [];

async function median(numbers: number[]): Promise<number> {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

async function seedFixtures(client: Client) {
  // Create a single fixture case per jurisdiction and reset each run.
  await client.query(`
    DO $$ BEGIN
      DELETE FROM "authorization" WHERE case_id IN
        (SELECT id FROM "case" WHERE external_case_ref LIKE 'BENCH-%');
      DELETE FROM "case" WHERE external_case_ref LIKE 'BENCH-%';
    END $$;
  `);
  const jurisdictions = ['IN', 'US', 'UK'];
  for (const j of jurisdictions) {
    await client.query(
      `INSERT INTO "case" (external_case_ref, jurisdiction, offences)
       VALUES ($1, $2, ARRAY['bench']::text[])`,
      [`BENCH-${j}`, j],
    );
  }
}

async function getCaseId(client: Client, j: string): Promise<string> {
  const r = await client.query(
    `SELECT id FROM "case" WHERE external_case_ref = $1`,
    [`BENCH-${j}`],
  );
  return r.rows[0].id;
}

// L1 — Case.jurisdiction immutability trigger
async function benchL1(client: Client): Promise<LayerResult> {
  const caseId = await getCaseId(client, 'IN');
  const latencies: number[] = [];
  let blocks = 0;
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    try {
      await client.query(
        `UPDATE "case" SET jurisdiction = 'US' WHERE id = $1`,
        [caseId],
      );
    } catch {
      blocks++;
    }
    latencies.push(performance.now() - t0);
  }
  return {
    layer: 'L1 case.jurisdiction immutability',
    attacks: 100,
    blocks,
    benignControls: 0,
    falsePositives: 0,
    medianLatencyMs: Number((await median(latencies)).toFixed(2)),
  };
}

// L2 — Authorization matches Case jurisdiction
async function benchL2(client: Client): Promise<LayerResult> {
  const inCaseId = await getCaseId(client, 'IN');
  const latencies: number[] = [];
  let blocks = 0;
  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    try {
      await client.query(
        `INSERT INTO "authorization"
         (case_id, type, legitimate_aim, issuing_authority_id, issued_on, expires_on,
          scope, proportionality_checklist, statute_references, jurisdiction, status)
         VALUES ($1, 'JUDICIAL_WARRANT', 'PUBLIC_ORDER',
                 gen_random_uuid(), now(), now() + interval '30 days',
                 '{"dataCategories":["KEYSTROKE_BATCH"]}'::jsonb,
                 '{"legality":"x","legitimateAim":"x","proportionality":"x","proceduralSafeguards":"x"}'::jsonb,
                 ARRAY['US_18USC_2518']::text[],  -- WRONG jurisdiction
                 'US',
                 'DRAFT')`,
        [inCaseId],
      );
    } catch {
      blocks++;
    }
    latencies.push(performance.now() - t0);
  }
  return {
    layer: 'L2 authorization matches case jurisdiction',
    attacks: 100,
    blocks,
    benignControls: 0,
    falsePositives: 0,
    medianLatencyMs: Number((await median(latencies)).toFixed(2)),
  };
}

// L3 — Statute prefix matches jurisdiction
async function benchL3(client: Client): Promise<LayerResult> {
  const inCaseId = await getCaseId(client, 'IN');
  const latencies: number[] = [];
  let blocks = 0;
  let falsePositives = 0;

  // 40 benign inserts with pure IN_* prefixes
  for (let i = 0; i < 40; i++) {
    const t0 = performance.now();
    try {
      await client.query(
        `INSERT INTO "authorization"
         (case_id, type, legitimate_aim, issuing_authority_id, issued_on, expires_on,
          scope, proportionality_checklist, statute_references, jurisdiction, status)
         VALUES ($1, 'JUDICIAL_WARRANT', 'PUBLIC_ORDER',
                 gen_random_uuid(), now(), now() + interval '30 days',
                 '{"dataCategories":["KEYSTROKE_BATCH"]}'::jsonb,
                 '{"legality":"x","legitimateAim":"x","proportionality":"x","proceduralSafeguards":"x"}'::jsonb,
                 ARRAY['IN_IT_ACT_S69', 'IN_IT_RULES_2009_R3']::text[],
                 'IN',
                 'DRAFT')`,
        [inCaseId],
      );
    } catch {
      falsePositives++;
    }
    latencies.push(performance.now() - t0);
  }

  // 30 attacks with mixed IN_+US_ prefixes
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    try {
      await client.query(
        `INSERT INTO "authorization"
         (case_id, type, legitimate_aim, issuing_authority_id, issued_on, expires_on,
          scope, proportionality_checklist, statute_references, jurisdiction, status)
         VALUES ($1, 'JUDICIAL_WARRANT', 'PUBLIC_ORDER',
                 gen_random_uuid(), now(), now() + interval '30 days',
                 '{"dataCategories":["KEYSTROKE_BATCH"]}'::jsonb,
                 '{"legality":"x","legitimateAim":"x","proportionality":"x","proceduralSafeguards":"x"}'::jsonb,
                 ARRAY['IN_IT_ACT_S69', 'US_18USC_2518']::text[],
                 'IN',
                 'DRAFT')`,
        [inCaseId],
      );
    } catch {
      blocks++;
    }
    latencies.push(performance.now() - t0);
  }

  // 30 attacks with pure US_* prefixes
  for (let i = 0; i < 30; i++) {
    const t0 = performance.now();
    try {
      await client.query(
        `INSERT INTO "authorization"
         (case_id, type, legitimate_aim, issuing_authority_id, issued_on, expires_on,
          scope, proportionality_checklist, statute_references, jurisdiction, status)
         VALUES ($1, 'JUDICIAL_WARRANT', 'PUBLIC_ORDER',
                 gen_random_uuid(), now(), now() + interval '30 days',
                 '{"dataCategories":["KEYSTROKE_BATCH"]}'::jsonb,
                 '{"legality":"x","legitimateAim":"x","proportionality":"x","proceduralSafeguards":"x"}'::jsonb,
                 ARRAY['US_18USC_2518', 'US_TITLE_III_1968']::text[],
                 'IN',
                 'DRAFT')`,
        [inCaseId],
      );
    } catch {
      blocks++;
    }
    latencies.push(performance.now() - t0);
  }

  return {
    layer: 'L3 statute prefix matches jurisdiction',
    attacks: 60,
    blocks,
    benignControls: 40,
    falsePositives,
    medianLatencyMs: Number((await median(latencies)).toFixed(2)),
  };
}

// L4 and L5 — Adapter-level. Import from packages/legal-framework.
// These are in-process TS calls; wall-clock latency is dominated by import
// startup rather than the check itself. We report them separately.
async function benchL4L5(): Promise<LayerResult[]> {
  const { indiaLegalFramework, usLegalFramework } = await import(
    '../packages/legal-framework/src/index.js'
  );

  // L4 — validateAuthorization refuses cross-prefix
  let l4Blocks = 0;
  let l4FP = 0;
  const l4Lat: number[] = [];
  for (let i = 0; i < 50; i++) {
    const bad = {
      jurisdiction: 'IN',
      statuteReferences: ['IN_IT_ACT_S69', 'US_18USC_2518'],
      // ... omitted fields the validator does not deeply inspect for prefix check
    };
    const t0 = performance.now();
    const res = (indiaLegalFramework as any).validateAuthorization(bad);
    if (res && res.ok === false) l4Blocks++;
    l4Lat.push(performance.now() - t0);
  }
  for (let i = 0; i < 50; i++) {
    const good = {
      jurisdiction: 'IN',
      statuteReferences: ['IN_IT_ACT_S69', 'IN_IT_RULES_2009_R3'],
    };
    const t0 = performance.now();
    const res = (indiaLegalFramework as any).validateAuthorization(good);
    if (res && res.ok === false) l4FP++;
    l4Lat.push(performance.now() - t0);
  }

  // L5 — generateEvidenceCertificate refuses cross-prefix
  let l5Blocks = 0;
  let l5FP = 0;
  const l5Lat: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    try {
      (usLegalFramework as any).generateEvidenceCertificate({
        statuteReferences: ['IT_ACT_S69', 'BSA_2023_S63'],
        deviceOperationalStatement: 'stub',
      });
    } catch {
      l5Blocks++;
    }
    l5Lat.push(performance.now() - t0);
  }
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    try {
      (usLegalFramework as any).generateEvidenceCertificate({
        statuteReferences: ['US_TITLE_III_1968', 'US_18USC_2518'],
        deviceOperationalStatement: 'stub',
      });
    } catch {
      l5FP++;
    }
    l5Lat.push(performance.now() - t0);
  }

  return [
    {
      layer: 'L4 adapter validate cross-prefix refusal',
      attacks: 50,
      blocks: l4Blocks,
      benignControls: 50,
      falsePositives: l4FP,
      medianLatencyMs: Number((await median(l4Lat)).toFixed(3)),
    },
    {
      layer: 'L5 adapter certificate cross-prefix refusal',
      attacks: 50,
      blocks: l5Blocks,
      benignControls: 50,
      falsePositives: l5FP,
      medianLatencyMs: Number((await median(l5Lat)).toFixed(3)),
    },
  ];
}

// L6 — RLS home-jurisdiction scoping.
// Requires setting session role + jwt claims; on a plain psql client this is
// approximated by setting request.jwt.claims. Real evaluation should use the
// Supabase JS client with an anon key; the harness below is an approximation.
async function benchL6(client: Client): Promise<LayerResult> {
  // Skipped in the plain-Postgres harness because RLS with Supabase JWT claims
  // requires a full Supabase auth context.
  return {
    layer: 'L6 RLS home-jurisdiction scoping (skipped in local harness)',
    attacks: 0,
    blocks: 0,
    benignControls: 0,
    falsePositives: 0,
    medianLatencyMs: 0,
  };
}

function printMarkdownTable(rs: LayerResult[]) {
  console.log(
    '| Layer | Attacks | Blocks | TNR | Benign controls | False positives | FPR | Median latency (ms) |',
  );
  console.log(
    '|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|',
  );
  for (const r of rs) {
    const tnr =
      r.attacks === 0 ? 'n/a' : `${((r.blocks / r.attacks) * 100).toFixed(1)}%`;
    const fpr =
      r.benignControls === 0
        ? 'n/a'
        : `${((r.falsePositives / r.benignControls) * 100).toFixed(1)}%`;
    console.log(
      `| ${r.layer} | ${r.attacks} | ${r.blocks} | ${tnr} | ${r.benignControls} | ${r.falsePositives} | ${fpr} | ${r.medianLatencyMs} |`,
    );
  }
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('# Micro-benchmark of SendWiseForensic enforcement layers');
  console.log('');
  console.log(`Database: \`${DB_URL}\``);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');

  await seedFixtures(client);
  results.push(await benchL1(client));
  results.push(await benchL2(client));
  results.push(await benchL3(client));
  const l45 = await benchL4L5();
  results.push(...l45);
  results.push(await benchL6(client));

  console.log('## Results');
  console.log('');
  printMarkdownTable(results);
  console.log('');
  console.log(`Completed: ${new Date().toISOString()}`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
