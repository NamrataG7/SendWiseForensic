import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';
import { Pill, DummyVerifiedPill } from '@/components/Pill';
import { getAuthorizationById } from '@/lib/db';
import ObjectionForm from './objection-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Counsel Portal — SendWiseForensic',
};

/**
 * Defense-counsel portal.
 *
 * Two modes:
 *   - Landing (no `token` query param): explains what counsel can see
 *     and how to request a magic-link.
 *   - Scoped view (with `?token=…&auth=…&counselId=…`): renders warrant
 *     metadata for the named authorization and offers an objection form.
 *
 * TODO(COUNSEL-PORTAL): the token is currently a placeholder credential;
 * a real system would issue a signed short-lived JWT via email/SMS and
 * resolve `counselId` from the token, not the URL.
 */
export default async function CounselPortalPage({
  searchParams,
}: {
  searchParams?: { token?: string; auth?: string; counselId?: string };
}) {
  const token = searchParams?.token;
  const authorizationId = searchParams?.auth;
  const counselOfficerId = searchParams?.counselId;

  const isScoped =
    Boolean(token) && Boolean(authorizationId) && Boolean(counselOfficerId);

  let authorization = null;
  if (isScoped) {
    const supabase = createClient(await cookies());
    authorization = await getAuthorizationById(supabase, authorizationId!);
  }

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Defense Counsel / Judicial Auditor portal"
          title={
            isScoped
              ? 'Warrant metadata — scoped counsel view'
              : 'Subject-side access to warrant metadata'
          }
          subtitle={
            isScoped
              ? 'You are viewing the metadata visible to defense counsel for a single authorization. Evidence content is not shown here.'
              : 'This portal exists so that the person whose device is under supervision — through their counsel — can see the scope, duration, and categories of what has been authorised, and file objections before the Review Committee.'
          }
        />

        {isScoped ? (
          <>
            <section className="mt-8 border border-slate-200 bg-white p-6">
              <p className="eyebrow mb-3">Authorization</p>
              {!authorization ? (
                <p className="text-sm text-warning">
                  Authorization not visible to this counsel session. Either
                  the authorization ID is wrong, the token has expired, or
                  no objection has yet linked counsel to this direction.
                </p>
              ) : (
                <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-register text-muted">
                      Authorization ID
                    </dt>
                    <dd className="font-mono text-ink break-all">
                      {authorization.id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-register text-muted">
                      Status
                    </dt>
                    <dd>
                      <Pill
                        tone={
                          authorization.status === 'ACTIVE'
                            ? 'success'
                            : 'muted'
                        }
                      >
                        {authorization.status}
                      </Pill>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-register text-muted">
                      Issued on
                    </dt>
                    <dd className="text-ink">
                      {authorization.issuedOn.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-register text-muted">
                      Expires on
                    </dt>
                    <dd className="text-ink">
                      {authorization.expiresOn.toLocaleString()}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-register text-muted">
                      Data categories
                    </dt>
                    <dd className="text-ink">
                      {(authorization.scope?.dataCategories ?? []).join(' · ') || '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-register text-muted">
                      Statutory basis
                    </dt>
                    <dd className="font-mono text-xs text-ink">
                      {authorization.statuteReferences.join(', ')}
                    </dd>
                  </div>
                </dl>
              )}
              <div className="mt-4">
                <DummyVerifiedPill />
              </div>
            </section>

            {authorization && (
              <section className="mt-6 border border-slate-200 bg-white p-6">
                <p className="eyebrow mb-3">File an objection</p>
                <p className="mb-4 text-sm text-muted">
                  Grounds may include scope drift, proportionality failure,
                  expired duration, or violation of privilege categories.
                  Objections are placed before the Review Committee (2009
                  Rules R.22).
                </p>
                <ObjectionForm
                  authorizationId={authorization.id}
                  magicLinkToken={token!}
                  counselOfficerId={counselOfficerId!}
                />
              </section>
            )}
          </>
        ) : (
          <>
            <section className="mt-8 border border-slate-200 bg-white p-6">
              <p className="eyebrow mb-3">What counsel can see</p>
              <ul className="space-y-3 text-sm text-ink">
                <li>
                  <strong className="font-semibold">Warrant metadata:</strong>{' '}
                  issuing authority, issue and expiry dates, statutory
                  basis, data categories authorised.
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
                  the status of any objection filed by counsel and the
                  Review Committee&rsquo;s disposition.
                </li>
              </ul>
            </section>

            <section className="mt-6 border border-slate-200 bg-white p-6">
              <p className="eyebrow mb-3">What counsel cannot see</p>
              <ul className="space-y-2 text-sm text-muted">
                <li>Raw payloads or evidence content.</li>
                <li>Case-officer notes or other cases on the same docket.</li>
                <li>
                  Contents of privileged material auto-quarantined by the
                  Filter Team.
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
                  Prototype — Bar Council ID verification is stubbed (TODO COUNSEL-PORTAL)
                </Pill>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
