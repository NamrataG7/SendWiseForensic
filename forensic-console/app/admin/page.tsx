import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminHomePage() {
  const supabase = createClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const { data: roleRows } = await supabase
    .from('officer_role')
    .select('role_name')
    .eq('officer_id', user.id);
  const isAdmin = (roleRows ?? []).some((r) => r.role_name === 'ADMIN');
  if (!isAdmin) redirect('/login');

  const { data: officers } = await supabase
    .from('officer_with_role')
    .select('id, full_name, email, designation, home_jurisdiction, roles, status, created_at')
    .order('created_at', { ascending: false });

  const { data: pending } = await supabase
    .from('officer_invitation')
    .select('id, email, full_name, role_name, home_jurisdiction, created_at, expires_at, used_at')
    .is('used_at', null)
    .order('created_at', { ascending: false });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">SendWiseForensic — Administration</p>
          <h1 className="font-serif text-3xl text-slate-900">Officer Management</h1>
        </div>
        <Link
          href="/admin/officers/new"
          className="bg-indigo-800 hover:bg-indigo-900 text-white uppercase tracking-widest text-xs font-semibold px-5 py-3"
        >
          Invite Officer
        </Link>
      </div>

      <section className="mb-12">
        <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-3">Active officers</h2>
        <div className="border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Jurisdiction</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {(officers ?? []).map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="py-3 px-4">{o.full_name}</td>
                  <td className="py-3 px-4 text-slate-600">{o.email}</td>
                  <td className="py-3 px-4 text-slate-600">
                    {(o.roles as string[] | null)?.filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="py-3 px-4">{o.home_jurisdiction}</td>
                  <td className="py-3 px-4">
                    <span className={
                      o.status === 'ACTIVE'
                        ? 'text-emerald-700'
                        : 'text-slate-400'
                    }>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
              {(!officers || officers.length === 0) && (
                <tr>
                  <td className="py-6 px-4 text-center text-slate-500" colSpan={5}>
                    No officers yet. Invite one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-3">Pending invitations</h2>
        <div className="border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Jurisdiction</th>
                <th className="py-3 px-4">Expires</th>
              </tr>
            </thead>
            <tbody>
              {(pending ?? []).map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-3 px-4">{p.email}</td>
                  <td className="py-3 px-4">{p.full_name}</td>
                  <td className="py-3 px-4 text-slate-600">{p.role_name}</td>
                  <td className="py-3 px-4">{p.home_jurisdiction}</td>
                  <td className="py-3 px-4 text-slate-500 text-xs">{new Date(p.expires_at).toLocaleString()}</td>
                </tr>
              ))}
              {(!pending || pending.length === 0) && (
                <tr>
                  <td className="py-6 px-4 text-center text-slate-500" colSpan={5}>
                    No pending invitations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-10 text-xs text-slate-500">
        Admin action logging is scoped to <code>audit_log</code> with role <code>ADMIN</code>.
        Admins cannot access cases or evidence. See <code>docs/ADMIN_BOOTSTRAP.md</code> and
        <code>docs/PROTOTYPE_NOTICE.md</code>.
      </p>
    </main>
  );
}
