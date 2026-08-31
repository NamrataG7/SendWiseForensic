import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import CreateCaseForm from './create-form';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'New Case — SendWiseForensic',
};

/**
 * Case creation is the ONLY surface in the console that presents a
 * jurisdiction picker. Every downstream artifact (subject, authorization,
 * evidence) inherits the case's jurisdiction and cannot deviate — see
 * supabase/migrations/20260831120000_jurisdiction_fields.sql for the
 * immutability triggers.
 */
export default async function NewCasePage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Open a new case"
          title="Register a case"
          subtitle="Jurisdiction is chosen once, at case creation, and cannot be changed. This determines which statute cites, competent authority list, and duration limits apply to every authorization filed under this case."
        />
        <CreateCaseForm />
      </main>
    </>
  );
}
