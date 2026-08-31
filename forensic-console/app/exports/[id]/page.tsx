import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import { DummyVerifiedPill, Pill } from '@/components/Pill';
import StatuteRef from '@/components/StatuteRef';
import {
  getCaseById,
  getEvidenceByIds,
  getEvidenceExportById,
  getOfficerById,
  listAuditTail,
} from '@/lib/db';
import { resolveCaller } from '@/lib/api';
import ApproveButton from './approve-button';
import GenerateButton from './generate-button';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusTone(
  s: 'PENDING_APPROVAL' | 'APPROVED' | 'GENERATED',
): 'muted' | 'primary' | 'success' {
  if (s === 'GENERATED') return 'success';
  if (s === 'APPROVED') return 'primary';
  return 'muted';
}

export default async function ExportDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient(await cookies());
  const exp = await getEvidenceExportById(supabase, params.id);
  if (!exp) notFound();

  const caller = await resolveCaller(supabase);
  const isSupervising =
    caller.ok && caller.roles.includes('SUPERVISING_OFFICER');
  const callerCanApprove =
    caller.ok &&
    (caller.roles.includes('SUPERVISING_OFFICER') ||
      caller.roles.includes('INVESTIGATING_OFFICER')) &&
    caller.officerId !== exp.requestedBy &&
    !exp.approvedBy.includes(caller.officerId) &&
    exp.derivedStatus !== 'GENERATED';
  const callerCanGenerate =
    caller.ok &&
    (caller.roles.includes('SUPERVISING_OFFICER') ||
      caller.roles.includes('INVESTIGATING_OFFICER')) &&
    exp.derivedStatus === 'APPROVED';

  const [c, evidence, requester, approverOfficers, auditTail] =
    await Promise.all([
      getCaseById(supabase, exp.caseId),
      getEvidenceByIds(supabase, exp.evidenceIds),
      getOfficerById(supabase, exp.requestedBy),
      Promise.all(exp.approvedBy.map((id) => getOfficerById(supabase, id))),
      listAuditTail(supabase, {
        targetType: 'evidence_export',
        targetId: exp.id,
        limit: 50,
      }),
    ]);

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 text-xs">
          {c && (
            <Link
              href={`/cases/${c.id}/evidence`}
              className="text-muted hover:text-ink"
            >
              ← Back to case evidence
            </Link>
          )}
        </div>

        <PageHeader
          eyebrow="Evidence export"
          title={
            <>
              Export&nbsp;
              <span className="font-mono text-2xl sm:text-3xl">
                {exp.id.slice(0, 8)}
              </span>
            </>
          }
          subtitle={
            c ? (
              <>
                Case <span className="font-mono">{c.externalCaseRef}</span>{' '}
                · Purpose {exp.purpose.replace('_', ' ')} · Requested{' '}
                {exp.createdAt.toLocaleString()}
              </>
            ) : (
              <>Purpose {exp.purpose.replace('_', ' ')}</>
            )
          }
          actions={
            <div className="flex flex-col items-end gap-2">
              <Pill tone={statusTone(exp.derivedStatus)}>
                {exp.derivedStatus.replace('_', ' ')}
              </Pill>
              <DummyVerifiedPill />
            </div>
          }
        />

        {/* Requester + approvers */}
        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="border border-slate-200 bg-white p-6">
            <p className="eyebrow mb-3">Requester</p>
            <p className="text-sm text-ink">
              {requester?.fullName ?? '—'}
              {requester?.serviceId && (
                <span className="ml-2 text-xs text-muted">
                  ({requester.serviceId})
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted">
              {requester?.organization ?? ''}
            </p>
          </div>
          <div className="border border-slate-200 bg-white p-6">
            <p className="eyebrow mb-3">
              Approvers (dual-officer, ENTITY_MODEL §3.5)
            </p>
            {approverOfficers.length === 0 ? (
              <p className="text-sm text-muted">
                No approvals yet. Two distinct officers must approve, at
                least one holding SUPERVISING_OFFICER.
              </p>
            ) : (
              <ul className="space-y-2 text-sm text-ink">
                {approverOfficers.map((o, i) => (
                  <li key={`${o?.id}-${i}`}>
                    {o?.fullName ?? exp.approvedBy[i]}
                    {o?.serviceId && (
                      <span className="ml-2 text-xs text-muted">
                        ({o.serviceId})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Evidence set */}
        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Evidence in this export</p>
          {evidence.length === 0 ? (
            <p className="text-sm text-warning">
              Referenced evidence is not visible to this session. RLS may
              be scoping you out of the underlying rows.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {evidence.map((e) => (
                <li
                  key={e.id}
                  className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_100px_100px_180px]"
                >
                  <span className="font-mono text-xs text-ink break-all">
                    {e.id}
                  </span>
                  <Pill tone="muted">{e.category}</Pill>
                  <Pill
                    tone={
                      e.quarantineStatus === 'RELEASED' ? 'success' : 'muted'
                    }
                  >
                    {e.quarantineStatus ?? 'CLEAR'}
                  </Pill>
                  <span className="font-mono text-[11px] text-muted">
                    …{e.payloadHash.slice(-14)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Timeline */}
        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Status timeline</p>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div>
                <p className="text-ink">Requested</p>
                <p className="text-xs text-muted">
                  {exp.createdAt.toLocaleString()}
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  exp.derivedStatus !== 'PENDING_APPROVAL'
                    ? 'bg-success'
                    : 'bg-slate-300'
                }`}
              />
              <div>
                <p className="text-ink">
                  Dual-officer approval ({exp.approvedBy.length}/2)
                </p>
                {exp.derivedStatus === 'PENDING_APPROVAL' && (
                  <p className="text-xs text-muted">
                    Awaiting a second approver (at least one must be
                    SUPERVISING_OFFICER).
                  </p>
                )}
              </div>
            </li>
            <li className="flex gap-3">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  exp.derivedStatus === 'GENERATED'
                    ? 'bg-success'
                    : 'bg-slate-300'
                }`}
              />
              <div>
                <p className="text-ink">BSA §63 certificate generated</p>
                {exp.exportedAt && (
                  <p className="text-xs text-muted">
                    {exp.exportedAt.toLocaleString()}
                  </p>
                )}
              </div>
            </li>
          </ol>
        </section>

        {/* Certificate reference / download */}
        {exp.bsaSection63CertificateRef && (
          <section className="mt-6 border border-slate-200 bg-white p-6">
            <p className="eyebrow mb-3">Certificate reference</p>
            <p className="font-mono text-xs break-all text-ink">
              {exp.bsaSection63CertificateRef}
            </p>
            <p className="mt-2 text-xs text-muted">
              The certificate PDF was streamed to the officer who
              generated it. In production the reference resolves to
              encrypted cold storage.
            </p>
          </section>
        )}

        {/* Actions */}
        <section className="mt-8 flex flex-col gap-4 border-t border-slate-200 pt-6">
          {callerCanApprove && (
            <div>
              <p className="eyebrow mb-2">Your action</p>
              <ApproveButton exportId={exp.id} />
              <p className="mt-2 text-xs text-muted">
                {isSupervising
                  ? 'As SUPERVISING_OFFICER your approval satisfies the §3.5 invariant if paired with any second approver.'
                  : 'A SUPERVISING_OFFICER must be present among the approvers before the export can be generated.'}
              </p>
            </div>
          )}
          {callerCanGenerate && (
            <div>
              <p className="eyebrow mb-2">Generate certificate</p>
              <GenerateButton exportId={exp.id} />
              <StatuteRef>
                BSA §63 — the certificate lists only the evidence hashes,
                collection window, and device particulars. Raw payloads are
                never carried into the certificate.
              </StatuteRef>
            </div>
          )}
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
                  <span className="font-mono text-xs text-muted">
                    #{e.id}
                  </span>
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
      </main>
    </>
  );
}
