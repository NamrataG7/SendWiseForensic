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

  // Upsert officer row (bind auth_user_id to this Supabase auth user).
  // Officer table columns per migration 01+09: full_name, email, organization,
  // jurisdiction, home_jurisdiction, active, identity_verified, auth_user_id.
  const { data: existingOfficer } = await supabase
    .from('officer')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  let officerId = existingOfficer?.id as string | undefined;
  if (!officerId) {
    const { data: created, error: insertErr } = await supabase
      .from('officer')
      .insert({
        auth_user_id: user.id,
        full_name: invite.full_name,
        email: invite.email,
        organization: invite.designation ?? null,
        jurisdiction: invite.home_jurisdiction,
        home_jurisdiction: invite.home_jurisdiction,
        active: true,
      })
      .select('id')
      .single();
    if (insertErr) {
      return Response.json({ error: 'officer_insert_failed', detail: insertErr.message }, { status: 500 });
    }
    officerId = created.id;
  }

  // Look up role_id for the invited role_name
  const { data: roleRow, error: roleLookupErr } = await supabase
    .from('role')
    .select('id')
    .eq('name', invite.role_name)
    .single();
  if (roleLookupErr || !roleRow) {
    return Response.json({ error: 'role_lookup_failed', detail: roleLookupErr?.message }, { status: 500 });
  }

  const { error: roleAssignErr } = await supabase.from('officer_role').insert({
    officer_id: officerId,
    role_id: roleRow.id,
  });
  if (roleAssignErr && !/duplicate key/i.test(roleAssignErr.message)) {
    return Response.json({ error: 'role_assign_failed', detail: roleAssignErr.message }, { status: 500 });
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
    p_actor_id: officerId,
    p_actor_role: invite.role_name,
    p_action: 'OFFICER_ONBOARDED',
    p_target_type: 'officer_invitation',
    p_target_id: invite.id,
    p_context: { email: invite.email, home_jurisdiction: invite.home_jurisdiction },
  });

  return Response.json({ ok: true }, { status: 200 });
}
