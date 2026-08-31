import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { listAuditTail } from '@/lib/db';
import { jsonError, jsonOk, requireRole, resolveCaller } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/audit?limit=50&offset=0
 *
 * JUDICIAL_AUDITOR-scoped view of the hash-chained audit log. Rows are
 * returned in insertion order so the UI can walk the prev_hash chain
 * for visualization.
 *
 * DPO also allowed (metadata-level oversight per role matrix).
 */
export async function GET(req: NextRequest) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  if (!requireRole(caller, ['JUDICIAL_AUDITOR', 'DPO'])) {
    return jsonError(
      403,
      'JUDICIAL_AUDITOR or DPO role required to read the audit chain',
    );
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? '50');
  const offset = Number(url.searchParams.get('offset') ?? '0');

  const entries = await listAuditTail(supabase, { limit, offset });
  return jsonOk({ entries, limit, offset });
}
