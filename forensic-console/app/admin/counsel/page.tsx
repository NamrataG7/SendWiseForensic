import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminCounselPage() {
  const supabase = createClient(cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');
  const { data: me } = await supabase.from('officer').select('id, home_jurisdiction').eq('auth_user_id', user.id).maybeSingle();
  if (!me?.id) redirect('/admin/login?denied=no_officer_row_for_auth_user');
  const { data: roleRows } = await supabase.from('officer_role').select('role:role_id ( name )').eq('officer_id', me.id).is('revoked_at', null);
  const isAdmin = (roleRows ?? []).some((r: any) => r.role?.name === 'ADMIN');
  if (!isAdmin) redirect('/admin/login?denied=not_admin');

  const { data: pending } = await supabase
    .from('counsel_access_request')
    .select('id, full_name, bar_council_id, email, case_ref, jurisdiction, reason, status, created_at')
    .in('status', ['PENDING'])
    .eq('jurisdiction', me.home_jurisdiction)
    .order('created_at', { ascending: false });

  const { data: recent } = await supabase
    .from('counsel_access_request')
    .select('id, full_name, email, case_ref, status, granted_until, approved_at')
    .in('status', ['APPROVED', 'GRANTED', 'REJECTED', 'REVOKED'])
    .eq('jurisdiction', me.home_jurisdiction)
    .order('approved_at', { ascending: false, nullsFirst: false })
    .limit(20);

  return (
    <>
      <TopNav isAdmin />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">Administration — {me.home_jurisdiction}</p>
        <h1 className="font-serif text-3xl text-slate-900 mb-6">Counsel Access Requests</h1>

        <section className="mb-10">
          <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">Pending</h2>
          <div className="border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 text-left">
                <tr>
                  <th className="py-2 px-3">Counsel</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Case ref</th>
                  <th className="py-2 px-3">Reason</th>
                  <th className="py-2 px-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {(pending ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2 px-3">{r.full_name}<div className="text-xs text-slate-500">Bar ID {r.bar_council_id}</div></td>
                    <td className="py-2 px-3 text-slate-600">{r.email}</td>
                    <td className="py-2 px-3">{r.case_ref}</td>
                    <td className="py-2 px-3 text-xs text-slate-600 max-w-xs">{r.reason}</td>
                    <td className="py-2 px-3">
                      <div className="flex gap-2">
                        <form action="/api/counsel/decide" method="post">
                          <input type="hidden" name="request_id" value={r.id} />
                          <input type="hidden" name="action" value="approve" />
                          <button className="text-xs uppercase tracking-widest bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1">Approve</button>
                        </form>
                        <form action="/api/counsel/decide" method="post">
                          <input type="hidden" name="request_id" value={r.id} />
                          <input type="hidden" name="action" value="reject" />
                          <input name="reject_reason" placeholder="reason" className="border border-slate-300 text-xs px-2 py-1" />
                          <button className="ml-1 text-xs uppercase tracking-widest text-red-700 border border-red-300 hover:bg-red-50 px-3 py-1">Reject</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!pending || pending.length === 0) && (
                  <tr><td colSpan={5} className="text-center py-4 text-slate-500">No pending requests.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-2">Recent decisions</h2>
          <div className="border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 text-left">
                <tr><th className="py-2 px-3">Counsel</th><th className="py-2 px-3">Case</th><th className="py-2 px-3">Status</th><th className="py-2 px-3">Granted until</th></tr>
              </thead>
              <tbody>
                {(recent ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2 px-3">{r.full_name}<div className="text-xs text-slate-500">{r.email}</div></td>
                    <td className="py-2 px-3">{r.case_ref}</td>
                    <td className="py-2 px-3">{r.status}</td>
                    <td className="py-2 px-3 text-xs text-slate-500">{r.granted_until ? new Date(r.granted_until).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {(!recent || recent.length === 0) && (
                  <tr><td colSpan={4} className="text-center py-4 text-slate-500">No decisions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
