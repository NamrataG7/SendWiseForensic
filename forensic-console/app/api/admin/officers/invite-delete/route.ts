import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/officers/invite-delete
 * Body (form): invitation_id
 * Deletes an officer_invitation row. Scoped to admin's jurisdiction.
 */
export async function POST(req: Request) {
  const supabase = createClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: me } = await supabase
    .from('officer')
    .select('id, home_jurisdiction')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!me?.id) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { data: roleRows } = await supabase
    .from('officer_role')
    .select('role:role_id ( name )')
    .eq('officer_id', me.id)
    .is('revoked_at', null);
  const isAdmin = (roleRows ?? []).some((r: any) => r.role?.name === 'ADMIN');
  if (!isAdmin) return Response.json({ error: 'forbidden' }, { status: 403 });

  const formData = await req.formData().catch(() => null);
  const invitationId = formData?.get('invitation_id')?.toString();
  if (!invitationId) return Response.json({ error: 'invalid_input' }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) return Response.json({ error: 'server_misconfigured' }, { status: 500 });
  const admin = createAdminClient(url, serviceKey);

  const { data: inv } = await admin
    .from('officer_invitation')
    .select('id, email, home_jurisdiction')
    .eq('id', invitationId)
    .maybeSingle();
  if (!inv) return Response.json({ error: 'not_found' }, { status: 404 });
  if (inv.home_jurisdiction !== me.home_jurisdiction) {
    return Response.json({ error: 'jurisdiction_mismatch' }, { status: 403 });
  }

  const { error: delErr } = await admin.from('officer_invitation').delete().eq('id', invitationId);
  if (delErr) return Response.json({ error: 'invite_delete_failed', detail: delErr.message }, { status: 500 });

  try {
    await admin.rpc('p_append_audit', {
      p_actor_id: me.id,
      p_actor_role: 'ADMIN',
      p_action: 'OFFICER_INVITE_DELETED',
      p_target_type: 'officer_invitation',
      p_target_id: invitationId,
      p_context: { email: inv.email },
    });
  } catch { /* best-effort */ }

  return Response.redirect(new URL('/admin', req.url), 303);
}
