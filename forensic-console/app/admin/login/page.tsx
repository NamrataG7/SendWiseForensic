import AdminLoginForm from './admin-login-form';

export const dynamic = 'force-dynamic';

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams?: { denied?: string };
}) {
  const denied = searchParams?.denied;
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">SendWiseForensic — Administration</p>
      <h1 className="font-serif text-3xl text-slate-900 mb-3">Admin Sign-In</h1>
      <p className="text-sm text-slate-600 mb-8">
        Administrative access. Restricted to accounts provisioned by <code className="text-xs">docs/ADMIN_BOOTSTRAP.md</code>. Admins create officer accounts; admins do not access cases or evidence.
      </p>
      {denied && (
        <div className="mb-6 border border-amber-300 bg-amber-50 text-amber-900 text-sm p-3">
          <div className="font-semibold uppercase text-xs tracking-widest mb-1">Access denied</div>
          Reason: <code className="text-xs">{denied}</code>
          <div className="mt-2 text-xs">
            If this says <code>no_officer_row_for_auth_user</code> or <code>not_admin</code>, complete the SQL in <code>docs/ADMIN_BOOTSTRAP.md</code>.
          </div>
        </div>
      )}
      <AdminLoginForm />
      <div className="mt-8 pt-6 border-t border-slate-200 text-xs text-slate-500">
        Not an admin? <a className="text-indigo-700 hover:underline" href="/login">Officer sign-in</a>
      </div>
    </main>
  );
}
