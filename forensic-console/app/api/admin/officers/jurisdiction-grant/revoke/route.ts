import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { jsonError, jsonOk, mapRpcErrorStatus } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RevokeSchema = z
  .object({
    officerId: z.string().min(1),
    jurisdiction: z.enum(['IN', 'US', 'UK']),
  })
  .strict();

/**
 * POST /api/admin/officers/jurisdiction-grant/revoke
 *
 * Revokes an active officer_jurisdiction_grant (P1.3). Same admin
 * jurisdiction-scoping as the grant route.
 */
export async function POST(req: Request) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthenticated');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }
  const parsed = RevokeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, 'Invalid input', {
      violations: parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_admin_revoke_jurisdiction',
    {
      p_officer_id: parsed.data.officerId,
      p_jurisdiction: parsed.data.jurisdiction,
    },
  );
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }

  return jsonOk(result);
}
