import AcceptInviteForm from './accept-invite-form';

export const dynamic = 'force-dynamic';

export default function AcceptInvitePage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <p className="text-xs uppercase tracking-widest text-slate-500 mb-3">SendWiseForensic</p>
      <h1 className="font-serif text-3xl text-slate-900 mb-3">Complete Officer Onboarding</h1>
      <p className="text-sm text-slate-600 mb-8">
        You clicked a magic-link from an administrator. Set your password below. Your role and home jurisdiction were assigned by the administrator and will apply immediately.
      </p>
      <AcceptInviteForm />
    </main>
  );
}
