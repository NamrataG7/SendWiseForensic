import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { listFilterTeamQueue } from '@/lib/db';
import { jsonError, jsonOk, requireRoleAny, resolveCaller } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/filter-team/queue?limit=100&offset=0
 *
 * Cross-case queue of evidence rows in quarantine_status = 'PENDING_FILTER'.
 * RLS grants this view only to auth_role() = 'FILTER_TEAM'; we double-check
 * at the API layer for defence in depth.
 *
 * TODO(FILTER-TEAM-INDEPENDENCE): production requires the reviewers to be
 * organizationally independent (judicial officers). Prototype enforces
 * role separation only.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  if (!requireRoleAny(caller, ['FILTER_TEAM'])) {
    return jsonError(403, 'FILTER_TEAM role required');
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? '100');
  const offset = Number(url.searchParams.get('offset') ?? '0');

  const queue = await listFilterTeamQueue(supabase, { limit, offset });
  return jsonOk({ queue, limit, offset });
}
