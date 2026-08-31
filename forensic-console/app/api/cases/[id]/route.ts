import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import {
  getCaseById,
  listAuditTail,
  listAuthorizationsForCase,
  listSubjectsForCase,
} from '@/lib/db';
import { jsonError, jsonOk, resolveCaller } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cases/[id]
 * Returns case + linked authorizations + subjects + a short audit tail
 * scoped to this case's authorizations.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  const [c, authorizations, subjects] = await Promise.all([
    getCaseById(supabase, params.id),
    listAuthorizationsForCase(supabase, params.id),
    listSubjectsForCase(supabase, params.id),
  ]);
  if (!c) return jsonError(404, 'case not found');

  // Audit tail: authorization events for authorizations under this case.
  const authIds = authorizations.map((a) => a.id);
  const auditTail =
    authIds.length > 0
      ? (
          await Promise.all(
            authIds.map((id) =>
              listAuditTail(supabase, {
                targetType: 'authorization',
                targetId: id,
                limit: 20,
              }),
            ),
          )
        )
          .flat()
          .sort((a, b) => a.id - b.id)
      : [];

  return jsonOk({
    case: c,
    authorizations,
    subjects,
    auditTail,
  });
}
