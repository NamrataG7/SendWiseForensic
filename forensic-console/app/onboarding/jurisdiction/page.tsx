import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import OnboardingClient from './onboarding-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Set your home jurisdiction — SendWiseForensic',
};

export default async function OnboardingJurisdictionPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: officer } = await supabase
    .from('officer')
    .select('id, home_jurisdiction')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  const current =
    (officer as { home_jurisdiction: 'IN' | 'US' | 'UK' | null } | null)
      ?.home_jurisdiction ?? null;

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Complete onboarding"
          title="Choose your home jurisdiction"
          subtitle="Your home jurisdiction determines which cases you can access by default. Changes require an administrative grant. TODO(SUPPORT-HOME-JURISDICTION-CHANGE-VIA-ADMIN)."
        />
        <OnboardingClient current={current} />
      </main>
    </>
  );
}
