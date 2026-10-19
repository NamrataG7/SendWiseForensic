import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import EmptyRegister from '@/components/EmptyRegister';
import { Pill } from '@/components/Pill';
import {
  getSubjectById,
  listAuthorizationsForSubject,
  listDevicesForSubject,
  listEvidenceWithAuthorizationForSubject,
  countPendingFilterForSubject,
  getSubjectEvidenceSummary,
  type EvidenceWithAuthorizationRow,
  type PrivilegeFlagDb,
  type QuarantineStatusDb,
} from '@/lib/db';
import type { AuthorizationStatus } from '@/lib/entities';
import {
  EvidenceByDayChart,
  EvidenceByCategoryChart,
  EvidenceByPrivilegeChart,
} from './charts';

export const dynamic = 'force-dynamic';

function authTone(status: AuthorizationStatus): 'success' | 'warning' | 'muted' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'REVOKED' || status === 'SUSPENDED' || status === 'REJECTED') return 'warning';
  return 'muted';
}

function expiryLabel(expiresOn: Date): string {
  const days = Math.round(
    (expiresOn.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}

function privilegeTone(
  flag: PrivilegeFlagDb,
): 'muted' | 'warning' | 'primary' {
  if (flag === 'NONE') return 'muted';
  if (flag === 'UNKNOWN') return 'warning';
  return 'primary'; // LEGAL / MEDICAL / CLERGY / SPOUSAL
}

function quarantineTone(status: QuarantineStatusDb | null): 'muted' | 'success' {
  if (!status) return 'muted';
  return status === 'RELEASED' ? 'success' : 'muted';
}

function hashTail(h: string, n = 12) {
  return h.length <= n ? h : `…${h.slice(-n)}`;
}

function fingerprintTail(fp: string, n = 16) {
  return fp.length <= n ? fp : `…${fp.slice(-n)}`;
}

export default async function SubjectDashboardPage({
  params,
}: {
  params: { subjectId: string };
}) {
  const supabase = createClient(await cookies());
  const subject = await getSubjectById(supabase, params.subjectId);
  if (!subject) notFound();

  const [authorizations, devices, evidence, summary, pendingFilterCount] = await Promise.all([
    listAuthorizationsForSubject(supabase, subject.id),
    listDevicesForSubject(supabase, subject.id),
    listEvidenceWithAuthorizationForSubject(supabase, subject.id),
    getSubjectEvidenceSummary(supabase, subject.id),
    countPendingFilterForSubject(supabase, subject.id),
  ]);

  const primaryCaseId = authorizations[0]?.caseId ?? null;

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 text-xs">
          {primaryCaseId ? (
            <Link
              href={`/cases/${primaryCaseId}?tab=subjects`}
              className="text-muted hover:text-ink"
            >
              ← Back to case subjects
            </Link>
          ) : (
            <Link href="/cases" className="text-muted hover:text-ink">
              ← Back to docket
            </Link>
          )}
        </div>

        <PageHeader
          eyebrow="Subject dashboard — pseudonymised identifier"
          title={subject.pseudonymousLabel}
          subtitle={
            <>
              Subject ID <span className="font-mono">{subject.id}</span> ·
              Enrolled {subject.createdAt.toDateString()}. Real identity
              resolves only under an in-scope, active authorization; this
              view never displays raw identity references.
            </>
          }
        />

        {/* Authorization status strip */}
        <section className="mt-8">
          <p className="eyebrow mb-3">Authorization status</p>
          {authorizations.length === 0 ? (
            <EmptyRegister
              title="No authorization on record"
              body="This subject has no associated authorization yet. Without a valid, unexpired authorization, no data may be collected from any device linked to this subject."
            />
          ) : (
            <div className="space-y-3">
              {authorizations.map((a) => (
                <Link
                  key={a.id}
                  href={`/authorizations/${a.id}`}
                  className="block border border-slate-200 bg-white p-5 hover:border-primary motion-fade"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow">{a.type.replace('_', ' ')}</p>
                      <p className="mt-1 font-mono text-sm text-ink">{a.id}</p>
                      <p className="mt-2 text-xs text-muted">
                        {a.statuteReferences.join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Pill tone={authTone(a.status)}>{a.status}</Pill>
                      <p className="text-xs text-muted">
                        {expiryLabel(a.expiresOn)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Enrolled devices */}
        <section className="mt-8">
          <p className="eyebrow mb-3">Enrolled devices</p>
          {devices.length === 0 ? (
            <EmptyRegister
              title="No devices enrolled"
              body="Devices appear here once enrolment completes under an active authorization."
            />
          ) : (
            <div className="overflow-x-auto border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-register text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Platform</th>
                    <th className="px-4 py-3 font-semibold">
                      Device fingerprint
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Hardware-backed key
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <Pill tone="muted">{d.platform.replace('_', ' ')}</Pill>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink">
                        {fingerprintTail(d.deviceFingerprint)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {d.hardwareBackedPubKey ? 'Present' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Evidence section: synthetic warning, summary numbers, CSV, charts, table */}
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="eyebrow">Evidence — metadata only</p>
            <a
              href={`/api/subjects/${subject.id}/evidence/csv`}
              className="bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover"
            >
              Download evidence CSV
            </a>
          </div>

          {summary.syntheticCount > 0 && (
            <div className="mt-4 border-2 border-warning bg-warning/5 p-4">
              <p className="text-sm font-bold uppercase tracking-register text-warning">
                ⚠ {summary.syntheticCount} of {summary.totalCount} rows are
                synthetic pipeline-test data — not real evidence
              </p>
              <p className="mt-1 text-xs text-ink">
                Synthetic rows are flagged individually in the table below and
                are included in the CSV export with their{' '}
                <code className="font-mono">synthetic</code> flag set to{' '}
                <code className="font-mono">true</code>. Confirm this flag
                before relying on any row for a legal filing.
              </p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="border border-slate-200 bg-white p-5">
              <p className="text-xs uppercase tracking-register text-muted">
                Total evidence rows
              </p>
              <p className="mt-1 font-serif text-3xl text-ink">
                {summary.totalCount}
              </p>
            </div>
            <div className="border border-slate-200 bg-white p-5">
              <p className="text-xs uppercase tracking-register text-muted">
                Synthetic rows
              </p>
              <p
                className={`mt-1 font-serif text-3xl ${
                  summary.syntheticCount > 0 ? 'text-warning' : 'text-ink'
                }`}
              >
                {summary.syntheticCount}
              </p>
            </div>
            <div className="border border-slate-200 bg-white p-5">
              <p className="text-xs uppercase tracking-register text-muted">
                Authorizations
              </p>
              <p className="mt-1 font-serif text-3xl text-ink">
                {authorizations.length}
              </p>
            </div>
            <div className="border border-slate-200 bg-white p-5">
              <p className="text-xs uppercase tracking-register text-muted">
                Devices enrolled
              </p>
              <p className="mt-1 font-serif text-3xl text-ink">
                {devices.length}
              </p>
            </div>
            {pendingFilterCount > 0 ? (
              <Link
                href="/filter-team"
                className="border-2 border-filter bg-filter/5 p-5 hover:bg-filter/10 motion-fade"
              >
                <p className="text-xs uppercase tracking-register text-filter">
                  Awaiting Filter Team review
                </p>
                <p className="mt-1 font-serif text-3xl text-filter">
                  {pendingFilterCount}
                </p>
                <p className="mt-1 text-[11px] text-filter">
                  Count only — content stays hidden until independently
                  reviewed →
                </p>
              </Link>
            ) : (
              <div className="border border-slate-200 bg-white p-5">
                <p className="text-xs uppercase tracking-register text-muted">
                  Awaiting Filter Team review
                </p>
                <p className="mt-1 font-serif text-3xl text-ink">0</p>
              </div>
            )}
          </div>

          {/* Charts */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="border border-slate-200 bg-white p-6">
              <p className="eyebrow mb-4">Evidence volume over time</p>
              <EvidenceByDayChart data={summary.byDay} />
            </div>
            <div className="border border-slate-200 bg-white p-6">
              <p className="eyebrow mb-4">Evidence by category</p>
              <EvidenceByCategoryChart data={summary.byCategory} />
            </div>
            <div className="border border-slate-200 bg-white p-6 lg:col-span-2">
              <p className="eyebrow mb-4">Privilege distribution</p>
              <p className="mb-4 text-xs text-muted">
                Non-NONE categories trigger quarantine review per BSA §63 and
                are shown in warm colour.
              </p>
              <EvidenceByPrivilegeChart data={summary.byPrivilegeFlag} />
            </div>
          </div>

          {/* Evidence table */}
          <div className="mt-6">
            {evidence.length === 0 ? (
              <EmptyRegister
                title="No evidence on record"
                body="Evidence appears here after a monitoring session under an active authorization writes its first payload."
              />
            ) : (
              <div className="overflow-x-auto border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-register text-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Captured at</th>
                      <th className="px-4 py-3 font-semibold">Category</th>
                      <th className="px-4 py-3 font-semibold">Privilege</th>
                      <th className="px-4 py-3 font-semibold">Quarantine</th>
                      <th className="px-4 py-3 font-semibold">Hash (tail)</th>
                      <th className="px-4 py-3 font-semibold">Evidence ID</th>
                      <th className="px-4 py-3 font-semibold">Warrant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.map((e: EvidenceWithAuthorizationRow) => (
                      <tr
                        key={e.id}
                        className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                          e.synthetic ? 'bg-amber-50/50' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-xs text-ink">
                          <div className="flex items-center gap-2">
                            {e.capturedAt.toLocaleString()}
                            {e.synthetic && (
                              <span className="inline-flex items-center rounded-sm bg-filter px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-register text-white">
                                Synthetic
                              </span>
                            )}
                          </div>
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
                        <td className="px-4 py-3">
                          <Link
                            href={`/authorizations/${e.authorizationId}`}
                            className="font-mono text-[11px] text-primary hover:underline"
                          >
                            {e.authorizationId.slice(0, 8)} →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
