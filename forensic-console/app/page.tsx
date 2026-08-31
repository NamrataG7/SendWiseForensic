import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Landing → route to /cases when authenticated, else /login.
 *
 * TODO(WIRE-TO-SCHEMA): once Officer↔user mapping lands, also branch on role
 * (DEFENSE_COUNSEL → /counsel, JUDICIAL_AUDITOR → /audit).
 */
export default async function LandingPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect('/cases');
  }
  redirect('/login');
}
