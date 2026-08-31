import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import { Pill, DummyVerifiedPill } from '@/components/Pill';
import StatuteRef from '@/components/StatuteRef';
import { getAuthorizationById, listAuditTail } from '@/lib/db';
import RevokeForm from './revoke-form';

export const dynamic = 'force-dynamic';

export default async function AuthorizationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient(await cookies());
  const a = await getAuthorizationById(supabase, params.id);
  if (!a) notFound();

  const days = Math.round(
    (a.expiresOn.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  const auditTail = await listAuditTail(supabase, {
    targetType: 'authorization',
    targetId: a.id,
    limit: 50,
  });

  const isTerminal = a.status === 'REVOKED' || a.status === 'EXPIRED';
  const scope = a.scope ?? {
    dataCategories: [],
    devices: [],
  };
  const checklist = a.proportionalityChecklist ?? {
    legality: { justified: false, note: '' },
    legitimateAim: { justified: false, note: '' },
    proportionality: { justified: false, note: '' },
    proceduralSafeguards: { justified: false, note: '' },
  };
  const approval = a.reviewCommitteeApproval;

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
              {String(a.legitimateAim).replace(/_/g, ' ')}
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
                {(scope.dataCategories ?? []).join(' · ') || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-register text-muted">
                Devices
              </p>
              <p className="mt-1 font-mono text-sm text-ink">
                {(scope.devices ?? []).join(', ') || '—'}
              </p>
            </div>
            {scope.keywords && scope.keywords.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-register text-muted">
                  Keywords
                </p>
                <p className="mt-1 text-sm text-ink">
                  {scope.keywords.join(', ')}
                </p>
              </div>
            )}
            {scope.contextApps && scope.contextApps.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-register text-muted">
                  Context apps
                </p>
                <p className="mt-1 font-mono text-sm text-ink">
                  {scope.contextApps.join(', ')}
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
                ['Legality', checklist.legality],
                ['Legitimate aim', checklist.legitimateAim],
                ['Proportionality', checklist.proportionality],
                ['Procedural safeguards', checklist.proceduralSafeguards],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-register text-muted">
                  {k}
                </dt>
                <dd className="mt-1 text-sm text-ink">
                  {typeof v === 'string'
                    ? v
                    : (v as { note?: string })?.note ?? '—'}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Review Committee approval */}
        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Review Committee approval</p>
          {approval ? (
            <div className="text-sm">
              <p className="text-ink">
                Approvers:{' '}
                <span className="font-mono">
                  {(approval as unknown as { approvers?: string[] }).approvers?.join(
                    ', ',
                  ) ?? '—'}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">
                Notes:{' '}
                {(approval as unknown as { notes?: string }).notes || '(none)'}
              </p>
              <div className="mt-3">
                <Pill tone="warning">
                  Prototype stub — single-user approval (TODO REVIEW-COMMITTEE-QUORUM)
                </Pill>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Awaiting Review Committee approval. Under 2009 Rules R.22 the
              direction must be placed before the Review Committee within
              seven working days.
            </p>
          )}
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
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  a.status === 'ACTIVE' ? 'bg-success' : 'bg-slate-300'
                }`}
              />
              <div>
                <p className="text-ink">Issued</p>
                <p className="text-xs text-muted">
                  {a.issuedOn.toLocaleString()}
                </p>
              </div>
            </li>
            {a.revocationLog.map((r, i) => (
              <li key={`rev-${i}`} className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warning" />
                <div>
                  <p className="text-ink">Revoked — {r.reason}</p>
                  <p className="text-xs text-muted">
                    {r.at.toLocaleString()} by {r.actorId}
                  </p>
                </div>
              </li>
            ))}
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
            {a.signedOrderDocumentHash || '—'}
          </p>
          <p className="mt-1 text-xs text-muted">
            SHA-256 of the uploaded PDF. Real system verifies UIDAI e-Sign
            certificate; this prototype does not.
          </p>
        </section>

        {/* Audit tail */}
        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Audit tail</p>
          {auditTail.length === 0 ? (
            <p className="text-sm text-muted">No audit events yet.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {auditTail.map((e) => (
                <li
                  key={e.id}
                  className="grid grid-cols-1 gap-2 py-3 text-sm sm:grid-cols-[80px_180px_1fr]"
                >
                  <span className="font-mono text-xs text-muted">#{e.id}</span>
                  <span className="text-xs text-muted">
                    {e.timestamp.toLocaleString()}
                  </span>
                  <span className="text-ink">
                    <span className="font-semibold">{e.action}</span>
                    <span className="text-muted"> · {e.actorRole}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Actions */}
        {!isTerminal && (
          <section className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
            <RevokeForm authorizationId={a.id} />
            <StatuteRef>
              Revocation is logged to the audit chain and cascades to all
              active MonitoringSessions per 2009 Rules R.11.
            </StatuteRef>
          </section>
        )}
      </main>
    </>
  );
}
