import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import EmptyRegister from '@/components/EmptyRegister';
import { Pill } from '@/components/Pill';
import { listFilterTeamQueue } from '@/lib/db';
import { resolveCaller } from '@/lib/api';
import DecisionForm from './decision-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Filter Team — SendWiseForensic',
};

/**
 * Filter Team console.
 *
 * Reviewers see ONLY evidence with quarantine_status = PENDING_FILTER —
 * across cases (independence). This page renders in a distinct amber
 * accent to signal independent-review scope.
 *
 * TODO(FILTER-TEAM-INDEPENDENCE): production requires reviewers to be
 * organizationally independent (judicial officers, not police). The
 * prototype enforces role separation only.
 */
export default async function FilterTeamPage() {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  const authorised = caller.ok && caller.roles.includes('FILTER_TEAM');
  const queue = authorised
    ? await listFilterTeamQueue(supabase, { limit: 200 })
    : [];

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-6xl border-l-4 border-filter px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Independent review — Filter Team"
          title="Privileged evidence queue"
          subtitle="Evidence flagged with a privilege category is quarantined at ingest and appears here for independent review. Investigators cannot see rows in this queue. Decisions are irreversible and audit-logged."
        />

        {!authorised ? (
          <div className="mt-8 border border-red-200 bg-red-50 p-6 text-sm text-warning">
            This console is restricted to officers holding the FILTER_TEAM
            role. Access requests are handled by the Review Committee.
          </div>
        ) : queue.length === 0 ? (
          <div className="mt-8">
            <EmptyRegister
              title="Queue is empty"
              body="Evidence rows appear here when the ingest quarantine router flags them as privileged. Nothing to review right now."
            />
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-amber-50 text-xs uppercase tracking-register text-filter">
                <tr>
                  <th className="px-4 py-3 font-semibold">Captured at</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Privilege</th>
                  <th className="px-4 py-3 font-semibold">Hash (tail)</th>
                  <th className="px-4 py-3 font-semibold">Evidence ID</th>
                  <th className="px-4 py-3 font-semibold">Decision</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-100 last:border-0 align-top"
                  >
                    <td className="px-4 py-3 text-xs text-ink">
                      {e.capturedAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone="muted">{e.category}</Pill>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone="primary">{e.privilegeFlag}</Pill>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink">
                      …{e.payloadHash.slice(-14)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted">
                      {e.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 min-w-[260px]">
                      <DecisionForm evidenceId={e.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs text-muted">
          Reviewer independence marker — the amber left border indicates
          this console operates outside investigator scope. Decisions here
          flow through the hash-chained audit log with actor role
          FILTER_TEAM.
        </p>
      </main>
    </>
  );
}
