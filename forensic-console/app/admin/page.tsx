import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AdminHomePage() {
  const supabase = createClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  // Look up officer by auth_user_id, then their roles. Use maybeSingle so a
  // missing officer row does not throw; instead we surface the reason.
  const { data: me, error: meErr } = await supabase
    .from('officer')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  const officerId = me?.id;
  let isAdmin = false;
  let denialReason: string | null = null;
  if (meErr) denialReason = `officer_lookup_error:${meErr.message}`;
  if (!officerId) denialReason = denialReason ?? 'no_officer_row_for_auth_user';
  if (officerId) {
    const { data: roleRows, error: roleErr } = await supabase
      .from('officer_role')
      .select('role:role_id ( name )')
      .eq('officer_id', officerId)
      .is('revoked_at', null);
    if (roleErr) denialReason = `role_lookup_error:${roleErr.message}`;
    isAdmin = (roleRows ?? []).some(
      (r: any) => r.role?.name === 'ADMIN',
    );
    if (!isAdmin && !denialReason) denialReason = 'not_admin';
  }
  if (!isAdmin) {
    // Send back to /admin/login with the reason so the user can see why.
    redirect(`/admin/login?denied=${encodeURIComponent(denialReason ?? 'unknown')}`);
  }

  const { data: officers } = await supabase
    .from('officer_with_role')
    .select('id, full_name, email, organization, home_jurisdiction, jurisdiction, roles, active, created_at')
    .order('created_at', { ascending: false });

  const { data: pending } = await supabase
    .from('officer_invitation')
    .select('id, email, full_name, role_name, home_jurisdiction, created_at, expires_at, used_at')
    .is('used_at', null)
    .order('created_at', { ascending: false });

  return (
    <>
      <TopNav isAdmin />
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
        <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-3">Officers</h2>
        <div className="border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Roles</th>
                <th className="py-3 px-4">Home jurisdiction</th>
                <th className="py-3 px-4">Active</th>
              </tr>
            </thead>
            <tbody>
              {(officers ?? []).map((o: any) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="py-3 px-4">{o.full_name}</td>
                  <td className="py-3 px-4 text-slate-600">{o.email}</td>
                  <td className="py-3 px-4 text-slate-600">
                    {(o.roles as string[] | null)?.filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="py-3 px-4">{o.home_jurisdiction ?? o.jurisdiction}</td>
                  <td className="py-3 px-4">
                    <span className={o.active ? 'text-emerald-700' : 'text-slate-400'}>
                      {o.active ? 'ACTIVE' : 'INACTIVE'}
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
              {(pending ?? []).map((p: any) => (
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
    </>
  );
}
