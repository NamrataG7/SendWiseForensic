import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import EmptyRegister from '@/components/EmptyRegister';
import { Pill, DummyVerifiedPill } from '@/components/Pill';
import {
  getCaseById,
  listAuditTail,
  listAuthorizationsForCase,
  listSubjectsForCase,
} from '@/lib/db';

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
  const supabase = createClient(await cookies());
  const c = await getCaseById(supabase, params.caseId);
  if (!c) notFound();

  const tab: Tab = searchParams?.tab ?? 'overview';
  const [subjects, auths] = await Promise.all([
    listSubjectsForCase(supabase, c.id),
    listAuthorizationsForCase(supabase, c.id),
  ]);
  const subject = subjects[0] ?? null;

  // Audit tail scoped to authorizations under this case.
  const auditPerAuth = await Promise.all(
    auths.map((a) =>
      listAuditTail(supabase, {
        targetType: 'authorization',
        targetId: a.id,
        limit: 20,
      }),
    ),
  );
  const auditTail = auditPerAuth.flat().sort((a, b) => a.id - b.id);

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
              Case ID <span className="font-mono">{c.id}</span> · Jurisdiction{' '}
              {c.jurisdiction} · Filed {c.createdAt.toDateString()}
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
              {subjects.length > 0 ? (
                <div className="space-y-4">
                  {subjects.map((s) => (
                    <div
                      key={s.id}
                      className="max-w-2xl border border-slate-200 bg-white p-6"
                    >
                      <p className="eyebrow mb-2">Pseudonymous label</p>
                      <p className="font-serif text-2xl text-ink">
                        {s.pseudonymousLabel}
                      </p>
                      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <dt className="text-xs uppercase tracking-register text-muted">
                            Aadhaar hash
                          </dt>
                          <dd className="font-mono text-ink break-all">
                            {s.identityRefs.aadhaarHash ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-register text-muted">
                            Devices enrolled
                          </dt>
                          <dd className="text-ink">{s.devices.length}</dd>
                        </div>
                      </dl>
                      {s.identityRefs.verifiedByStub && (
                        <div className="mt-4">
                          <DummyVerifiedPill />
                        </div>
                      )}
                    </div>
                  ))}
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
            <div className="space-y-4">
              <div className="border border-slate-200 bg-white p-6">
                <p className="eyebrow mb-3">Evidence metadata</p>
                <p className="text-sm text-muted">
                  Evidence rows for this case are listed on the dedicated
                  evidence page, where investigators can build an export
                  basket for dual-officer approval. Raw payloads never
                  leave the encrypted cold store; the certificate lists
                  only hashes and collection metadata per BSA §63.
                </p>
                <div className="mt-4">
                  <Link
                    href={`/cases/${c.id}/evidence`}
                    className="bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover"
                  >
                    Open evidence table
                  </Link>
                </div>
              </div>
            </div>
          )}

          {tab === 'audit' && (
            <div className="border border-slate-200 bg-white p-6">
              <p className="eyebrow mb-3">Audit trail for this case</p>
              {auditTail.length === 0 ? (
                <p className="text-sm text-muted">
                  No audit events recorded against this case&rsquo;s
                  authorizations yet. Full chain is available to the Judicial
                  Auditor at{' '}
                  <Link href="/audit" className="text-primary hover:underline">
                    /audit
                  </Link>
                  .
                </p>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {auditTail.map((e) => (
                    <li
                      key={e.id}
                      className="grid grid-cols-1 gap-2 py-3 text-sm sm:grid-cols-[120px_140px_1fr]"
                    >
                      <span className="font-mono text-xs text-muted">
                        #{e.id}
                      </span>
                      <span className="text-xs text-muted">
                        {e.timestamp.toLocaleString()}
                      </span>
                      <span className="text-ink">
                        <span className="font-semibold">{e.action}</span>
                        <span className="text-muted"> · {e.actorRole}</span>
                        {e.targetId && (
                          <span className="ml-2 font-mono text-[11px] text-muted">
                            {e.targetType}:{e.targetId.slice(0, 8)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
