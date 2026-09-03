import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function safe<T>(fn: () => Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message ?? String(e) };
  }
}

export default async function AdminHomePage() {
  const supabase = createClient(cookies());

  const authRes = await safe(async () => (await supabase.auth.getUser()).data.user);
  if (authRes.error) {
    return renderShell(<Banner label="Auth error">{authRes.error}</Banner>);
  }
  const user = authRes.data;
  if (!user) redirect('/admin/login');

  const meRes = await safe(async () => {
    const q = await supabase
      .from('officer')
      .select('id, home_jurisdiction, full_name, email')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (q.error) throw q.error;
    return q.data;
  });
  if (meRes.error) {
    return renderShell(<Banner label="Officer lookup error">{meRes.error}</Banner>);
  }
  const me = meRes.data as { id?: string; home_jurisdiction?: 'IN' | 'US' | 'UK' } | null;
  const officerId = me?.id;
  if (!officerId) {
    redirect(`/admin/login?denied=${encodeURIComponent('no_officer_row_for_auth_user')}`);
  }

  const roleRes = await safe(async () => {
    const q = await supabase
      .from('officer_role')
      .select('role:role_id ( name )')
      .eq('officer_id', officerId)
      .is('revoked_at', null);
    if (q.error) throw q.error;
    return q.data;
  });
  if (roleRes.error) {
    return renderShell(
      <Banner label="Role query error">
        {roleRes.error}. Ensure supabase/migrations/20260902000000_officer_self_read_rls.sql is applied.
      </Banner>,
    );
  }
  const isAdmin = (roleRes.data ?? []).some((r: any) => r.role?.name === 'ADMIN');
  if (!isAdmin) {
    redirect(`/admin/login?denied=${encodeURIComponent('not_admin')}`);
  }

  const myJurisdiction = (me?.home_jurisdiction ?? 'IN') as 'IN' | 'US' | 'UK';

  const officersRes = await safe(async () => {
    const q = await supabase
      .from('officer_with_role')
      .select('id, full_name, email, organization, home_jurisdiction, jurisdiction, roles, active, created_at')
      .eq('home_jurisdiction', myJurisdiction)
      .order('created_at', { ascending: false });
    if (q.error) throw q.error;
    return q.data ?? [];
  });
  const officers = officersRes.data ?? [];
  const officersErr = officersRes.error;

  const coRes = await safe(async () => {
    const q = await supabase
      .from('officer_invitation')
      .select('id, email, full_name, role_name, home_jurisdiction, invited_by, created_at, expires_at, status')
      .eq('status', 'PENDING_COAPPROVAL')
      .eq('home_jurisdiction', myJurisdiction)
      .order('created_at', { ascending: false });
    if (q.error) throw q.error;
    return q.data ?? [];
  });
  const pendingCoapproval = coRes.data ?? [];

  const sentRes = await safe(async () => {
    const q = await supabase
      .from('officer_invitation')
      .select('id, email, full_name, role_name, home_jurisdiction, coapproved_by, coapproved_at, expires_at, status')
      .in('status', ['APPROVED', 'SENT'])
      .is('used_at', null)
      .eq('home_jurisdiction', myJurisdiction)
      .order('created_at', { ascending: false });
    if (q.error) throw q.error;
    return q.data ?? [];
  });
  const pendingSend = sentRes.data ?? [];
  const invitationsErr = coRes.error || sentRes.error;

  return renderShell(
    <>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            SendWiseForensic — Administration — Jurisdiction: {myJurisdiction}
          </p>
          <h1 className="font-serif text-3xl text-slate-900">Officer Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            You can only see and invite officers for {myJurisdiction}. Officer invitations require a second admin (dual-control).
          </p>
        </div>
        <Link
          href="/admin/officers/new"
          className="bg-indigo-800 hover:bg-indigo-900 text-white uppercase tracking-widest text-xs font-semibold px-5 py-3"
        >
          Invite Officer
        </Link>
      </div>

      {(officersErr || invitationsErr) && (
        <div className="mb-6 border border-amber-300 bg-amber-50 text-amber-900 text-sm p-3">
          <div className="font-semibold uppercase text-xs tracking-widest mb-1">Migration pending</div>
          {invitationsErr && (
            <div>
              Invitation query failed: <code className="text-xs">{invitationsErr}</code>.
              Run <code>supabase/migrations/20260902000200_scoped_admin_and_coapproval.sql</code> in Supabase SQL Editor.
            </div>
          )}
          {officersErr && (
            <div className="mt-1">Officer query failed: <code className="text-xs">{officersErr}</code>.</div>
          )}
        </div>
      )}

      <section className="mb-12">
        <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-3">Officers ({myJurisdiction})</h2>
        <div className="border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Roles</th>
                <th className="py-3 px-4">Active</th>
                <th className="py-3 px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {officers.map((o: any) => {
                const isSelf = o.id === officerId;
                return (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="py-3 px-4">{o.full_name}</td>
                    <td className="py-3 px-4 text-slate-600">{o.email}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {(o.roles as string[] | null)?.filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={o.active ? 'text-emerald-700' : 'text-slate-400'}>
                        {o.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {isSelf ? (
                        <span className="text-slate-400 text-xs uppercase">(you)</span>
                      ) : (
                        <form action="/api/admin/officers/delete" method="post">
                          <input type="hidden" name="officer_id" value={o.id} />
                          <button className="text-xs uppercase tracking-widest text-red-700 border border-red-300 hover:bg-red-50 px-3 py-1">
                            Delete
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {officers.length === 0 && (
                <tr>
                  <td className="py-6 px-4 text-center text-slate-500" colSpan={5}>
                    No officers yet in {myJurisdiction}. Invite one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-3">Awaiting your co-approval</h2>
        <p className="text-xs text-slate-500 mb-2">
          Invitations created by another admin. Approving them sends the magic-link email. You cannot approve invitations you created.
        </p>
        <div className="border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Created by</th>
                <th className="py-3 px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingCoapproval.map((p: any) => {
                const isMine = p.invited_by === officerId;
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-3 px-4">{p.email}</td>
                    <td className="py-3 px-4">{p.full_name}</td>
                    <td className="py-3 px-4 text-slate-600">{p.role_name}</td>
                    <td className="py-3 px-4 text-slate-500 text-xs">{isMine ? '(you)' : p.invited_by}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        {isMine ? (
                          <span className="text-slate-400 text-xs uppercase self-center">Awaiting other admin</span>
                        ) : (
                          <form action="/api/admin/officers/coapprove" method="post">
                            <input type="hidden" name="invitation_id" value={p.id} />
                            <button className="text-xs uppercase tracking-widest bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1">
                              Approve
                            </button>
                          </form>
                        )}
                        <form action="/api/admin/officers/invite-delete" method="post">
                          <input type="hidden" name="invitation_id" value={p.id} />
                          <button className="text-xs uppercase tracking-widest text-red-700 border border-red-300 hover:bg-red-50 px-3 py-1">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pendingCoapproval.length === 0 && (
                <tr>
                  <td className="py-6 px-4 text-center text-slate-500" colSpan={5}>
                    No invitations awaiting co-approval.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-slate-500 mb-3">Sent invitations (pending sign-in)</h2>
        <div className="border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Expires</th>
                <th className="py-3 px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingSend.map((p: any) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-3 px-4">{p.email}</td>
                  <td className="py-3 px-4">{p.full_name}</td>
                  <td className="py-3 px-4 text-slate-600">{p.role_name}</td>
                  <td className="py-3 px-4 text-slate-500 text-xs">{new Date(p.expires_at).toLocaleString()}</td>
                  <td className="py-3 px-4">
                    <form action="/api/admin/officers/invite-delete" method="post">
                      <input type="hidden" name="invitation_id" value={p.id} />
                      <button className="text-xs uppercase tracking-widest text-red-700 border border-red-300 hover:bg-red-50 px-3 py-1">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {pendingSend.length === 0 && (
                <tr>
                  <td className="py-6 px-4 text-center text-slate-500" colSpan={5}>
                    No pending sent invitations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-10 text-xs text-slate-500">
        Admin actions logged to <code>audit_log</code>. Admin sees only {myJurisdiction}. See <code>docs/ADMIN_BOOTSTRAP.md</code>.
      </p>
    </>,
  );
}

function renderShell(children: React.ReactNode) {
  return (
    <>
      <TopNav isAdmin />
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
    </>
  );
}

function Banner({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-red-300 bg-red-50 text-red-900 text-sm p-4">
      <div className="font-semibold uppercase text-xs tracking-widest mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}
