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
  homeJurisdiction: z.enum(['IN', 'US', 'UK']),
});

export async function POST(req: Request) {
  const supabase = createClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: me } = await supabase
    .from('officer')
    .select('id')
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
  const { email, fullName, designation, role, homeJurisdiction } = parsed.data;

  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return Response.json(
      { error: 'server_misconfigured', detail: 'SUPABASE_SECRET_KEY or NEXT_PUBLIC_SUPABASE_URL missing' },
      { status: 500 },
    );
  }
  const admin = createAdminClient(url, serviceKey);

  const redirectTo = new URL('/auth/callback?next=/accept-invite', req.url).toString();
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      full_name: fullName,
      role_name: role,
      home_jurisdiction: homeJurisdiction,
    },
  });
  if (inviteErr) {
    return Response.json({ error: 'invite_failed', detail: inviteErr.message }, { status: 500 });
  }

  const inviteToken = invited?.user?.id ?? crypto.randomUUID();

  // Use service-role client for the officer_invitation insert to bypass
  // RLS reliably. This is safe because we have just verified the caller
  // is ADMIN above.
  const { error: insertErr } = await admin.from('officer_invitation').insert({
    email,
    full_name: fullName,
    designation: designation ?? null,
    role_name: role,
    home_jurisdiction: homeJurisdiction,
    invited_by: me.id,
    invite_token: inviteToken,
  });
  if (insertErr) {
    return Response.json(
      { error: 'insert_failed', detail: insertErr.message, code: (insertErr as any).code },
      { status: 500 },
    );
  }

  // TODO(AUDIT-ATOMICITY): wrap invite + audit + officer_invitation write in a single plpgsql function.
  try {
    await admin.rpc('p_append_audit', {
      p_actor_id: me.id,
      p_actor_role: 'ADMIN',
      p_action: 'OFFICER_INVITE',
      p_target_type: 'officer_invitation',
      p_target_id: inviteToken,
      p_context: { email, role, home_jurisdiction: homeJurisdiction },
    });
  } catch {
    // audit is best-effort in prototype
  }

  return Response.json({ ok: true, email }, { status: 201 });
}
