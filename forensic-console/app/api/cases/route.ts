import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { listCasesForCurrentOfficer } from '@/lib/db';
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

/**
 * GET /api/cases
 * Lists cases the current officer is a live assignee on. RLS at the
 * authorization/session/evidence tables further scopes downstream reads.
 * Each row includes `jurisdiction` so the UI can pill it.
 */
export async function GET() {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  const cases = await listCasesForCurrentOfficer(supabase);
  return jsonOk({ cases });
}

const CreateCaseSchema = z
  .object({
    jurisdiction: z.enum(['IN', 'US', 'UK']),
    externalCaseRef: z.string().min(1),
    offences: z.array(z.string().min(1)).default([]),
  })
  .strict();

/**
 * POST /api/cases
 *
 * The ONLY route in the console where a jurisdiction is chosen. The DB
 * trigger case_jurisdiction_immutable enforces immutability from this
 * point on. The "case" insert + AUTH_ISSUE audit append are delegated to
 * the atomic p_case_create() RPC (migration
 * 20260908000004_audit_atomicity_batch2.sql) so both commit or roll back
 * together, in one transaction.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  // Fix: this route previously had NO role check at all -- any
  // authenticated officer of any role (FILTER_TEAM, DEFENSE_COUNSEL, DPO...)
  // could open a case. Found during an emergency RLS audit alongside the
  // missing ENABLE ROW LEVEL SECURITY on "case" itself (see
  // 20260908000002_emergency_rls_enablement.sql). Matches the role gate
  // already used by subjects/route.ts.
  const notFilterOnly = refuseIfOnlyFilterTeam(caller);
  if (!notFilterOnly.ok) {
    return jsonError(notFilterOnly.status, notFilterOnly.error);
  }
  if (!requireRoleAny(caller, ['INVESTIGATING_OFFICER', 'SUPERVISING_OFFICER'])) {
    return jsonError(
      403,
      'Only INVESTIGATING_OFFICER or SUPERVISING_OFFICER may open a case',
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }

  const parsed = CreateCaseSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, 'Invalid input', {
      violations: parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }
  const input = parsed.data;

  // Defense in depth: the form ALSO sends jurisdiction as a hidden input
  // in future revisions. If the wire body claims a different jurisdiction
  // than the field we validate here, refuse — no covert re-classification.
  if (
    typeof (body as { jurisdiction?: unknown }).jurisdiction === 'string' &&
    (body as { jurisdiction: string }).jurisdiction !== input.jurisdiction
  ) {
    return jsonError(409, 'jurisdiction mismatch between form and payload');
  }

  const { data: result, error: rpcErr } = await supabase.rpc('p_case_create', {
    p_jurisdiction: input.jurisdiction,
    p_external_case_ref: input.externalCaseRef,
    p_offences: input.offences,
    p_caller_officer_id: caller.officerId,
  });
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }
  const data = result as { id: string; auditId: number };

  return jsonOk({ id: data.id }, 201);
}
