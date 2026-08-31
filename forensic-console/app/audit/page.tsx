import { cookies } from 'next/headers';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import { createClient } from '@/utils/supabase/server';
import { listAuditTail } from '@/lib/db';
import { resolveCaller } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Audit Chain — SendWiseForensic',
};

/**
 * Judicial Auditor read-only view of the append-only, hash-chained audit
 * log (audit_log table). Rows come back in insertion order so the UI can
 * walk prev_hash to render chain-link visualization.
 *
 * Access gating: JUDICIAL_AUDITOR or DPO. Officers without either role
 * see the page render a "role required" notice rather than raw data.
 */
export default async function AuditPage() {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  const authorised =
    caller.ok &&
    (caller.roles.includes('JUDICIAL_AUDITOR') ||
      caller.roles.includes('DPO'));

  const entries = authorised ? await listAuditTail(supabase, { limit: 200 }) : [];

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Judicial Auditor — read-only"
          title="Hash-chained audit trail"
          subtitle="Every mutation to the system is written here in the same transaction as the change. Rows are append-only: UPDATE and DELETE are revoked at the role level and further enforced by trigger. Each row&rsquo;s hash covers the previous row&rsquo;s hash — any tampering breaks the chain."
        />

        {!authorised ? (
          <div className="mt-8 border border-red-200 bg-red-50 p-6 text-sm text-warning">
            This view is restricted to officers holding the
            JUDICIAL_AUDITOR or DPO role. If you require oversight access,
            contact the case Review Committee.
          </div>
        ) : entries.length === 0 ? (
          <div className="mt-8 border border-slate-200 bg-white p-6 text-sm text-muted">
            No audit rows yet. Events appear as officers issue, approve,
            revoke, or read authorisations and evidence.
          </div>
        ) : (
          <>
            <div className="mt-8 overflow-x-auto border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-register text-muted">
                  <tr>
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Timestamp</th>
                    <th className="px-4 py-3 font-semibold">Actor</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                    <th className="px-4 py-3 font-semibold">Target</th>
                    <th className="px-4 py-3 font-semibold">Prev hash</th>
                    <th className="px-4 py-3 font-semibold">This hash</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted">
                        {e.id}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink">
                        {e.timestamp.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono text-ink">
                          {String(e.actorId)}
                        </div>
                        <div className="text-muted">{e.actorRole}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-ink">
                        {e.action}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">
                        {e.targetType ? `${e.targetType}:${e.targetId}` : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted break-all">
                        {e.prevAuditHash ? e.prevAuditHash.slice(0, 12) + '…' : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-ink break-all">
                        {e.hash.slice(0, 12) + '…'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="mt-8 border border-slate-200 bg-white p-6">
              <p className="eyebrow mb-4">Chain integrity</p>
              <div className="flex flex-wrap items-center gap-2">
                {entries.map((e, i) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <div className="border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-[11px] text-ink">
                      #{e.id} · {e.hash.slice(-6)}
                    </div>
                    {i < entries.length - 1 && (
                      <span aria-hidden className="text-muted">
                        ─▶
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted">
                Post-MVP, the Merkle root of this chain is anchored to an
                external timestamping authority per Puttaswamy procedural
                safeguards (TODO EXTERNAL-ANCHORING). In prototype, anchoring
                is internal only.
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}
