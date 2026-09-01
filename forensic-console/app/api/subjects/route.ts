import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { appendAudit, getCaseById } from '@/lib/db';
import {
  jsonError,
  jsonOk,
  refuseIfOnlyFilterTeam,
  requestIp,
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

  const { data: inserted, error: insertErr } = await supabase
    .from('subject')
    .insert({
      // TODO(WIRE-TO-SCHEMA): once the jurisdiction column on subject is
      // present, set it explicitly here. For now inherit via read-time
      // mapping in lib/db.ts.
      jurisdiction: c.jurisdiction,
      pseudonymous_label: parsed.data.pseudonymousLabel,
      identity_refs: parsed.data.identityRefs,
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return jsonError(500, `insert failed: ${insertErr?.message ?? 'unknown'}`);
  }

  const audit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: caller.roles.includes('SUPERVISING_OFFICER')
      ? 'SUPERVISING_OFFICER'
      : 'INVESTIGATING_OFFICER',
    action: 'AUTH_ISSUE', // reused audit_action for subject enrolment
    targetType: 'subject',
    targetId: (inserted as { id: string }).id,
    context: {
      caseId: parsed.data.caseId,
      jurisdiction: c.jurisdiction,
      pseudonymousLabel: parsed.data.pseudonymousLabel,
      // Never log the identifier — even the hash is not carried into audit
      // context; only its presence.
      identityRefKeys: Object.keys(parsed.data.identityRefs),
    },
    ip: requestIp(req),
  });
  if (!audit.ok) {
    // TODO(AUDIT-ATOMICITY): compensating delete.
    await supabase
      .from('subject')
      .delete()
      .eq('id', (inserted as { id: string }).id);
    return jsonError(
      502,
      `subject reverted; audit append failed: ${audit.error}`,
    );
  }

  return jsonOk(
    { id: (inserted as { id: string }).id, jurisdiction: c.jurisdiction },
    201,
  );
}
