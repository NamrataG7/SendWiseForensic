import Link from 'next/link';
import LoginForm from './login-form';

export const metadata = {
  title: 'Officer Sign-In — SendWiseForensic',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="eyebrow mb-3">SendWiseForensic</p>
          <h1 className="font-serif text-3xl text-ink">Officer Sign-In</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Access is restricted to officers with an assigned case docket. All
            sessions are logged to the tamper-evident audit chain per IT Act
            §72 and the 2009 Interception Rules.
          </p>
        </div>

        <div className="border border-slate-200 bg-white p-8 shadow-register">
          <LoginForm />
        </div>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <p className="eyebrow mb-2">Non-officer access</p>
          <div className="flex flex-col gap-1 text-sm">
            <Link
              href="/counsel"
              className="text-primary hover:underline"
            >
              Judicial Auditor or Defense Counsel sign-in →
            </Link>
            <Link
              href="/prototype-notice"
              className="text-muted hover:text-ink hover:underline"
            >
              Read the prototype notice →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
