import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/officers/delete
 * Body (form): officer_id
 * Deletes officer_role rows + officer row + linked auth.users row.
 * Admin can only delete officers in their own jurisdiction and not themselves.
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
  const officerId = formData?.get('officer_id')?.toString();
  if (!officerId) return Response.json({ error: 'invalid_input' }, { status: 400 });
  if (officerId === me.id) return Response.json({ error: 'cannot_delete_self' }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) return Response.json({ error: 'server_misconfigured' }, { status: 500 });
  const admin = createAdminClient(url, serviceKey);

  const { data: target } = await admin
    .from('officer')
    .select('id, auth_user_id, home_jurisdiction, email')
    .eq('id', officerId)
    .maybeSingle();
  if (!target) return Response.json({ error: 'not_found' }, { status: 404 });
  if (target.home_jurisdiction !== me.home_jurisdiction) {
    return Response.json({ error: 'jurisdiction_mismatch' }, { status: 403 });
  }
  // Refuse deleting the last remaining ADMIN in this jurisdiction.
  const { data: targetRoles } = await admin
    .from('officer_role')
    .select('role:role_id ( name )')
    .eq('officer_id', officerId)
    .is('revoked_at', null);
  const targetIsAdmin = (targetRoles ?? []).some((r: any) => r.role?.name === 'ADMIN');
  if (targetIsAdmin) {
    const { data: otherAdmins } = await admin
      .from('officer_with_role')
      .select('id, roles, home_jurisdiction')
      .eq('home_jurisdiction', me.home_jurisdiction);
    const remaining = (otherAdmins ?? []).filter(
      (o: any) => (o.roles as string[]).includes('ADMIN') && o.id !== officerId,
    );
    if (remaining.length === 0) {
      return Response.json({ error: 'last_admin_refused', detail: 'cannot delete the last ADMIN in this jurisdiction' }, { status: 409 });
    }
  }

  await admin.from('officer_role').delete().eq('officer_id', officerId);
  const { error: delErr } = await admin.from('officer').delete().eq('id', officerId);
  if (delErr) return Response.json({ error: 'officer_delete_failed', detail: delErr.message }, { status: 500 });

  if (target.auth_user_id) {
    await admin.auth.admin.deleteUser(target.auth_user_id).catch(() => {});
  }

  try {
    await admin.rpc('p_append_audit', {
      p_actor_id: me.id,
      p_actor_role: 'ADMIN',
      p_action: 'OFFICER_DELETED',
      p_target_type: 'officer',
      p_target_id: officerId,
      p_context: { email: target.email },
    });
  } catch { /* best-effort */ }

  return Response.redirect(new URL('/admin', req.url), 303);
}
