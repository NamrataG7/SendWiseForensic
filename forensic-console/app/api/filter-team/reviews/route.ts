import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import {
  jsonError,
  jsonOk,
  mapRpcErrorStatus,
  requireRoleAny,
  resolveCaller,
} from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ReviewInputSchema = z
  .object({
    evidenceId: z.string().uuid(),
    decision: z.enum(['RELEASE', 'SUPPRESS', 'REDACT_AND_RELEASE']),
    reason: z.string().min(3),
  })
  .strict();

/**
 * POST /api/filter-team/reviews
 *
 * Files a filter_team_review row and transitions the target evidence's
 * quarantine_status accordingly:
 *   RELEASE            -> RELEASED
 *   SUPPRESS           -> SUPPRESSED
 *   REDACT_AND_RELEASE -> RELEASED (with redaction marker; the real
 *                        redaction pipeline is outside the prototype)
 *
 * Audit events: FILTER_REVIEW, plus EVIDENCE_RELEASE or EVIDENCE_SUPPRESS
 * depending on decision.
 *
 * The review insert, evidence quarantine_status transition, and both
 * audit appends are delegated to the atomic p_filter_team_decide() RPC
 * (migration 20260908000004_audit_atomicity_batch2.sql) so all four
 * writes commit or roll back together, in one transaction.
 *
 * TODO(FILTER-TEAM-INDEPENDENCE): organizational separation (judicial
 * officers, not police) remains open -- HR/staffing policy, not code-
 * enforceable. Role mutual-exclusion and case-assignment conflict ARE
 * now DB-enforced inside p_filter_team_decide itself
 * (20260908000008_filter_team_independence_invariants.sql).
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  if (!requireRoleAny(caller, ['FILTER_TEAM'])) {
    return jsonError(403, 'FILTER_TEAM role required');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }
  const parsed = ReviewInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, 'Invalid input', {
      violations: parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }

  const { data: result, error: rpcErr } = await supabase.rpc(
    'p_filter_team_decide',
    {
      p_evidence_id: parsed.data.evidenceId,
      p_reviewer_id: caller.officerId,
      p_decision: parsed.data.decision,
      p_reason: parsed.data.reason,
    },
  );
  if (rpcErr) {
    return jsonError(mapRpcErrorStatus(rpcErr.message), rpcErr.message);
  }
  const data = result as {
    reviewId: string;
    decision: string;
    filterAuditId: number;
    followUpAuditId: number;
  };

  return jsonOk(
    {
      reviewId: data.reviewId,
      decision: parsed.data.decision,
      filterAuditId: data.filterAuditId,
    },
    201,
  );
}
