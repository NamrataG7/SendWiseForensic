import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import { DummyVerifiedPill, Pill } from '@/components/Pill';
import StatuteRef from '@/components/StatuteRef';
import { getCaseById, getEvidenceByIds } from '@/lib/db';
import ExportRequestForm from './request-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Export request page. The basket is passed in via ?basket=id1,id2,…
 * (the same URL param the evidence table maintains).
 */
export default async function ExportRequestPage({
  params,
  searchParams,
}: {
  params: { caseId: string };
  searchParams?: { basket?: string };
}) {
  const supabase = createClient(await cookies());
  const c = await getCaseById(supabase, params.caseId);
  if (!c) notFound();

  const basketIds = (searchParams?.basket ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const evidence = basketIds.length
    ? await getEvidenceByIds(supabase, basketIds)
    : [];

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 text-xs">
          <Link
            href={`/cases/${c.id}/evidence?basket=${basketIds.join(',')}`}
            className="text-muted hover:text-ink"
          >
            ← Back to evidence
          </Link>
        </div>

        <PageHeader
          eyebrow="Request evidence export"
          title="Prepare a BSA §63 export"
          subtitle={
            <>
              For case{' '}
              <span className="font-mono">{c.externalCaseRef}</span>. Two
              distinct officers must approve the export, at least one of
              them holding SUPERVISING_OFFICER. Once approved, a signed §63
              certificate is generated server-side (dummy signature in the
              prototype).
            </>
          }
        />

        <section className="mt-8 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Selected evidence rows</p>
          {evidence.length === 0 ? (
            <p className="text-sm text-warning">
              Your basket is empty. Return to the evidence table and select
              the rows you intend to export.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {evidence.map((e) => (
                <li
                  key={e.id}
                  className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_120px_120px]"
                >
                  <span className="font-mono text-xs text-ink break-all">
                    {e.id}
                  </span>
                  <Pill tone="muted">{e.category}</Pill>
                  <span className="text-xs text-muted">
                    {e.capturedAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Export purpose and recipient</p>
          <ExportRequestForm caseId={c.id} evidenceIds={basketIds} />
          <StatuteRef>
            BSA §63 (Bharatiya Sakshya Adhiniyam, 2023) — every export
            destined for court submission is accompanied by an auto-generated
            §63 certificate carrying the collection window, device
            particulars, evidence hashes, and a statement of operational
            status.
          </StatuteRef>
          <div className="mt-4">
            <DummyVerifiedPill />
          </div>
        </section>
      </main>
    </>
  );
}
