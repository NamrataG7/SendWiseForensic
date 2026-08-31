import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import { getAuditChain } from '@/lib/forensic-store';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Audit Chain — SendWiseForensic',
};

/**
 * Judicial Auditor read-only view.
 *
 * Renders the hash chain visually: each row shows its own hash, previous
 * hash, action, and actor. Broken links (prevHash mismatch) will be
 * flagged red in the wired implementation.
 *
 * TODO(WIRE-TO-SCHEMA): stream from audit_log; add verification badge
 * showing that hash chain integrity check ran client-side.
 */
export default async function AuditPage() {
  const entries = await getAuditChain();

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Judicial Auditor — read-only"
          title="Hash-chained audit trail"
          subtitle="Every mutation to the system is written here in the same transaction. Rows are append-only; UPDATE and DELETE are revoked at the role level and further enforced by trigger. Each row&rsquo;s hash covers the previous row&rsquo;s hash — any tampering breaks the chain."
        />

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
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {e.id}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink">
                    {e.timestamp.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-mono text-ink">{String(e.actorId)}</div>
                    <div className="text-muted">{e.actorRole}</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-ink">
                    {e.action}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {e.targetType ? `${e.targetType}:${e.targetId}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted">
                    {e.prevAuditHash ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink">
                    {e.hash}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Chain visualization */}
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
            safeguards. In prototype, anchoring is internal only.
          </p>
        </section>
      </main>
    </>
  );
}
