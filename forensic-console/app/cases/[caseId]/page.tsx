import Link from 'next/link';
import { notFound } from 'next/navigation';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import EmptyRegister from '@/components/EmptyRegister';
import { Pill, DummyVerifiedPill } from '@/components/Pill';
import {
  getCaseById,
  getAuthorizationsForCase,
  getSubjectForCase,
  getSessionsForCase,
  getEvidenceMetadataForCase,
} from '@/lib/forensic-store';

export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'authorizations' | 'subjects' | 'evidence' | 'audit';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'authorizations', label: 'Authorizations' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'evidence', label: 'Evidence (metadata)' },
  { key: 'audit', label: 'Audit Trail' },
];

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: { caseId: string };
  searchParams?: { tab?: Tab };
}) {
  const c = await getCaseById(params.caseId);
  if (!c) notFound();

  const tab: Tab = searchParams?.tab ?? 'overview';
  const subject = await getSubjectForCase(c.id);
  const auths = await getAuthorizationsForCase(c.id);
  const sessions = await getSessionsForCase(c.id);
  const evidence = await getEvidenceMetadataForCase(c.id);

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 text-xs">
          <Link href="/cases" className="text-muted hover:text-ink">
            ← Back to docket
          </Link>
        </div>

        <PageHeader
          eyebrow="In the matter of"
          title={c.externalCaseRef}
          subtitle={
            <>
              Case ID <span className="font-mono">{c.id}</span> ·{' '}
              Jurisdiction {c.jurisdiction} · Filed{' '}
              {c.createdAt.toDateString()}
            </>
          }
          actions={
            <Pill tone={c.status === 'OPEN' ? 'primary' : 'muted'}>
              {c.status.replace('_', ' ')}
            </Pill>
          }
        />

        <nav className="mt-6 flex flex-wrap gap-1 border-b border-slate-200">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Link
                key={t.key}
                href={`/cases/${c.id}?tab=${t.key}`}
                className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <section className="py-8">
          {tab === 'overview' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="border border-slate-200 bg-white p-6">
                <p className="eyebrow mb-3">Offences charged (BNS)</p>
                <ul className="space-y-2 text-sm">
                  {c.offences.map((o) => (
                    <li key={o} className="font-mono text-ink">
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border border-slate-200 bg-white p-6">
                <p className="eyebrow mb-3">Subject on record</p>
                {subject ? (
                  <>
                    <p className="font-serif text-lg text-ink">
                      {subject.pseudonymousLabel}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Pseudonymised identifier. Real identity resolves only
                      under an in-scope, active authorization.
                    </p>
                    {subject.identityRefs.verifiedByStub && (
                      <div className="mt-4">
                        <DummyVerifiedPill />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted">Not yet enrolled.</p>
                )}
              </div>
              <div className="border border-slate-200 bg-white p-6 md:col-span-2">
                <p className="eyebrow mb-3">Case chronology</p>
                <ol className="space-y-3 text-sm">
                  <li className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div>
                      <p className="text-ink">Case created</p>
                      <p className="text-xs text-muted">
                        {c.createdAt.toLocaleString()}
                      </p>
                    </div>
                  </li>
                  {auths.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-success" />
                      <div>
                        <p className="text-ink">
                          Authorization {a.id} issued ({a.type})
                        </p>
                        <p className="text-xs text-muted">
                          {a.issuedOn.toLocaleString()} · expires{' '}
                          {a.expiresOn.toDateString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {tab === 'authorizations' && (
            <>
              {auths.length === 0 ? (
                <EmptyRegister
                  title="No authorizations on this case"
                  body="Without a valid, unexpired authorization, no data may be collected from any device linked to the subject."
                  action={
                    <Link
                      href={`/authorizations/new?caseId=${c.id}`}
                      className="bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover"
                    >
                      Issue Authorization
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-4">
                  {auths.map((a) => (
                    <Link
                      key={a.id}
                      href={`/authorizations/${a.id}`}
                      className="block border border-slate-200 bg-white p-6 hover:border-primary motion-fade"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="eyebrow">{a.type.replace('_', ' ')}</p>
                          <p className="mt-1 font-serif text-xl text-ink">
                            {a.id}
                          </p>
                          <p className="mt-2 text-sm text-muted">
                            {a.statuteReferences.join(' · ')}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Pill
                            tone={a.status === 'ACTIVE' ? 'success' : 'muted'}
                          >
                            {a.status}
                          </Pill>
                          <DummyVerifiedPill />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'subjects' && (
            <>
              {subject ? (
                <div className="max-w-2xl border border-slate-200 bg-white p-6">
                  <p className="eyebrow mb-2">Pseudonymous label</p>
                  <p className="font-serif text-2xl text-ink">
                    {subject.pseudonymousLabel}
                  </p>
                  <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-register text-muted">
                        Aadhaar
                      </dt>
                      <dd className="font-mono text-ink">
                        {subject.identityRefs.aadhaarHash ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-register text-muted">
                        Devices enrolled
                      </dt>
                      <dd className="text-ink">{subject.devices.length}</dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <DummyVerifiedPill />
                  </div>
                </div>
              ) : (
                <EmptyRegister
                  title="No subject enrolled"
                  body="The subject appears here once identity capture (Aadhaar hash) and device enrolment are completed under an active authorization."
                />
              )}
            </>
          )}

          {tab === 'evidence' && (
            <>
              {evidence.length === 0 && sessions.length === 0 ? (
                <EmptyRegister
                  title="No evidence on record"
                  body="Evidence appears here once a monitoring session under an active authorization writes its first payload. Investigators see metadata only; raw payloads require a dual-officer export."
                />
              ) : (
                <p className="text-sm text-muted">
                  {evidence.length} evidence entries · {sessions.length}{' '}
                  sessions
                </p>
              )}
            </>
          )}

          {tab === 'audit' && (
            <div className="border border-slate-200 bg-white p-6">
              <p className="eyebrow mb-3">Audit trail for this case</p>
              <p className="text-sm text-muted">
                A read-only slice of the hash-chained audit log, scoped to
                this case. Full chain is available to the Judicial Auditor at{' '}
                <Link
                  href="/audit"
                  className="text-primary hover:underline"
                >
                  /audit
                </Link>
                .
              </p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
