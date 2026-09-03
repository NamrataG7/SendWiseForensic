import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  fullName: z.string().min(1),
  barCouncilId: z.string().min(1),
  email: z.string().email().transform((s) => s.toLowerCase()),
  caseRef: z.string().min(1),
  jurisdiction: z.enum(['IN', 'US', 'UK']),
  reason: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'schema', issues: parsed.error.issues }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return Response.json({ error: 'server_misconfigured' }, { status: 500 });
  const admin = createAdminClient(url, secret);

  const { error } = await admin.from('counsel_access_request').insert({
    full_name: parsed.data.fullName,
    bar_council_id: parsed.data.barCouncilId,
    email: parsed.data.email,
    case_ref: parsed.data.caseRef,
    jurisdiction: parsed.data.jurisdiction,
    reason: parsed.data.reason,
  });
  if (error) return Response.json({ error: 'insert_failed', detail: error.message }, { status: 500 });
  return Response.json({ ok: true }, { status: 201 });
}
