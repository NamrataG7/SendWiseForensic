import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/authorizations/extensions/[id]/decide
 * Body (form): action=approve|deny, reason?
 * Caller must have REVIEW_COMMITTEE role.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient(cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: me } = await supabase.from('officer').select('id, home_jurisdiction').eq('auth_user_id', user.id).maybeSingle();
  if (!me?.id) return Response.json({ error: 'forbidden' }, { status: 403 });
  const { data: roleRows } = await supabase.from('officer_role').select('role:role_id ( name )').eq('officer_id', me.id).is('revoked_at', null);
  const isReview = (roleRows ?? []).some((r: any) => r.role?.name === 'REVIEW_COMMITTEE');
  if (!isReview) return Response.json({ error: 'forbidden', detail: 'requires REVIEW_COMMITTEE' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const action = form?.get('action')?.toString();
  const reason = form?.get('reason')?.toString() ?? null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return Response.json({ error: 'server_misconfigured' }, { status: 500 });
  const admin = createAdminClient(url, secret);

  const { data: ext } = await admin.from('authorization_extension').select('id, parent_authorization_id, requested_new_expires_on, decision_status').eq('id', params.id).maybeSingle();
  if (!ext) return Response.json({ error: 'not_found' }, { status: 404 });
  if (ext.decision_status !== 'PENDING') return Response.json({ error: 'not_pending' }, { status: 409 });

  if (action === 'approve') {
    await admin.from('authorization_extension').update({
      decision_status: 'APPROVED', decided_by: me.id, decided_at: new Date().toISOString(), decision_reason: reason,
    }).eq('id', ext.id);
    // Extend the parent warrant's expires_on
    await admin.from('authorization').update({ expires_on: ext.requested_new_expires_on }).eq('id', ext.parent_authorization_id);
  } else if (action === 'deny') {
    await admin.from('authorization_extension').update({
      decision_status: 'DENIED', decided_by: me.id, decided_at: new Date().toISOString(), decision_reason: reason,
    }).eq('id', ext.id);
  } else {
    return Response.json({ error: 'invalid_action' }, { status: 400 });
  }
  return Response.redirect(new URL(`/authorizations/${ext.parent_authorization_id}`, req.url), 303);
}
