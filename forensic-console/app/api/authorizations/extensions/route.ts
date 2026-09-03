import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  parentAuthorizationId: z.string().uuid(),
  requestedNewExpiresOn: z.string(),
  justification: z.string().min(1),
  proportionalityRefresh: z.record(z.string()).default({}),
  statuteReference: z.string().min(1),
});

export async function POST(req: Request) {
  const supabase = createClient(cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: me } = await supabase.from('officer').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!me?.id) return Response.json({ error: 'forbidden' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'schema', issues: parsed.error.issues }, { status: 400 });

  const { error } = await supabase.from('authorization_extension').insert({
    parent_authorization_id: parsed.data.parentAuthorizationId,
    requested_by: me.id,
    requested_new_expires_on: parsed.data.requestedNewExpiresOn,
    justification: parsed.data.justification,
    proportionality_refresh: parsed.data.proportionalityRefresh,
    statute_reference: parsed.data.statuteReference,
  });
  if (error) return Response.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  return Response.json({ ok: true }, { status: 201 });
}
