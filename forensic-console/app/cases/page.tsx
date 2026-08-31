import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import EmptyRegister from '@/components/EmptyRegister';
import { Pill } from '@/components/Pill';
import { JurisdictionPillLight } from '@/components/JurisdictionPill';
import {
  getCurrentOfficer,
  listAuthorizationsForCase,
  listCasesForCurrentOfficer,
  listSubjectsForCase,
} from '@/lib/db';
import type { Authorization, Case, Subject } from '@/lib/entities';

export const dynamic = 'force-dynamic';

function daysUntil(d: Date): number {
  const ms = d.getTime() - Date.now();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function statusTone(status: Case['status']) {
  switch (status) {
    case 'OPEN':
      return 'primary' as const;
    case 'UNDER_REVIEW':
      return 'muted' as const;
    case 'SEALED':
      return 'warning' as const;
    default:
      return 'muted' as const;
  }
}

export default async function CasesPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const officer = await getCurrentOfficer(supabase);
  const cases = officer ? await listCasesForCurrentOfficer(supabase) : [];

  const rows: {
    c: Case;
    subject: Subject | null;
    auth: Authorization | null;
  }[] = await Promise.all(
    cases.map(async (c) => {
      const [subjects, auths] = await Promise.all([
        listSubjectsForCase(supabase, c.id),
        listAuthorizationsForCase(supabase, c.id),
      ]);
      return {
        c,
        subject: subjects[0] ?? null,
        auth: auths.find((a) => a.status === 'ACTIVE') ?? null,
      };
    }),
  );

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow={
            officer
              ? `In the docket of ${officer.fullName}`
              : 'In the register'
          }
          title="Assigned Cases"
          subtitle={
            officer
              ? `Cases in which ${officer.fullName}${officer.organisation ? `, ${officer.organisation},` : ''} is a named investigating officer. Access is scoped to this docket; queries outside scope are refused at the data layer.`
              : 'No officer record is linked to your account. Contact your Supervising Officer to be added to the officer register.'
          }
          actions={
            <Link
              href="/cases/new"
              className="whitespace-nowrap bg-primary px-4 py-2.5 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover"
            >
              New Case
            </Link>
          }
        />

        {officer?.homeJurisdiction && (
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
            <span className="uppercase tracking-register text-muted">
              Filter:
            </span>
            <span className="inline-flex items-center gap-2 border border-ink bg-ink px-2 py-1 font-semibold uppercase tracking-register text-white">
              Home: {officer.homeJurisdiction}
            </span>
            <button
              type="button"
              className="border border-slate-300 px-2 py-1 uppercase tracking-register text-muted hover:border-ink hover:text-ink"
              title="TODO(CROSS-JURISDICTION-FILTER-UI) — activates once grants are queryable client-side"
            >
              Show all jurisdictions I have grants for
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="mt-8">
            <EmptyRegister
              title="No cases assigned to you"
              body="Cases appear here once a Supervising Officer assigns your service ID to a docket. Queries against cases outside your docket are refused by the scope-rewriting query layer."
            />
          </div>
        ) : (
          <div className="mt-8 border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-register text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Case Ref</th>
                  <th className="px-4 py-3 font-semibold">Jurisdiction</th>
                  <th className="px-4 py-3 font-semibold">Subject</th>
                  <th className="px-4 py-3 font-semibold">Offences</th>
                  <th className="px-4 py-3 font-semibold">Active Authz.</th>
                  <th className="px-4 py-3 font-semibold">Expires in</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, subject, auth }) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-4">
                      <Link
                        href={`/cases/${c.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.externalCaseRef}
                      </Link>
                      <div className="mt-0.5 font-mono text-[11px] text-muted">
                        {c.id}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <JurisdictionPillLight jurisdiction={c.jurisdiction} />
                    </td>
                    <td className="px-4 py-4">
                      {subject ? (
                        <span className="font-medium text-ink">
                          {subject.pseudonymousLabel}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {c.offences.map((o) => (
                          <span
                            key={o}
                            className="border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700"
                          >
                            {o}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {auth ? (
                        <Link
                          href={`/authorizations/${auth.id}`}
                          className="text-primary hover:underline"
                        >
                          {auth.id}
                        </Link>
                      ) : (
                        <span className="text-muted">None</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {auth ? (
                        <span className="text-ink">
                          {daysUntil(auth.expiresOn)} days
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Pill tone={statusTone(c.status)}>
                        {c.status.replace('_', ' ')}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
