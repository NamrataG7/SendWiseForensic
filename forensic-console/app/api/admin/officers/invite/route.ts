import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InviteSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  fullName: z.string().min(1),
  designation: z.string().nullable().optional(),
  role: z.enum([
    'INVESTIGATING_OFFICER',
    'SUPERVISING_OFFICER',
    'COMPETENT_AUTHORITY',
    'REVIEW_COMMITTEE',
    'FILTER_TEAM',
    'PROSECUTOR',
    'DEFENSE_COUNSEL',
    'JUDICIAL_AUDITOR',
    'DPO',
  ]),
});

/**
 * Admin creates an invitation. Jurisdiction is server-derived from the admin's
 * own home_jurisdiction — not client-picked. Row is inserted with
 * status='PENDING_COAPPROVAL' and NO email is sent yet. A second admin in the
 * same jurisdiction must approve via /api/admin/officers/coapprove to trigger
 * the magic-link email.
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'schema', issues: parsed.error.issues }, { status: 400 });
  }
  const { email, fullName, designation, role } = parsed.data;
  const jurisdiction = me.home_jurisdiction as 'IN' | 'US' | 'UK';

  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return Response.json(
      { error: 'server_misconfigured', detail: 'SUPABASE_SECRET_KEY or NEXT_PUBLIC_SUPABASE_URL missing' },
      { status: 500 },
    );
  }
  const admin = createAdminClient(url, serviceKey);

  const inviteToken = crypto.randomUUID();

  const { error: insertErr } = await admin.from('officer_invitation').insert({
    email,
    full_name: fullName,
    designation: designation ?? null,
    role_name: role,
    home_jurisdiction: jurisdiction,
    invited_by: me.id,
    invite_token: inviteToken,
    status: 'PENDING_COAPPROVAL',
  });
  if (insertErr) {
    return Response.json(
      { error: 'insert_failed', detail: insertErr.message, code: (insertErr as any).code },
      { status: 500 },
    );
  }

  try {
    await admin.rpc('p_append_audit', {
      p_actor_id: me.id,
      p_actor_role: 'ADMIN',
      p_action: 'OFFICER_INVITE_REQUESTED',
      p_target_type: 'officer_invitation',
      p_target_id: inviteToken,
      p_context: { email, role, jurisdiction, status: 'PENDING_COAPPROVAL' },
    });
  } catch {
    /* best-effort audit */
  }

  return Response.json({ ok: true, email, status: 'PENDING_COAPPROVAL' }, { status: 201 });
}
