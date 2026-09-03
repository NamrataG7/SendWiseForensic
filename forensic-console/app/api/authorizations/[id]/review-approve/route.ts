import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/authorizations/[id]/review-approve
 * Body (form): action=approve|reject, reason?
 * Caller must have REVIEW_COMMITTEE role. Updates the warrant's review_status.
 * See docs/LEGAL_FRAMEWORK_IN.md — IT Rules 2009 R.22 (2-monthly review).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient(cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: me } = await supabase.from('officer').select('id').eq('auth_user_id', user.id).maybeSingle();
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

  if (action === 'approve') {
    await admin.from('authorization').update({
      review_status: 'APPROVED',
      review_approved_by: me.id,
      review_approved_at: new Date().toISOString(),
    }).eq('id', params.id);
  } else if (action === 'reject') {
    await admin.from('authorization').update({
      review_status: 'REJECTED',
      review_approved_by: me.id,
      review_approved_at: new Date().toISOString(),
      review_reject_reason: reason,
      status: 'REVOKED',
    }).eq('id', params.id);
  } else {
    return Response.json({ error: 'invalid_action' }, { status: 400 });
  }
  return Response.redirect(new URL(`/authorizations/${params.id}`, req.url), 303);
}
