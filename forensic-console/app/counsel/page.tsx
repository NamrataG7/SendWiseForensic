import Link from 'next/link';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import { Pill } from '@/components/Pill';

export const metadata = {
  title: 'Counsel Portal — SendWiseForensic',
};

export default function CounselLandingPage() {
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Defense Counsel / Judicial Auditor portal"
          title="Subject-side access to warrant metadata"
          subtitle="This portal exists so that the person whose device is under supervision — through their counsel — can see the scope, duration, and categories of what has been authorised, and file objections before the Review Committee."
        />

        <section className="mt-8 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">What counsel can see</p>
          <ul className="space-y-3 text-sm text-ink">
            <li>
              <strong className="font-semibold">Warrant metadata:</strong>{' '}
              issuing authority, issue and expiry dates, statutory basis,
              data categories authorised.
            </li>
            <li>
              <strong className="font-semibold">Devices authorised:</strong>{' '}
              which of the subject&rsquo;s devices are named in the direction.
            </li>
            <li>
              <strong className="font-semibold">
                Puttaswamy proportionality record:
              </strong>{' '}
              the four-prong justification submitted by the requesting
              officer.
            </li>
            <li>
              <strong className="font-semibold">Objections filed:</strong>{' '}
              the status of any objection filed by counsel and the Review
              Committee&rsquo;s disposition.
            </li>
          </ul>
        </section>

        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">What counsel cannot see</p>
          <ul className="space-y-2 text-sm text-muted">
            <li>Raw payloads or evidence content.</li>
            <li>Case-officer notes or other cases on the same docket.</li>
            <li>
              Contents of privileged material auto-quarantined by the Filter
              Team.
            </li>
          </ul>
        </section>

        <section className="mt-6 border border-slate-200 bg-white p-6">
          <p className="eyebrow mb-3">Filing an objection</p>
          <p className="text-sm text-ink">
            Objections are placed before the Review Committee constituted
            under 2009 Rules R.22. Grounds may include scope drift,
            proportionality failure, expired duration, or violation of
            privilege categories.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="#"
              className="border border-primary bg-white px-4 py-2 text-xs font-semibold uppercase tracking-register text-primary hover:bg-indigo-50"
            >
              Request magic-link access
            </Link>
            <Pill tone="warning">
              Prototype — Bar Council ID verification is stubbed
            </Pill>
          </div>
        </section>
      </main>
    </>
  );
}
