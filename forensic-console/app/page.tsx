import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const supabase = createClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // If already signed in, jump to the appropriate console.
  if (user) {
    const { data: me } = await supabase
      .from('officer')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (me?.id) {
      const { data: roleRows } = await supabase
        .from('officer_role')
        .select('role:role_id ( name )')
        .eq('officer_id', me.id)
        .is('revoked_at', null);
      const isAdmin = (roleRows ?? []).some((r: any) => r.role?.name === 'ADMIN');
      redirect(isAdmin ? '/admin' : '/cases');
    }
    redirect('/cases');
  }

  return (
    <main className="min-h-[60vh] mx-auto max-w-3xl px-4 py-16">
      <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">SendWiseForensic</p>
      <h1 className="font-serif text-4xl text-slate-900 mb-4">Court-Ordered Digital Supervision</h1>
      <p className="text-sm text-slate-600 mb-10 max-w-xl">
        A warrant-first platform for lawful digital supervision under India IT Act §69 / 2009 Rules, US Title III, and UK Investigatory Powers Act 2016. Sign in below with the appropriate role.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/login" className="block border border-slate-200 bg-white p-6 hover:border-indigo-700 transition-colors">
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Sign in</div>
          <div className="font-serif text-xl text-slate-900 mb-1">Officer</div>
          <div className="text-xs text-slate-600">Investigating / Supervising / Filter Team / Prosecutor / DPO. Access cases, warrants, evidence.</div>
        </Link>
        <Link href="/admin/login" className="block border border-slate-200 bg-white p-6 hover:border-indigo-700 transition-colors">
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Sign in</div>
          <div className="font-serif text-xl text-slate-900 mb-1">Administrator</div>
          <div className="text-xs text-slate-600">Manage officer accounts for your jurisdiction. Dual-control invitations. Does not access cases or evidence.</div>
        </Link>
        <Link href="/counsel" className="block border border-slate-200 bg-white p-6 hover:border-indigo-700 transition-colors">
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Access</div>
          <div className="font-serif text-xl text-slate-900 mb-1">Counsel / Auditor</div>
          <div className="text-xs text-slate-600">Judicial Auditor or Defense Counsel portal. Warrant metadata + objections.</div>
        </Link>
      </div>

      <div className="mt-10 pt-6 border-t border-slate-200 text-xs text-slate-500">
        <Link href="/prototype-notice" className="text-red-700 hover:underline">Read the prototype notice</Link>
        <span className="mx-2">·</span>
        <a href="https://github.com/NamrataG7/SendWiseForensic" target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">Source</a>
      </div>
    </main>
  );
}
