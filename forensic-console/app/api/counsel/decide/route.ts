import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const form = await req.formData().catch(() => null);
  const requestId = form?.get('request_id')?.toString();
  const action = form?.get('action')?.toString();
  const rejectReason = form?.get('reject_reason')?.toString() ?? null;
  if (!requestId || !action) return Response.json({ error: 'invalid_input' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return Response.json({ error: 'server_misconfigured' }, { status: 500 });
  const admin = createAdminClient(url, secret);

  const { data: reqRow } = await admin
    .from('counsel_access_request')
    .select('id, email, full_name, case_ref, jurisdiction, status')
    .eq('id', requestId)
    .maybeSingle();
  if (!reqRow) return Response.json({ error: 'not_found' }, { status: 404 });
  if (reqRow.jurisdiction !== me.home_jurisdiction) return Response.json({ error: 'jurisdiction_mismatch' }, { status: 403 });
  if (reqRow.status !== 'PENDING') return Response.json({ error: 'not_pending' }, { status: 409 });

  if (action === 'reject') {
    await admin.from('counsel_access_request').update({
      status: 'REJECTED', approved_by: me.id, approved_at: new Date().toISOString(), reject_reason: rejectReason,
    }).eq('id', requestId);
    return Response.redirect(new URL('/admin/counsel', req.url), 303);
  }

  if (action === 'approve') {
    // Try to link to case_id via case_ref
    const { data: caseRow } = await admin
      .from('case')
      .select('id')
      .eq('external_case_ref', reqRow.case_ref)
      .eq('jurisdiction', me.home_jurisdiction)
      .maybeSingle();

    const grantedUntil = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(); // 30 days
    await admin.from('counsel_access_request').update({
      status: 'APPROVED',
      approved_by: me.id,
      approved_at: new Date().toISOString(),
      case_id: caseRow?.id ?? null,
      granted_until: grantedUntil,
    }).eq('id', requestId);

    // Fire magic-link email
    const redirectTo = new URL('/auth/callback?next=/counsel', req.url).toString();
    const link = await admin.auth.admin.inviteUserByEmail(reqRow.email, { redirectTo });
    if (link.error) {
      // fall back to generateLink (existing user)
      const gl = await admin.auth.admin.generateLink({ type: 'magiclink', email: reqRow.email, options: { redirectTo } });
      if (gl.error) {
        return Response.json({ error: 'send_failed', detail: `${link.error.message}; ${gl.error.message}` }, { status: 500 });
      }
    }
    await admin.from('counsel_access_request').update({
      status: 'GRANTED', magic_link_sent_at: new Date().toISOString(),
    }).eq('id', requestId);

    return Response.redirect(new URL('/admin/counsel', req.url), 303);
  }

  return Response.json({ error: 'invalid_action' }, { status: 400 });
}
