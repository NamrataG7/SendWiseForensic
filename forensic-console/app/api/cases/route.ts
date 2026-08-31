import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { listCasesForCurrentOfficer } from '@/lib/db';
import { jsonError, jsonOk, resolveCaller } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cases
 * Lists cases the current officer is a live assignee on. RLS at the
 * authorization/session/evidence tables further scopes downstream reads.
 */
export async function GET() {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  const cases = await listCasesForCurrentOfficer(supabase);
  return jsonOk({ cases });
}
