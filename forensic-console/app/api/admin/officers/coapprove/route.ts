import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/officers/coapprove
 * Called by the second admin to approve a PENDING_COAPPROVAL invitation.
 * Fires the Supabase magic-link email on success. Cannot approve one's own
 * invitation (DB trigger + code check).
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
  if (!serviceKey || !url) {
    return Response.json({ error: 'server_misconfigured' }, { status: 500 });
  }
  const admin = createAdminClient(url, serviceKey);

  const { data: inv, error: findErr } = await admin
    .from('officer_invitation')
    .select('id, email, full_name, role_name, home_jurisdiction, invited_by, status')
    .eq('id', invitationId)
    .maybeSingle();
  if (findErr || !inv) return Response.json({ error: 'not_found' }, { status: 404 });
  if (inv.status !== 'PENDING_COAPPROVAL') {
    return Response.json({ error: 'not_pending', detail: `status=${inv.status}` }, { status: 409 });
  }
  if (inv.invited_by === me.id) {
    return Response.json({ error: 'self_coapproval_refused' }, { status: 409 });
  }
  if (inv.home_jurisdiction !== me.home_jurisdiction) {
    return Response.json({ error: 'jurisdiction_mismatch' }, { status: 403 });
  }

  // Mark APPROVED first (trigger enforces invited_by != coapproved_by)
  const { error: apprErr } = await admin
    .from('officer_invitation')
    .update({
      status: 'APPROVED',
      coapproved_by: me.id,
      coapproved_at: new Date().toISOString(),
    })
    .eq('id', invitationId);
  if (apprErr) {
    return Response.json({ error: 'approve_failed', detail: apprErr.message }, { status: 500 });
  }

  // Fire the magic-link email
  const redirectTo = new URL('/auth/callback?next=/accept-invite', req.url).toString();
  let sendErr: string | null = null;
  const invited = await admin.auth.admin.inviteUserByEmail(inv.email, {
    redirectTo,
    data: {
      full_name: inv.full_name,
      role_name: inv.role_name,
      home_jurisdiction: inv.home_jurisdiction,
    },
  });
  if (invited.error) {
    const msg = invited.error.message ?? '';
    const isExisting = /already registered|already exists|user_exists|email_exists|user with this email/i.test(msg)
      || (invited.error as any).status === 422;
    if (isExisting) {
      const linkRes = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: inv.email,
        options: { redirectTo },
      });
      if (linkRes.error) sendErr = `${msg}; magic-link also failed: ${linkRes.error.message}`;
    } else {
      sendErr = msg;
    }
  }

  if (sendErr) {
    // Roll back: mark REJECTED so admins can try again later
    await admin.from('officer_invitation').update({
      status: 'PENDING_COAPPROVAL',
      coapproved_by: null,
      coapproved_at: null,
    }).eq('id', invitationId);
    return Response.json({ error: 'send_failed', detail: sendErr }, { status: 500 });
  }

  await admin
    .from('officer_invitation')
    .update({ status: 'SENT' })
    .eq('id', invitationId);

  try {
    await admin.rpc('p_append_audit', {
      p_actor_id: me.id,
      p_actor_role: 'ADMIN',
      p_action: 'OFFICER_INVITE_COAPPROVED',
      p_target_type: 'officer_invitation',
      p_target_id: invitationId,
      p_context: { email: inv.email, role: inv.role_name },
    });
  } catch {
    /* best-effort */
  }

  return Response.redirect(new URL('/admin', req.url), 303);
}
