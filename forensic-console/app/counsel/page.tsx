import { cookies } from 'next/headers';
import CounselRequestForm from './request-form';
import TopNav from '@/components/TopNav';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export default async function CounselLandingPage() {
  const supabase = createClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If signed in as counsel (via magic-link) show their case portal.
  if (user) {
    const email = user.email?.toLowerCase();
    const { data: granted } = await supabase
      .from('counsel_access_request')
      .select('id, case_id, case_ref, jurisdiction, granted_until, status')
      .eq('email', email)
      .eq('status', 'GRANTED')
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (granted) {
      const { data: warrants } = await supabase
        .from('authorization')
        .select('id, type, legitimate_aim, issued_on, expires_on, status, statute_references')
        .eq('case_id', granted.case_id);
      return (
        <>
          <TopNav />
          <main className="mx-auto max-w-4xl px-4 py-10">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Counsel Portal</p>
            <h1 className="font-serif text-3xl text-slate-900 mb-4">Case {granted.case_ref}</h1>
            <p className="text-sm text-slate-600 mb-6">
              Access granted until {new Date(granted.granted_until!).toLocaleString()}.
              Jurisdiction: {granted.jurisdiction}. Metadata only — you cannot view evidence content.
            </p>
            <section className="mb-8">
              <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">Warrants on this case</h2>
              <div className="border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 text-left">
                    <tr>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Legitimate aim</th>
                      <th className="py-2 px-3">Issued</th>
                      <th className="py-2 px-3">Expires</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Statutes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(warrants ?? []).map((w: any) => (
                      <tr key={w.id} className="border-t border-slate-100">
                        <td className="py-2 px-3">{w.type}</td>
                        <td className="py-2 px-3">{w.legitimate_aim}</td>
                        <td className="py-2 px-3 text-slate-500 text-xs">{new Date(w.issued_on).toLocaleString()}</td>
                        <td className="py-2 px-3 text-slate-500 text-xs">{new Date(w.expires_on).toLocaleString()}</td>
                        <td className="py-2 px-3">{w.status}</td>
                        <td className="py-2 px-3 text-xs">{(w.statute_references ?? []).join(', ')}</td>
                      </tr>
                    ))}
                    {(!warrants || warrants.length === 0) && (
                      <tr><td colSpan={6} className="text-center py-4 text-slate-500">No warrants recorded.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">File objection</h2>
              <form action="/api/counsel/objections" method="post" className="space-y-3 border border-slate-200 bg-white p-4">
                <input type="hidden" name="case_id" value={granted.case_id ?? ''} />
                <textarea name="grounds" required rows={4} placeholder="Grounds for objection..." className="w-full border border-slate-300 p-2 text-sm" />
                <button className="bg-indigo-800 hover:bg-indigo-900 text-white uppercase tracking-widest text-xs font-semibold px-4 py-2">File</button>
              </form>
            </section>
          </main>
        </>
      );
    }
  }

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">SendWiseForensic — Counsel / Auditor Portal</p>
        <h1 className="font-serif text-3xl text-slate-900 mb-3">Request access</h1>
        <p className="text-sm text-slate-600 mb-6">
          Defense counsel or Judicial auditors may request access to warrant metadata and objection filing on a specific case.
          An administrator will review the request and, if approved, a scoped magic-link is emailed to you.
        </p>
        <CounselRequestForm />
      </main>
    </>
  );
}
