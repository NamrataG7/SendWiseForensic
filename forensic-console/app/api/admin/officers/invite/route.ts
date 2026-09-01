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
  // Verify caller is ADMIN
  const supabase = createClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: roles } = await supabase
    .from('officer_role')
    .select('role_name')
    .eq('officer_id', user.id);
  const isAdmin = (roles ?? []).some((r) => r.role_name === 'ADMIN');
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

  // Need service-role for admin.inviteUserByEmail
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return Response.json(
      { error: 'server_misconfigured', detail: 'SUPABASE_SECRET_KEY or NEXT_PUBLIC_SUPABASE_URL missing' },
      { status: 500 },
    );
  }
  const admin = createAdminClient(url, serviceKey);

  // Invite via Supabase magic-link. redirectTo will land at /accept-invite where
  // the officer sets their password.
  const redirectTo = new URL('/accept-invite', req.url).toString();
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

  // Record the invitation. Use RLS-scoped client (admin identity), not service-role.
  const { error: insertErr } = await supabase.from('officer_invitation').insert({
    email,
    full_name: fullName,
    designation: designation ?? null,
    role_name: role,
    home_jurisdiction: homeJurisdiction,
    invited_by: user.id,
    invite_token: inviteToken,
  });
  if (insertErr) {
    return Response.json({ error: 'insert_failed', detail: insertErr.message }, { status: 500 });
  }

  // Audit-log
  // TODO(AUDIT-ATOMICITY): wrap invite + audit + officer_invitation write in a single plpgsql function.
  await supabase.rpc('p_append_audit', {
    p_actor_id: user.id,
    p_actor_role: 'ADMIN',
    p_action: 'OFFICER_INVITE',
    p_target_type: 'officer_invitation',
    p_target_id: inviteToken,
    p_context: { email, role, home_jurisdiction: homeJurisdiction },
  });

  return Response.json({ ok: true, email }, { status: 201 });
}
