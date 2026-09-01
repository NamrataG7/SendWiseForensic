import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/officer/accept-invite
 *
 * Called after the officer clicks the magic-link and sets their password.
 * Looks up the officer_invitation row by the auth user's email, creates
 * matching officer + officer_role rows, marks the invitation used.
 */
export async function POST() {
  const supabase = createClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { data: invite, error: findErr } = await supabase
    .from('officer_invitation')
    .select('id, email, full_name, designation, role_name, home_jurisdiction, expires_at, used_at')
    .eq('email', user.email.toLowerCase())
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (findErr || !invite) {
    return Response.json({ error: 'no_pending_invite' }, { status: 404 });
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return Response.json({ error: 'invite_expired' }, { status: 410 });
  }

  // Upsert the officer row with the auth user's UUID
  const { error: officerErr } = await supabase.from('officer').upsert({
    id: user.id,
    full_name: invite.full_name,
    email: invite.email,
    designation: invite.designation,
    home_jurisdiction: invite.home_jurisdiction,
    status: 'ACTIVE',
  });
  if (officerErr) {
    return Response.json({ error: 'officer_upsert_failed', detail: officerErr.message }, { status: 500 });
  }

  const { error: roleErr } = await supabase.from('officer_role').upsert({
    officer_id: user.id,
    role_name: invite.role_name,
  });
  if (roleErr) {
    return Response.json({ error: 'role_upsert_failed', detail: roleErr.message }, { status: 500 });
  }

  const { error: markErr } = await supabase
    .from('officer_invitation')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id);
  if (markErr) {
    return Response.json({ error: 'invite_mark_failed', detail: markErr.message }, { status: 500 });
  }

  // TODO(AUDIT-ATOMICITY): wrap officer + role + invite update + audit in a single plpgsql function.
  await supabase.rpc('p_append_audit', {
    p_actor_id: user.id,
    p_actor_role: invite.role_name,
    p_action: 'OFFICER_ONBOARDED',
    p_target_type: 'officer_invitation',
    p_target_id: invite.id,
    p_context: { email: invite.email, home_jurisdiction: invite.home_jurisdiction },
  });

  return Response.json({ ok: true }, { status: 200 });
}
