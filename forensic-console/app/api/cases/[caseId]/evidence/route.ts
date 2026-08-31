import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { listEvidenceMetadataForCase } from '@/lib/db';
import {
  jsonError,
  jsonOk,
  refuseIfOnlyFilterTeam,
  requireRoleAny,
  resolveCaller,
} from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/cases/[caseId]/evidence
 *
 * Metadata-only evidence read for investigators. RLS on the evidence
 * table restricts to case-scoped rows under ACTIVE authorizations and
 * excludes PENDING_FILTER and SUPPRESSED (see ENTITY_MODEL.md §3.4).
 * We reassert the quarantine filter in the query for defence-in-depth.
 */
export async function GET(
  _req: Request,
  { params }: { params: { caseId: string } },
) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

  const notFilterOnly = refuseIfOnlyFilterTeam(caller);
  if (!notFilterOnly.ok) {
    return jsonError(notFilterOnly.status, notFilterOnly.error);
  }

  if (
    !requireRoleAny(caller, [
      'INVESTIGATING_OFFICER',
      'SUPERVISING_OFFICER',
      'PROSECUTOR',
      'JUDICIAL_AUDITOR',
      'DPO',
    ])
  ) {
    return jsonError(403, 'Role not permitted to read evidence metadata');
  }

  const evidence = await listEvidenceMetadataForCase(supabase, params.caseId);
  return jsonOk({ evidence });
}
