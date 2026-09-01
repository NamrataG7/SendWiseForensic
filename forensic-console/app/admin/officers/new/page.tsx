import InviteOfficerForm from './invite-form';

export const dynamic = 'force-dynamic';

export default function NewOfficerInvitePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs uppercase tracking-widest text-slate-500 mb-2">SendWiseForensic — Administration</p>
      <h1 className="font-serif text-3xl text-slate-900 mb-2">Invite Officer</h1>
      <p className="text-sm text-slate-600 mb-8">
        The invitee will receive an email magic-link. On first click, they set their own password and land on onboarding for their assigned home jurisdiction. Invitation expires in 48 hours.
      </p>
      <InviteOfficerForm />
    </main>
  );
}
