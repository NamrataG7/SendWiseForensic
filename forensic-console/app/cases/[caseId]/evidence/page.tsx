import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import EmptyRegister from '@/components/EmptyRegister';
import { Pill } from '@/components/Pill';
import { getCaseById, listEvidenceMetadataForCase } from '@/lib/db';
import { BasketBar, BasketCheckbox } from './basket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function privilegeTone(
  flag: string,
): 'muted' | 'warning' | 'primary' | 'success' {
  if (flag === 'NONE') return 'muted';
  if (flag === 'UNKNOWN') return 'warning';
  return 'primary'; // LEGAL / MEDICAL / CLERGY / SPOUSAL
}

function quarantineTone(status: string | null): 'muted' | 'success' {
  if (!status) return 'muted';
  if (status === 'RELEASED') return 'success';
  return 'muted';
}

function hashTail(h: string, n = 12) {
  return h.length <= n ? h : `…${h.slice(-n)}`;
}

export default async function CaseEvidencePage({
  params,
}: {
  params: { caseId: string };
}) {
  const supabase = createClient(await cookies());
  const c = await getCaseById(supabase, params.caseId);
  if (!c) notFound();

  const evidence = await listEvidenceMetadataForCase(supabase, params.caseId);

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 text-xs">
          <Link
            href={`/cases/${c.id}`}
            className="text-muted hover:text-ink"
          >
            ← Back to case overview
          </Link>
        </div>

        <PageHeader
          eyebrow="Case evidence — metadata only"
          title="Evidence on record"
          subtitle={
            <>
              For case {' '}
              <span className="font-mono">{c.externalCaseRef}</span>. Rows
              awaiting Filter Team review (PENDING_FILTER) and suppressed
              rows are excluded from this view per ENTITY_MODEL §3.4.
              Investigators may build an export basket for dual-approval.
            </>
          }
        />

        <BasketBar caseId={c.id} />

        {evidence.length === 0 ? (
          <div className="mt-8">
            <EmptyRegister
              title="No evidence on record"
              body="Evidence appears here after a monitoring session under an active authorization writes its first payload. Investigators see metadata only; raw payloads require a dual-approved BSA §63 export."
            />
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-register text-muted">
                <tr>
                  <th className="w-10 px-4 py-3 font-semibold">Basket</th>
                  <th className="px-4 py-3 font-semibold">Captured at</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Privilege</th>
                  <th className="px-4 py-3 font-semibold">Quarantine</th>
                  <th className="px-4 py-3 font-semibold">Hash (tail)</th>
                  <th className="px-4 py-3 font-semibold">Evidence ID</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <BasketCheckbox id={e.id} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink">
                      {e.capturedAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone="muted">{e.category}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={privilegeTone(e.privilegeFlag)}>
                        {e.privilegeFlag}
                      </Pill>
                    </td>
                    <td className="px-4 py-3">
                      {e.quarantineStatus ? (
                        <Pill tone={quarantineTone(e.quarantineStatus)}>
                          {e.quarantineStatus}
                        </Pill>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink">
                      {hashTail(e.payloadHash)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted">
                      {e.id.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
