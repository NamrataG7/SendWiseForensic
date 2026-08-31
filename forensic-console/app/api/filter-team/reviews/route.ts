import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import {
  appendAudit,
  applyFilterTeamDecisionToEvidence,
  insertFilterTeamReview,
} from '@/lib/db';
import {
  jsonError,
  jsonOk,
  requestIp,
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
 * TODO(AUDIT-ATOMICITY): three writes (review insert, evidence update,
 * audit append) happen across separate round-trips. On any downstream
 * failure we run a best-effort compensating rollback of the earlier
 * writes and return 502. Proper fix: wrap all three inside a single
 * plpgsql function so they share a Postgres transaction.
 *
 * TODO(FILTER-TEAM-INDEPENDENCE): single-role stub; production requires
 * organizational separation.
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

  const insertResult = await insertFilterTeamReview(supabase, {
    evidenceId: parsed.data.evidenceId,
    reviewerId: caller.officerId,
    decision: parsed.data.decision,
    reason: parsed.data.reason,
  });
  if (!insertResult.ok) {
    return jsonError(500, `review insert failed: ${insertResult.error}`);
  }

  const updateResult = await applyFilterTeamDecisionToEvidence(supabase, {
    evidenceId: parsed.data.evidenceId,
    decision: parsed.data.decision,
    reason: parsed.data.reason,
  });
  if (!updateResult.ok) {
    // TODO(AUDIT-ATOMICITY): compensating delete of the review row.
    await supabase
      .from('filter_team_review')
      .delete()
      .eq('id', insertResult.id);
    return jsonError(500, `evidence update failed: ${updateResult.error}`);
  }

  const filterAudit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: 'FILTER_TEAM',
    action: 'FILTER_REVIEW',
    targetType: 'evidence',
    targetId: parsed.data.evidenceId,
    context: {
      reviewId: insertResult.id,
      decision: parsed.data.decision,
      reason: parsed.data.reason,
    },
    ip: requestIp(req),
  });
  if (!filterAudit.ok) {
    // TODO(AUDIT-ATOMICITY): revert quarantine_status back to PENDING_FILTER
    // and delete the review row.
    await supabase
      .from('evidence')
      .update({ quarantine_status: 'PENDING_FILTER' })
      .eq('id', parsed.data.evidenceId);
    await supabase
      .from('filter_team_review')
      .delete()
      .eq('id', insertResult.id);
    return jsonError(
      502,
      `filter review reverted; audit append failed: ${filterAudit.error}`,
    );
  }

  // Best-effort follow-up audit for the derived evidence-level action.
  const followUp =
    parsed.data.decision === 'SUPPRESS'
      ? 'EVIDENCE_SUPPRESS'
      : 'EVIDENCE_RELEASE';
  await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: 'FILTER_TEAM',
    action: followUp,
    targetType: 'evidence',
    targetId: parsed.data.evidenceId,
    context: { reviewId: insertResult.id },
    ip: requestIp(req),
  });

  return jsonOk(
    {
      reviewId: insertResult.id,
      decision: parsed.data.decision,
      filterAuditId: filterAudit.id,
    },
    201,
  );
}
