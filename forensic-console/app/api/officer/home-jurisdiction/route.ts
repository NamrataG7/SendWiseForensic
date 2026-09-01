import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { appendAudit } from '@/lib/db';
import { jsonError, jsonOk, requestIp, resolveCaller } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SetHomeJurisdictionInputSchema = z
  .object({
    officerId: z.string().uuid(),
    jurisdiction: z.enum(['IN', 'US', 'UK']),
  })
  .strict();

/**
 * POST /api/officer/home-jurisdiction
 *
 * One-shot home-jurisdiction picker. Refuses if the officer already has
 * a jurisdiction set (immutable except by admin grant).
 *
 * TODO(SUPPORT-JURISDICTION-CHANGE-VIA-ADMIN-GRANT): admin-grant workflow
 * that lets a supervisor mint an officer_jurisdiction_grant row and
 * unlock a re-set.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Body must be JSON');
  }
  const parsed = SetHomeJurisdictionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(422, 'Invalid input', {
      violations: parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      ),
    });
  }
  if (parsed.data.officerId !== caller.officerId) {
    return jsonError(
      403,
      'Officers may only set their OWN home jurisdiction',
    );
  }
  if (caller.homeJurisdiction) {
    return jsonError(
      409,
      `Home jurisdiction already set to ${caller.homeJurisdiction}; changing it requires an admin grant`,
    );
  }

  const { error: updateErr } = await supabase
    .from('officer')
    .update({ jurisdiction: parsed.data.jurisdiction })
    .eq('id', caller.officerId)
    .is('jurisdiction', null);
  if (updateErr) return jsonError(500, updateErr.message);

  // TODO(AUDIT-ATOMICITY): update + audit are two round-trips. On audit
  // failure we revert the update.
  const audit = await appendAudit(supabase, {
    actorId: caller.officerId,
    actorRole: caller.roles[0] ?? 'INVESTIGATING_OFFICER',
    action: 'ROLE_GRANT', // repurposed audit_action — jurisdiction lock
    targetType: 'officer',
    targetId: caller.officerId,
    context: {
      homeJurisdiction: parsed.data.jurisdiction,
      immutable: true,
    },
    ip: requestIp(req),
  });
  if (!audit.ok) {
    await supabase
      .from('officer')
      .update({ jurisdiction: null })
      .eq('id', caller.officerId);
    return jsonError(
      502,
      `home-jurisdiction reverted; audit append failed: ${audit.error}`,
    );
  }

  return jsonOk({
    officerId: caller.officerId,
    homeJurisdiction: parsed.data.jurisdiction,
    auditId: audit.id,
  });
}
