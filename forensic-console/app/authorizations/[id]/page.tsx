import Link from 'next/link';
import { notFound } from 'next/navigation';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import { Pill, DummyVerifiedPill } from '@/components/Pill';
import StatuteRef from '@/components/StatuteRef';
import { getAuthorizationById } from '@/lib/forensic-store';

export const dynamic = 'force-dynamic';

export default async function AuthorizationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const a = await getAuthorizationById(params.id);
  if (!a) notFound();

  const days = Math.round(
    (a.expiresOn.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 text-xs">
          <Link
            href={`/cases/${a.caseId}?tab=authorizations`}
            className="text-muted hover:text-ink"
          >
            ← Back to case authorizations
          </Link>
        </div>

        <PageHeader
          eyebrow="In the matter of the direction dated"
          title={
            <>
              Authorization&nbsp;
              <span className="font-mono text-2xl sm:text-3xl">{a.id}</span>
            </>
          }
          subtitle={
            <>
              Issued {a.issuedOn.toDateString()} · Expires{' '}
              {a.expiresOn.toDateString()} ({days} days)
            </>
          }
          actions={
            <div className="flex flex-col items-end gap-2">
              <Pill tone={a.status === 'ACTIVE' ? 'success' : 'muted'}>
                {a.status}
              </Pill>
              <DummyVerifiedPill />
            </div>
          }
        />

        {/* Statutory metadata */}
        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="border border-slate-200 bg-white p-6">
            <p className="eyebrow mb-3">Statutory basis</p>
            <ul className="space-y-1.5 text-sm font-mono text-ink">
              {a.statuteReferences.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <StatuteRef>
              IT Act §69 read with 2009 Interception Rules R.3 and R.11.
            </StatuteRef>
          </div>
          <div className="border border-slate-200 bg-white p-6">
            <p className="eyebrow mb-3">Legitimate aim</p>
            <p className="text-sm text-ink">
              {a.legitimateAim.replace(/_/g, ' ')}
            </p>
          </div>
        </section>

        {/* Scope */}
        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Scope of collection</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-register text-muted">
                Data categories
              </p>
              <p className="mt-1 text-sm text-ink">
                {a.scope.dataCategories.join(' · ')}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-register text-muted">
                Devices
              </p>
              <p className="mt-1 font-mono text-sm text-ink">
                {a.scope.devices.join(', ') || '—'}
              </p>
            </div>
            {a.scope.keywords && (
              <div>
                <p className="text-xs uppercase tracking-register text-muted">
                  Keywords
                </p>
                <p className="mt-1 text-sm text-ink">
                  {a.scope.keywords.join(', ')}
                </p>
              </div>
            )}
            {a.scope.contextApps && (
              <div>
                <p className="text-xs uppercase tracking-register text-muted">
                  Context apps
                </p>
                <p className="mt-1 font-mono text-sm text-ink">
                  {a.scope.contextApps.join(', ')}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Proportionality */}
        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Puttaswamy proportionality record</p>
          <dl className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['Legality', a.proportionalityChecklist.legality],
                ['Legitimate aim', a.proportionalityChecklist.legitimateAim],
                [
                  'Proportionality',
                  a.proportionalityChecklist.proportionality,
                ],
                [
                  'Procedural safeguards',
                  a.proportionalityChecklist.proceduralSafeguards,
                ],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-register text-muted">
                  {k}
                </dt>
                <dd className="mt-1 text-sm text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Timeline */}
        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Status timeline</p>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div>
                <p className="text-ink">Draft created</p>
                <p className="text-xs text-muted">
                  {a.createdAt.toLocaleString()}
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-success" />
              <div>
                <p className="text-ink">Issued and marked ACTIVE</p>
                <p className="text-xs text-muted">
                  {a.issuedOn.toLocaleString()}
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
              <div>
                <p className="text-muted">Scheduled expiry</p>
                <p className="text-xs text-muted">
                  {a.expiresOn.toLocaleString()}
                </p>
              </div>
            </li>
          </ol>
        </section>

        {/* Signed order */}
        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Signed order document</p>
          <p className="font-mono text-xs break-all text-ink">
            {a.signedOrderDocumentHash}
          </p>
          <p className="mt-1 text-xs text-muted">
            SHA-256 of the uploaded PDF. Real system verifies UIDAI e-Sign
            certificate; this prototype does not.
          </p>
        </section>

        {/* Actions */}
        <section className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
          <form className="flex flex-1 flex-wrap items-center gap-3">
            <input
              name="reason"
              required
              placeholder="Reason for revocation (required)"
              className="min-w-[240px] flex-1 border border-slate-300 px-3 py-2 text-sm focus:border-warning focus:outline-none"
            />
            <button
              type="button"
              className="border border-warning bg-white px-4 py-2 text-xs font-semibold uppercase tracking-register text-warning hover:bg-red-50"
            >
              Revoke authorization
            </button>
          </form>
          <StatuteRef>
            Revocation is logged to the audit chain and cascades to all
            active MonitoringSessions per 2009 Rules R.11.
          </StatuteRef>
        </section>
      </main>
    </>
  );
}
