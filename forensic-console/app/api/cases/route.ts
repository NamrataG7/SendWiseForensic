import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { appendAudit, listCasesForCurrentOfficer } from '@/lib/db';
import { jsonError, jsonOk, requestIp, resolveCaller } from '@/lib/api';

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
 * point on. TODO(AUDIT-ATOMICITY): insert + p_append_audit are separate
 * round-trips; see lib/db.ts.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

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

  const { data: inserted, error: insertErr } = await supabase
    .from('case')
    .insert({
      jurisdiction: input.jurisdiction,
      external_case_ref: input.externalCaseRef,
      offences: input.offences,
      status: 'OPEN',
      created_by: caller.officerId,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return jsonError(500, `insert failed: ${insertErr?.message ?? 'unknown'}`);
  }

  const audit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: 'INVESTIGATING_OFFICER',
    action: 'AUTH_ISSUE', // TODO(AUDIT-ACTIONS) add CASE_OPEN as a first-class action
    targetType: 'case',
    targetId: (inserted as { id: string }).id,
    context: {
      jurisdiction: input.jurisdiction,
      externalCaseRef: input.externalCaseRef,
    },
    ip: requestIp(req),
  });

  if (!audit.ok) {
    // TODO(AUDIT-ATOMICITY) — compensating delete because the audit
    // write is not in the same transaction as the case insert.
    await supabase.from('case').delete().eq('id', (inserted as { id: string }).id);
    return jsonError(
      502,
      `case written but audit append failed; compensating rollback applied: ${audit.error}`,
    );
  }

  return jsonOk({ id: (inserted as { id: string }).id }, 201);
}
