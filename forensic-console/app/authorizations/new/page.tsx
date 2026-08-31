import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import WizardClient from './wizard-client';

export const dynamic = 'force-dynamic';

export default function NewAuthorizationPage() {
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Application for Interception / Monitoring"
          title="Issue a new Authorization"
          subtitle="Prepared under IT Act §69 read with the IT (Procedure & Safeguards for Interception, Monitoring and Decryption) Rules, 2009. Every field is governed by a specific statute — cited beside the field."
        />
        <div className="mt-8">
          <WizardClient />
        </div>
      </main>
    </>
  );
}
