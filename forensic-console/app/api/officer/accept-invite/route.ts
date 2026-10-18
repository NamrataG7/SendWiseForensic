import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { mapRpcErrorStatus } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/officer/accept-invite
 *
 * Called after the officer clicks the magic-link and sets their password.
 * The officer upsert, officer_role assignment, officer_invitation
 * used_at update, and OFFICER_ONBOARDED audit append are delegated to the
 * atomic p_officer_accept_invite() RPC (migration
 * 20260908000004_audit_atomicity_batch2.sql, plus the enum-add-only
 * 20260908000003_officer_onboarded_audit_enum.sql) so all four writes
 * commit or roll back together, in one transaction. That RPC uses the
 * authenticated session's own auth.uid()/auth.email() internally -- not
 * an officer-role check, since the officer row may not exist yet.
 */
export async function POST() {
  const supabase = createClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_officer_accept_invite',
  );
  if (rpcErr) {
    // p_officer_accept_invite raises NOT_FOUND:no_pending_invite and
    // CONFLICT:invite_expired (collapsed from the route's prior 410;
    // see the migration's comment on that judgment call), plus an
    // unprefixed role_lookup_failed message that falls through to 500,
    // matching the route's prior status codes as closely as the shared
    // mapRpcErrorStatus convention allows.
    return Response.json(
      { error: rpcErr.message },
      { status: mapRpcErrorStatus(rpcErr.message) },
    );
  }

  const data = result as { ok: boolean; officerId: string; auditId: number };
  return Response.json({ ok: data.ok }, { status: 200 });
}
