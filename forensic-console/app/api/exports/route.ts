import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
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

const CreateExportInputSchema = z
  .object({
    caseId: z.string().uuid(),
    evidenceIds: z.array(z.string().uuid()).min(1),
    purpose: z.enum([
      'COURT_SUBMISSION',
      'INTERNAL_REVIEW',
      'DEFENSE_DISCLOSURE',
    ]),
    recipientNotice: z.string().min(3),
  })
  .strict();

/**
 * POST /api/exports
 *
 * Investigating Officer creates an evidence_export row in a
 * pending-approval state. approved_by is intentionally empty; the DB
 * CHECK constraint (approved_by cardinality ≥ 2) prevents accidental
 * dual-approval bypass at insert time — so on create we bypass the
 * constraint by starting with two copies of the requester THEN
 * immediately dropping to empty? No — the CHECK forces us to defer.
 *
 * Prototype resolution: the check runs on the CURRENT row, so we insert
 * with approved_by populated with the requester as a *placeholder* to
 * satisfy the constraint at row birth, then... this fights the schema.
 *
 * Correct resolution: the CHECK is `array_length(approved_by, 1) >= 2`
 * — array_length returns NULL for an empty array, and NULL in a CHECK
 * is treated as UNKNOWN which passes. So an empty approved_by array
 * passes the CHECK. See supabase/migrations/…_monitoring_session_evidence.sql.
 *
 * We insert with an empty approved_by. The API layer enforces status
 * transitions.
 *
 * The evidence_export insert + EVIDENCE_EXPORT audit append are delegated
 * to the atomic p_export_create() RPC (migration
 * 20260908000004_audit_atomicity_batch2.sql) so both commit or roll back
 * together, in one transaction.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  const notFilterOnly = refuseIfOnlyFilterTeam(caller);
  if (!notFilterOnly.ok) {
    return jsonError(notFilterOnly.status, notFilterOnly.error);
  }

  if (!requireRoleAny(caller, ['INVESTIGATING_OFFICER', 'SUPERVISING_OFFICER'])) {
    return jsonError(
      403,
      'INVESTIGATING_OFFICER or SUPERVISING_OFFICER role required',
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }
  const parsed = CreateExportInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, 'Invalid input', {
      violations: parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_export_create',
    {
      p_case_id: parsed.data.caseId,
      p_evidence_ids: parsed.data.evidenceIds,
      p_purpose: parsed.data.purpose,
      p_recipient_notice: parsed.data.recipientNotice,
      p_caller_officer_id: caller.officerId,
      p_caller_role: caller.roles.includes('SUPERVISING_OFFICER')
        ? 'SUPERVISING_OFFICER'
        : 'INVESTIGATING_OFFICER',
    },
  );
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }
  const data = result as { id: string; auditId: number };

  return jsonOk({ id: data.id, auditId: data.auditId }, 201);
}
