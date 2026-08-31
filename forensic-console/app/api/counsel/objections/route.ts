import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { appendAudit } from '@/lib/db';
import { jsonError, jsonOk, requestIp } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ObjectionInputSchema = z
  .object({
    authorizationId: z.string().min(1),
    grounds: z.string().min(10),
    // TODO(COUNSEL-PORTAL): magic-link token. Prototype accepts any
    // non-empty token; real system verifies against a signed short-lived JWT.
    magicLinkToken: z.string().min(1),
    filedByCounselOfficerId: z.string().min(1),
  })
  .strict();

/**
 * POST /api/counsel/objections
 *
 * Files a SubjectObjection from the defense-counsel portal. This is a
 * prototype endpoint: the magic-link token is a placeholder credential.
 *
 * TODO(COUNSEL-PORTAL): validate token against a signed short-lived JWT
 * issued by the counsel-invite flow; look up filedByCounselOfficerId
 * from the token, not the body.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }
  const parsed = ObjectionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, 'Invalid input', {
      violations: parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }

  const supabase = createClient(await cookies());

  // Verify authorization exists (avoid orphan objections). Under
  // DEFENSE_COUNSEL RLS, direct read may be empty, so we probe with
  // maybeSingle and let insert do the FK enforcement.
  const { data: authRow } = await supabase
    .from('authorization')
    .select('id')
    .eq('id', parsed.data.authorizationId)
    .maybeSingle();
  if (!authRow) {
    // Not fatal for insert — FK will reject — but produce a friendlier 404.
    return jsonError(404, 'authorization not found or not visible to counsel');
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('subject_objection')
    .insert({
      authorization_id: parsed.data.authorizationId,
      filed_by_counsel_id: parsed.data.filedByCounselOfficerId,
      grounds: parsed.data.grounds,
      status: 'OPEN',
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return jsonError(500, `insert failed: ${insertErr?.message ?? 'unknown'}`);
  }

  const audit = await appendAudit(supabase, {
    actorId: parsed.data.filedByCounselOfficerId,
    actorRole: 'DEFENSE_COUNSEL',
    action: 'SUBJECT_OBJECTION_FILED',
    targetType: 'authorization',
    targetId: parsed.data.authorizationId,
    context: {
      objectionId: (inserted as { id: string }).id,
      grounds: parsed.data.grounds,
      prototypeToken: true,
    },
    ip: requestIp(req),
  });
  if (!audit.ok) {
    // TODO(AUDIT-ATOMICITY): compensating delete.
    await supabase
      .from('subject_objection')
      .delete()
      .eq('id', (inserted as { id: string }).id);
    return jsonError(
      502,
      `objection reverted; audit append failed: ${audit.error}`,
    );
  }

  return jsonOk(
    { objectionId: (inserted as { id: string }).id, auditId: audit.id },
    201,
  );
}
