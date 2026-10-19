import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import EmptyRegister from '@/components/EmptyRegister';
import { Pill } from '@/components/Pill';
import { JurisdictionPillLight } from '@/components/JurisdictionPill';
import { listPendingAuthorizations, listPendingExtensions } from '@/lib/db';
import { resolveCaller } from '@/lib/api';
import type { Jurisdiction } from '@/lib/entities';
import ApproveForm from './approve-form';
import ExtensionDecideForm from './extension-decide-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Authorizations — SendWiseForensic',
};

/**
 * Review Committee console.
 *
 * Mirrors app/filter-team/page.tsx's structure: resolveCaller + role
 * gate, "not authorised" red-box pattern, jurisdiction-locked rows.
 *
 * Two queues:
 *  - Pending warrant approvals (authorization.status = PENDING_REVIEW)
 *  - Pending extension decisions (authorization_extension.decision_status
 *    = PENDING), joined to the parent authorization for context.
 *
 * No new RLS policy needed: authorization_oversight_read already grants
 * REVIEW_COMMITTEE cross-case SELECT on `authorization`
 * (supabase/migrations/20260831110906_rls_and_query_gates.sql), and
 * authorization_extension's extension_case_officer_read policy is
 * USING (true) for all authenticated officers
 * (supabase/migrations/20260903000000_counsel_review_extension.sql) —
 * confirmed by direct read of both migrations.
 */
export default async function AuthorizationsQueuePage() {
  const supabase = createClient(await cookies());
  const caller = await resolveCaller(supabase);
  const authorised = caller.ok && caller.roles.includes('REVIEW_COMMITTEE');
  const home: Jurisdiction | null = caller.ok ? caller.homeJurisdiction : null;

  const pendingAuths = authorised
    ? await listPendingAuthorizations(supabase, { limit: 200 })
    : [];
  const pendingExtensions = authorised
    ? await listPendingExtensions(supabase, { limit: 200 })
    : [];

  // Batch-fetch case + subject display context for both queues.
  const caseIds = new Set<string>();
  const subjectIds = new Set<string>();
  for (const a of pendingAuths) {
    caseIds.add(a.caseId);
    subjectIds.add(a.subjectId);
  }
  for (const e of pendingExtensions) {
    caseIds.add(e.caseId);
    subjectIds.add(e.subjectId);
  }

  const caseRefById = new Map<string, string>();
  const subjectLabelById = new Map<string, string>();
  if (authorised && caseIds.size > 0) {
    const { data } = await supabase
      .from('case')
      .select('id, external_case_ref')
      .in('id', Array.from(caseIds));
    for (const row of (data ?? []) as Array<{
      id: string;
      external_case_ref: string;
    }>) {
      caseRefById.set(row.id, row.external_case_ref);
    }
  }
  if (authorised && subjectIds.size > 0) {
    const { data } = await supabase
      .from('subject')
      .select('id, pseudonymous_label')
      .in('id', Array.from(subjectIds));
    for (const row of (data ?? []) as Array<{
      id: string;
      pseudonymous_label: string;
    }>) {
      subjectLabelById.set(row.id, row.pseudonymous_label);
    }
  }

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Review Committee"
          title="Authorization queue"
          subtitle="Pending warrant approvals and extension decisions requiring Review Committee action. Decisions are audit-logged."
        />

        {!authorised ? (
          <div className="mt-8 border border-red-200 bg-red-50 p-6 text-sm text-warning">
            This console is restricted to officers holding the
            REVIEW_COMMITTEE role.
          </div>
        ) : (
          <>
            {/* Pending warrant approvals */}
            <section className="mt-10">
              <p className="eyebrow mb-3">Pending warrant approvals</p>
              {pendingAuths.length === 0 ? (
                <EmptyRegister
                  title="Nothing pending"
                  body="No authorizations are awaiting initial Review Committee approval."
                />
              ) : (
                <div className="overflow-x-auto border border-slate-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-register text-muted">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Case</th>
                        <th className="px-4 py-3 font-semibold">
                          Jurisdiction
                        </th>
                        <th className="px-4 py-3 font-semibold">Subject</th>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Issued</th>
                        <th className="px-4 py-3 font-semibold">
                          Authorization
                        </th>
                        <th className="px-4 py-3 font-semibold">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingAuths.map((a) => {
                        const locked = !!home && a.jurisdiction !== home;
                        return (
                          <tr
                            key={a.id}
                            className={`border-b border-slate-100 last:border-0 align-top ${locked ? 'bg-slate-50/70' : ''}`}
                          >
                            <td className="px-4 py-3 text-xs text-ink">
                              <Link
                                href={`/cases/${a.caseId}?tab=authorizations`}
                                className="hover:underline"
                              >
                                {caseRefById.get(a.caseId) ?? a.caseId.slice(0, 8)}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <JurisdictionPillLight jurisdiction={a.jurisdiction} />
                            </td>
                            <td className="px-4 py-3 text-xs text-ink">
                              {subjectLabelById.get(a.subjectId) ??
                                a.subjectId.slice(0, 8)}
                            </td>
                            <td className="px-4 py-3">
                              <Pill tone="muted">{a.type}</Pill>
                            </td>
                            <td className="px-4 py-3 text-xs text-ink">
                              {a.issuedOn.toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/authorizations/${a.id}`}
                                className="font-mono text-[11px] text-muted hover:underline"
                              >
                                {a.id.slice(0, 8)}
                              </Link>
                            </td>
                            <td className="px-4 py-3 min-w-[260px]">
                              {locked ? (
                                <div className="border border-slate-300 bg-white p-3 text-xs text-muted">
                                  <p className="font-semibold uppercase tracking-register text-ink">
                                    Locked — outside home jurisdiction
                                  </p>
                                  <p className="mt-1">
                                    You do not have jurisdiction to decide
                                    this item. Request a grant.
                                  </p>
                                  <button
                                    type="button"
                                    disabled
                                    title="Admin can now grant this via /admin (P1.3) — self-service officer request UI is a separate, not-yet-built follow-up"
                                    className="mt-2 border border-slate-300 px-2 py-1 text-[10px] font-semibold uppercase tracking-register text-slate-500"
                                  >
                                    Request grant
                                  </button>
                                </div>
                              ) : (
                                <ApproveForm authorizationId={a.id} />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Pending extension decisions */}
            <section className="mt-10">
              <p className="eyebrow mb-3">Pending extension decisions</p>
              {pendingExtensions.length === 0 ? (
                <EmptyRegister
                  title="Nothing pending"
                  body="No warrant-extension requests are awaiting a Review Committee decision."
                />
              ) : (
                <div className="overflow-x-auto border border-slate-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-register text-muted">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Case</th>
                        <th className="px-4 py-3 font-semibold">
                          Jurisdiction
                        </th>
                        <th className="px-4 py-3 font-semibold">Subject</th>
                        <th className="px-4 py-3 font-semibold">
                          Current expiry
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          Requested new expiry
                        </th>
                        <th className="px-4 py-3 font-semibold">
                          Justification
                        </th>
                        <th className="px-4 py-3 font-semibold">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingExtensions.map((e) => {
                        const locked = !!home && e.jurisdiction !== home;
                        return (
                          <tr
                            key={e.id}
                            className={`border-b border-slate-100 last:border-0 align-top ${locked ? 'bg-slate-50/70' : ''}`}
                          >
                            <td className="px-4 py-3 text-xs text-ink">
                              <Link
                                href={`/cases/${e.caseId}?tab=authorizations`}
                                className="hover:underline"
                              >
                                {caseRefById.get(e.caseId) ?? e.caseId.slice(0, 8)}
                              </Link>
                            </td>
                            <td className="px-4 py-3">
                              <JurisdictionPillLight jurisdiction={e.jurisdiction} />
                            </td>
                            <td className="px-4 py-3 text-xs text-ink">
                              {subjectLabelById.get(e.subjectId) ??
                                e.subjectId.slice(0, 8)}
                            </td>
                            <td className="px-4 py-3 text-xs text-ink">
                              {e.currentExpiresOn.toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-xs text-ink">
                              {e.requestedNewExpiresOn.toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-xs text-ink">
                              {e.justification}
                              <p className="mt-1 font-mono text-[10px] text-muted">
                                {e.statuteReference}
                              </p>
                            </td>
                            <td className="px-4 py-3 min-w-[260px]">
                              {locked ? (
                                <div className="border border-slate-300 bg-white p-3 text-xs text-muted">
                                  <p className="font-semibold uppercase tracking-register text-ink">
                                    Locked — outside home jurisdiction
                                  </p>
                                  <p className="mt-1">
                                    You do not have jurisdiction to decide
                                    this item. Request a grant.
                                  </p>
                                  <button
                                    type="button"
                                    disabled
                                    title="Admin can now grant this via /admin (P1.3) — self-service officer request UI is a separate, not-yet-built follow-up"
                                    className="mt-2 border border-slate-300 px-2 py-1 text-[10px] font-semibold uppercase tracking-register text-slate-500"
                                  >
                                    Request grant
                                  </button>
                                </div>
                              ) : (
                                <ExtensionDecideForm extensionId={e.id} />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
