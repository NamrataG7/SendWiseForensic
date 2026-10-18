import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { listEvidenceMetadataForSubject } from '@/lib/db';
import { jsonError, requireRoleAny, resolveCaller } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/subjects/[subjectId]/evidence/csv
 *
 * Metadata-only CSV export for the per-subject evidence dashboard.
 *
 * IMPORTANT: this route must NEVER include payload_ref or any raw
 * payload content in its output. It isn't fetched by
 * listEvidenceMetadataForSubject in the first place (that helper's
 * SELECT list intentionally omits payload_ref — see the comment above
 * it in lib/db.ts), but if this route is ever modified, that contract
 * must be preserved: metadata-only, exactly mirroring the existing
 * case-evidence view's (app/api/cases/[caseId]/evidence) own
 * metadata-only contract.
 *
 * Role list matches app/api/cases/[caseId]/evidence/route.ts (the
 * existing case-scoped evidence read) exactly, since this is the same
 * read/reporting access level, just subject-scoped instead of
 * case-scoped.
 *
 * No redundant subject-ownership check is added beyond RLS + role: the
 * RLS-scoped query in listEvidenceMetadataForSubject will simply return
 * fewer/no rows if the caller isn't authorized to see this subject's
 * evidence, consistent with how other routes in this file behave.
 */
export async function GET(
  _req: Request,
  { params }: { params: { subjectId: string } },
) {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  if (!caller.ok) return jsonError(caller.status, caller.error);

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

  const evidence = await listEvidenceMetadataForSubject(supabase, params.subjectId);

  const header = [
    'evidence_id',
    'session_id',
    'category',
    'captured_at',
    'privilege_flag',
    'quarantine_status',
    'synthetic',
    'payload_hash',
  ];

  const lines = [header.map(csvEscape).join(',')];
  for (const e of evidence) {
    lines.push(
      [
        e.id,
        e.sessionId,
        e.category,
        e.capturedAt.toISOString(),
        e.privilegeFlag,
        e.quarantineStatus ?? '',
        String(e.synthetic),
        e.payloadHash,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  const csvBody = lines.join('\r\n') + '\r\n';

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `subject-${params.subjectId}-evidence-${dateStamp}.csv`;

  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      'content-type': 'text/csv',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}

/** Defensive CSV field escaping (commas, quotes, newlines). */
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
