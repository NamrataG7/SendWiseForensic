import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { getCaseById } from '@/lib/db';
import {
  jsonError,
  jsonOk,
  mapRpcErrorStatus,
  refuseIfOnlyFilterTeam,
  requireRoleAny,
  resolveCaller,
} from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSubjectInputSchema = z
  .object({
    caseId: z.string().uuid(),
    jurisdiction: z.enum(['IN', 'US', 'UK']),
    pseudonymousLabel: z.string().min(3),
    identityRefs: z.record(z.unknown()),
  })
  .strict();

/**
 * POST /api/subjects
 *
 * Creates a subject scoped to a case. The subject inherits the case's
 * jurisdiction — if the client-declared jurisdiction disagrees with the
 * case's, we return 409. This closes a footgun where an officer might
 * paste a US identifier under an IN case.
 *
 * The subject insert + AUTH_ISSUE audit append are delegated to the
 * atomic p_subject_create() RPC (migration
 * 20260908000004_audit_atomicity_batch2.sql) so both commit or roll back
 * together, in one transaction.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);
  const notFilterOnly = refuseIfOnlyFilterTeam(caller);
  if (!notFilterOnly.ok) return jsonError(notFilterOnly.status, notFilterOnly.error);
  if (!requireRoleAny(caller, ['INVESTIGATING_OFFICER', 'SUPERVISING_OFFICER'])) {
    return jsonError(403, 'INVESTIGATING_OFFICER or SUPERVISING_OFFICER role required');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }
  const parsed = CreateSubjectInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, 'Invalid input', {
      violations: parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }

  // Cross-check: case must exist AND client-claimed jurisdiction must
  // match the case's actual jurisdiction. We do not trust the client.
  const c = await getCaseById(supabase, parsed.data.caseId);
  if (!c) return jsonError(404, 'case not found');
  if (c.jurisdiction !== parsed.data.jurisdiction) {
    return jsonError(
      409,
      `jurisdiction mismatch: client claimed ${parsed.data.jurisdiction} but case ${parsed.data.caseId} is ${c.jurisdiction}`,
    );
  }

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_subject_create',
    {
      p_case_id: parsed.data.caseId,
      p_pseudonymous_label: parsed.data.pseudonymousLabel,
      p_identity_refs: parsed.data.identityRefs,
      p_caller_officer_id: caller.officerId,
      p_caller_role: caller.roles.includes('SUPERVISING_OFFICER')
        ? 'SUPERVISING_OFFICER'
        : 'INVESTIGATING_OFFICER',
    },
  );
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }
  const data = result as { id: string; jurisdiction: string; auditId: number };

  return jsonOk({ id: data.id, jurisdiction: data.jurisdiction }, 201);
}
