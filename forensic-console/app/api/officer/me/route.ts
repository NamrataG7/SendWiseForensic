import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { jsonError, jsonOk, resolveCaller } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/officer/me — thin projection used by the login flow to decide
 * whether to route the officer through /onboarding/jurisdiction.
 */
export async function GET() {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);
  return jsonOk({
    officerId: caller.officerId,
    roles: caller.roles,
    homeJurisdiction: caller.homeJurisdiction,
  });
}

const SetHomeJurisdictionSchema = z
  .object({
    homeJurisdiction: z.enum(['IN', 'US', 'UK']),
  })
  .strict();

/**
 * POST /api/officer/me — set the officer's home_jurisdiction. Only
 * allowed if it is currently null (first-time onboarding). Later changes
 * require an administrator to open an officer_jurisdiction_grant row.
 * TODO(SUPPORT-HOME-JURISDICTION-CHANGE-VIA-ADMIN).
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  if (caller.homeJurisdiction) {
    return jsonError(
      409,
      'Home jurisdiction already set. Changes require an administrative grant. ' +
        'TODO(SUPPORT-HOME-JURISDICTION-CHANGE-VIA-ADMIN).',
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }
  const parsed = SetHomeJurisdictionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, 'Invalid input');
  }

  const { error } = await supabase
    .from('officer')
    .update({ home_jurisdiction: parsed.data.homeJurisdiction })
    .eq('id', caller.officerId);
  if (error) return jsonError(500, `update failed: ${error.message}`);

  return jsonOk({ homeJurisdiction: parsed.data.homeJurisdiction });
}
