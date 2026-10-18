import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { jsonError, jsonOk, mapRpcErrorStatus, resolveCaller } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SetHomeJurisdictionInputSchema = z
  .object({
    officerId: z.string().uuid(),
    jurisdiction: z.enum(['IN', 'US', 'UK']),
  })
  .strict();

/**
 * POST /api/officer/home-jurisdiction
 *
 * One-shot home-jurisdiction picker. Refuses if the officer already has
 * a jurisdiction set (immutable except by admin grant).
 *
 * The officer.jurisdiction write + ROLE_GRANT audit append are delegated
 * to the atomic p_officer_set_home_jurisdiction() RPC (migration
 * 20260908000004_audit_atomicity_batch2.sql) so both commit or roll back
 * together, in one transaction.
 *
 * TODO(SUPPORT-JURISDICTION-CHANGE-VIA-ADMIN-GRANT): admin-grant workflow
 * that lets a supervisor mint an officer_jurisdiction_grant row and
 * unlock a re-set.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }
  const parsed = SetHomeJurisdictionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, 'Invalid input', {
      violations: parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }
  if (parsed.data.officerId !== caller.officerId) {
    return jsonError(
      403,
      'Officers may only set their OWN home jurisdiction',
    );
  }
  if (caller.homeJurisdiction) {
    return jsonError(
      409,
      `Home jurisdiction already set to ${caller.homeJurisdiction}; changing it requires an admin grant`,
    );
  }

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_officer_set_home_jurisdiction',
    {
      p_officer_id: parsed.data.officerId,
      p_caller_officer_id: caller.officerId,
      p_jurisdiction: parsed.data.jurisdiction,
      p_caller_role: caller.roles[0] ?? 'INVESTIGATING_OFFICER',
    },
  );
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }
  const data = result as {
    officerId: string;
    homeJurisdiction: string;
    auditId: number;
  };

  return jsonOk({
    officerId: data.officerId,
    homeJurisdiction: data.homeJurisdiction,
    auditId: data.auditId,
  });
}
