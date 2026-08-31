import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import { JurisdictionPill } from '@/components/JurisdictionPill';
import { getCaseById } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * New subject under a case. Subject.jurisdiction is server-derived from
 * Case.jurisdiction (immutable at the DB) — there is NO jurisdiction
 * selector on this page. See supabase/migrations/20260831120000 for the
 * jurisdiction-matches-case guard.
 */
export default async function NewSubjectPage({
  params,
}: {
  params: { caseId: string };
}) {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const kase = await getCaseById(supabase, params.caseId);
  if (!kase) notFound();

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow={`Case ${kase.externalCaseRef}`}
          title="Register a subject"
          subtitle="Subject.jurisdiction is inherited from the parent case and cannot be changed. Cross-jurisdiction subjects are modelled as distinct subject rows per jurisdiction."
        />

        <section className="mt-8 border border-slate-200 bg-white p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-2 text-xs">
            <span className="uppercase tracking-register text-muted">
              Jurisdiction (inherited):
            </span>
            <JurisdictionPill jurisdiction={kase.jurisdiction} locked />
          </div>

          <p className="text-sm text-muted">
            TODO(SUBJECT-FORM) — the subject registration form (pseudonym,
            identity hashes) is a separate lane. This page currently only
            demonstrates the inherited-jurisdiction lock; use the API
            surface for now.
          </p>

          <p className="mt-4 font-mono text-xs text-muted break-all">
            case_id: {kase.id}
          </p>
        </section>
      </main>
    </>
  );
}
