import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { jsonError, jsonOk, mapRpcErrorStatus } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ObjectionInputSchema = z
  .object({
    authorizationId: z.string().min(1),
    grounds: z.string().min(10),
  })
  .strict();

/**
 * POST /api/counsel/objections
 *
 * Files a SubjectObjection from the defense-counsel portal.
 *
 * P1.4 fix: identity now comes ONLY from the authenticated Supabase
 * session (real magic-link login, same session app/counsel/page.tsx
 * already uses to show the portal) -- never from a client-supplied
 * magicLinkToken/filedByCounselOfficerId. See
 * p_counsel_file_objection (20260909000002) for the real identity
 * check (GRANTED, unexpired counsel_access_request row matching this
 * session's own email) and the counsel officer-row upsert.
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, 'unauthenticated');

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_counsel_file_objection',
    {
      p_authorization_id: parsed.data.authorizationId,
      p_grounds: parsed.data.grounds,
    },
  );
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }

  const data = result as { objectionId: string; auditId: number };
  return jsonOk(
    { objectionId: data.objectionId, auditId: data.auditId },
    201,
  );
}
