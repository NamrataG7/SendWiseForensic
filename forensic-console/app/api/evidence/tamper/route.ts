import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// TODO(TAMPER-EVENT-STORAGE): dedicated device_lifecycle_event table
// per docs/design/DEVICE_FAILURE_MODES.md; currently records to audit_log only.

const TamperSchema = z.object({
  deviceId: z.string(),
  sessionId: z.string().nullable().optional(),
  kind: z.enum([
    'UNINSTALL_ATTEMPT',
    'PACKAGE_CHANGED',
    'RUNTIME_INTEGRITY_FAILED',
    'EMULATOR_DETECTED',
    'ROOT_DETECTED',
  ]),
  occurredAt: z.string(),
  signatureBase64: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = TamperSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'schema', issues: parsed.error.issues }, { status: 400 });
  }
  const evt = parsed.data;

  const supabase = createClient(cookies());

  await supabase.rpc('p_append_audit', {
    p_actor_id: null,
    p_actor_role: 'SYSTEM',
    p_action: 'DEVICE_TAMPER_EVENT',
    p_target_type: 'device',
    p_target_id: evt.deviceId,
    p_context: {
      kind: evt.kind,
      session_id: evt.sessionId ?? null,
      occurred_at: evt.occurredAt,
      notes: evt.notes ?? null,
    },
  });

  return Response.json({ ok: true }, { status: 202 });
}
