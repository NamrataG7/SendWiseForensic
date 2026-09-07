#!/usr/bin/env tsx
/**
 * scripts/anchor-audit-root.ts
 *
 * Reads unsent audit_anchor rows and posts them to an external timestamping
 * authority (default: OpenTimestamps public server via HTTP POST). Marks
 * the row submitted_at on success. A separate reconciliation step (not in
 * this script) polls the .ots receipt for Bitcoin block confirmation and
 * sets confirmed_at.
 *
 * This is Layer L9 of the paper's defense-in-depth catalog: after this
 * script runs, a rogue admin or compromised service_role cannot silently
 * rewrite past audit_log entries because the chain_root_hex has been
 * committed to an external, non-DB source.
 *
 * Run:
 *   npx tsx scripts/anchor-audit-root.ts
 *
 * Schedule via Vercel Cron (vercel.json), GitHub Actions, or systemd.
 * See docs/paper/L9_EXTERNAL_ANCHORING.md for scheduling patterns.
 *
 * Env:
 *   DATABASE_URL              — Postgres connection string
 *   ANCHOR_PROVIDER_URL       — default 'https://alice.btc.calendar.opentimestamps.org'
 *   ANCHOR_PROVIDER_NAME      — default 'OPENTIMESTAMPS'
 *   ANCHOR_MAX_BATCH          — default 10 (max unsent rows to process per run)
 */

import { Client } from 'pg';
import { setTimeout as sleep } from 'node:timers/promises';

const DB_URL = process.env.DATABASE_URL;
const PROVIDER_URL =
  process.env.ANCHOR_PROVIDER_URL ??
  'https://alice.btc.calendar.opentimestamps.org';
const PROVIDER_NAME = process.env.ANCHOR_PROVIDER_NAME ?? 'OPENTIMESTAMPS';
const MAX_BATCH = Number(process.env.ANCHOR_MAX_BATCH ?? '10');

if (!DB_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

async function submitToProvider(chainRootHex: string): Promise<string> {
  // Convert the hex root to raw bytes for POST to the OpenTimestamps calendar.
  const bytes = Buffer.from(chainRootHex, 'hex');

  const res = await fetch(`${PROVIDER_URL}/digest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      accept: 'application/octet-stream',
    },
    body: bytes,
  });

  if (!res.ok) {
    throw new Error(`provider ${PROVIDER_URL} returned ${res.status}`);
  }
  // The response is the calendar's timestamp receipt bytes; store base64.
  const receiptBytes = new Uint8Array(await res.arrayBuffer());
  return Buffer.from(receiptBytes).toString('base64');
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const { rows } = await client.query<{
    id: number;
    chain_root_hex: string;
  }>(
    `SELECT id, chain_root_hex
     FROM audit_anchor
     WHERE submitted_at IS NULL
     ORDER BY id ASC
     LIMIT $1`,
    [MAX_BATCH],
  );

  console.log(`Found ${rows.length} unsent audit anchors.`);

  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    try {
      const receipt = await submitToProvider(row.chain_root_hex);
      await client.query(
        `UPDATE audit_anchor
         SET external_receipt_ref = $1,
             external_provider = $2,
             submitted_at = now()
         WHERE id = $3`,
        [receipt, PROVIDER_NAME, row.id],
      );
      ok++;
      console.log(`  anchor id=${row.id} submitted (${receipt.length} bytes receipt)`);
    } catch (e) {
      fail++;
      console.error(`  anchor id=${row.id} FAILED:`, (e as Error).message);
    }
    // Be polite to the free provider.
    await sleep(500);
  }

  console.log(`Done. ok=${ok} fail=${fail}`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
