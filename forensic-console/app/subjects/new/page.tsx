import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import CaseJurisdictionRibbon from '@/components/CaseJurisdictionRibbon';
import { getCaseById } from '@/lib/db';
import NewSubjectForm from './new-subject-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Enroll subject — SendWiseForensic',
};

/**
 * /subjects/new?caseId=... — enroll a Subject under an existing case.
 *
 * Subjects INHERIT the case's jurisdiction. There is no picker here.
 * If the caller lands on this page without ?caseId, they are redirected
 * to /cases so they can pick a case first (or create one).
 */
export default async function NewSubjectPage({
  searchParams,
}: {
  searchParams?: { caseId?: string };
}) {
  if (!searchParams?.caseId) {
    redirect('/cases');
  }
  const supabase = createClient(await cookies());
  const c = await getCaseById(supabase, searchParams.caseId);
  if (!c) notFound();

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 text-xs">
          <Link href={`/cases/${c.id}`} className="text-muted hover:text-ink">
            ← Back to case
          </Link>
        </div>
        <PageHeader
          eyebrow="Enroll a subject"
          title="Subject enrolment"
          subtitle={
            <>
              Subject will be attached to case{' '}
              <span className="font-mono">{c.externalCaseRef}</span>.
              Jurisdiction is inherited from the case and locked.
            </>
          }
        />
        <CaseJurisdictionRibbon jurisdiction={c.jurisdiction} />
        <div className="mt-8">
          <NewSubjectForm caseId={c.id} jurisdiction={c.jurisdiction} />
        </div>
      </main>
    </>
  );
}
