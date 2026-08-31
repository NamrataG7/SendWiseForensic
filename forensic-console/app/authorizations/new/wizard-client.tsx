'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import StatuteRef from '@/components/StatuteRef';
import { Pill, DummyVerifiedPill } from '@/components/Pill';

/**
 * Multi-step authorization issuance wizard.
 *
 * Steps:
 *   1. Case + Subject
 *   2. Legitimate Aim (IT Act §69 grounds — dropdown)
 *   3. Scope (data categories / devices / keywords / context apps)
 *   4. Puttaswamy Proportionality Checklist (4 prongs, all required)
 *   5. Competent Authority + signed order PDF upload
 *   6. Review Committee approval  (prototype stub)
 *   7. Confirmation
 *
 * On confirmation, POST /api/authorizations. The server re-runs
 * IndiaLegalFramework.validateAuthorization; any violation returned is
 * surfaced inline as a list under the confirmation card.
 */

const STEPS = [
  '1. Case + Subject',
  '2. Legitimate Aim',
  '3. Scope',
  '4. Proportionality',
  '5. Competent Authority',
  '6. Review Committee',
  '7. Confirmation',
];

const LEGITIMATE_AIMS: { value: string; label: string }[] = [
  { value: 'SOVEREIGNTY_INTEGRITY', label: 'Sovereignty and integrity of India' },
  { value: 'DEFENCE_OF_INDIA', label: 'Defence of India' },
  { value: 'SECURITY_OF_STATE', label: 'Security of the State' },
  { value: 'FRIENDLY_RELATIONS_FOREIGN_STATES', label: 'Friendly relations with foreign States' },
  { value: 'PUBLIC_ORDER', label: 'Public order' },
  {
    value: 'PREVENT_INCITEMENT_COGNIZABLE_OFFENCE',
    label: 'Preventing incitement to the commission of any cognizable offence',
  },
];

const DATA_CATEGORIES = [
  { value: 'KEYSTROKE', label: 'Keystrokes' },
  { value: 'APP_EVENT', label: 'App events' },
  { value: 'COMMS_METADATA', label: 'Communications metadata' },
  { value: 'RISK_DETECTION', label: 'Risk detection outputs' },
];

/**
 * Competent Authority allowlist — mirrors
 * packages/legal-framework/src/india/index.ts IN_COMPETENT_AUTHORITIES.
 * Server re-checks this list; UI shows friendly labels here.
 */
const COMPETENT_AUTHORITIES: { id: string; label: string }[] = [
  { id: 'IN-UNION-HS-STUB', label: 'Union Home Secretary (stub)' },
  { id: 'IN-STATE-HS-MH-STUB', label: 'Maharashtra Home Secretary (stub)' },
  { id: 'IN-STATE-HS-KA-STUB', label: 'Karnataka Home Secretary (stub)' },
  { id: 'IN-STATE-HS-DL-STUB', label: 'Delhi Home Secretary (stub)' },
];

const STATUTE_REFS = [
  'IT_ACT_S69',
  'IT_RULES_2009_R3',
  'IT_RULES_2009_R11',
];

async function sha256Hex(source: string | ArrayBuffer): Promise<string> {
  const data =
    typeof source === 'string' ? new TextEncoder().encode(source) : source;
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function WizardClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    caseId: '',
    subjectId: '',
    aim: '',
    dataCategories: [] as string[],
    devices: '',
    keywords: '',
    contextApps: '',
    legality: '',
    legitimateAim: '',
    proportionality: '',
    proceduralSafeguards: '',
    competentAuthorityId: '',
    orderFileName: '',
    orderFileHash: '', // SHA-256 hex, computed client-side on select
    reviewNote: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function upd<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleCategory(v: string) {
    setForm((f) => ({
      ...f,
      dataCategories: f.dataCategories.includes(v)
        ? f.dataCategories.filter((x) => x !== v)
        : [...f.dataCategories, v],
    }));
  }

  async function onFileSelected(file: File | undefined) {
    if (!file) {
      upd('orderFileName', '');
      upd('orderFileHash', '');
      return;
    }
    upd('orderFileName', file.name);
    const buf = await file.arrayBuffer();
    const hash = await sha256Hex(buf);
    upd('orderFileHash', hash);
  }

  const canAdvance = (() => {
    switch (step) {
      case 0:
        return form.caseId.trim() && form.subjectId.trim();
      case 1:
        return !!form.aim;
      case 2:
        return form.dataCategories.length > 0 && form.devices.trim();
      case 3:
        return (
          form.legality.trim() &&
          form.legitimateAim.trim() &&
          form.proportionality.trim() &&
          form.proceduralSafeguards.trim()
        );
      case 4:
        return form.competentAuthorityId.trim() && form.orderFileHash.length === 64;
      case 5:
        return true; // stub
      default:
        return true;
    }
  })();

  function buildPayload() {
    const issuedOn = new Date();
    // IT Rules 2009 R.11: perOrderDays ≤ 60. Set expiry at exactly 60 days
    // less one minute to stay strictly under the cap.
    const expiresOn = new Date(issuedOn.getTime() + 60 * 24 * 60 * 60 * 1000 - 60 * 1000);
    return {
      caseId: form.caseId.trim(),
      subjectId: form.subjectId.trim(),
      legitimateAim: form.aim,
      issuingAuthorityId: form.competentAuthorityId,
      issuedOn: issuedOn.toISOString(),
      expiresOn: expiresOn.toISOString(),
      scope: {
        dataCategories: form.dataCategories,
        devices: form.devices
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        keywords: form.keywords
          ? form.keywords.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        contextApps: form.contextApps
          ? form.contextApps.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
      },
      proportionalityChecklist: {
        legality: { justified: true, note: form.legality.trim() },
        legitimateAim: { justified: true, note: form.legitimateAim.trim() },
        proportionality: { justified: true, note: form.proportionality.trim() },
        proceduralSafeguards: {
          justified: true,
          note: form.proceduralSafeguards.trim(),
        },
      },
      reviewCommitteeApproval: null,
      statuteReferences: STATUTE_REFS,
      signedOrderDocumentHash: form.orderFileHash,
      signedOrderDocumentRef: `prototype://uploaded/${form.orderFileName}`,
      dpdpaExemptionRef: null,
    };
  }

  function onSubmit() {
    setError(null);
    setViolations([]);
    startTransition(async () => {
      try {
        const res = await fetch('/api/authorizations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: { id?: string };
          error?: string;
          violations?: string[];
        };
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Request failed (${res.status})`);
          setViolations(body.violations ?? []);
          return;
        }
        const newId = body.data?.id;
        if (newId) {
          router.push(`/authorizations/${newId}`);
        } else {
          router.push('/cases');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      {/* Stepper */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <ol className="flex flex-row gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {STEPS.map((label, i) => {
            const state =
              i < step ? 'done' : i === step ? 'current' : 'pending';
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => i <= step && setStep(i)}
                  className={`w-full whitespace-nowrap border-l-2 px-3 py-2 text-left text-xs lg:whitespace-normal lg:text-sm ${
                    state === 'current'
                      ? 'border-primary bg-indigo-50 font-semibold text-primary'
                      : state === 'done'
                      ? 'border-success text-ink hover:bg-slate-50'
                      : 'border-slate-200 text-muted'
                  }`}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Step body */}
      <section className="border border-slate-200 bg-white p-6 sm:p-8">
        <p className="eyebrow mb-4">Step {step + 1} of {STEPS.length}</p>

        {step === 0 && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">
              Case and subject on record
            </h2>
            <div>
              <label className="block text-sm font-medium text-ink">
                Case ID (docket)
              </label>
              <input
                value={form.caseId}
                onChange={(e) => upd('caseId', e.target.value)}
                placeholder="UUID from /cases"
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
              />
              <StatuteRef>
                Case must exist in your assigned docket. Cross-docket
                authorizations are refused by RLS on the authorization
                table (ENTITY_MODEL §3 invariant 4).
              </StatuteRef>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">
                Subject ID
              </label>
              <input
                value={form.subjectId}
                onChange={(e) => upd('subjectId', e.target.value)}
                placeholder="UUID of the subject row"
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
              />
              <StatuteRef>
                Subject identity is stored only as a SHA-256 Aadhaar hash;
                raw Aadhaar is never persisted (DPDPA 2023 §8 — purpose limitation).
              </StatuteRef>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">Legitimate aim</h2>
            <div>
              <label className="block text-sm font-medium text-ink">
                Ground under IT Act §69
              </label>
              <select
                value={form.aim}
                onChange={(e) => upd('aim', e.target.value)}
                className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">— Select a ground —</option>
                {LEGITIMATE_AIMS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <StatuteRef>
                IT Rules 2009 R.3 — the legitimate aim must be one of the
                grounds enumerated in §69(1) of the IT Act, 2000.
              </StatuteRef>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">Scope of collection</h2>

            <fieldset>
              <legend className="block text-sm font-medium text-ink">
                Data categories
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {DATA_CATEGORIES.map((d) => (
                  <label
                    key={d.value}
                    className="flex items-center gap-2 border border-slate-200 px-3 py-2 text-sm hover:border-primary"
                  >
                    <input
                      type="checkbox"
                      checked={form.dataCategories.includes(d.value)}
                      onChange={() => toggleCategory(d.value)}
                      className="accent-primary"
                    />
                    {d.label}
                  </label>
                ))}
              </div>
              <StatuteRef>
                Puttaswamy proportionality — categories must be the
                narrowest set that achieves the stated aim. The DB rejects
                out-of-scope evidence writes at insert time.
              </StatuteRef>
            </fieldset>

            <div>
              <label className="block text-sm font-medium text-ink">
                Authorised devices (comma-separated device IDs)
              </label>
              <input
                value={form.devices}
                onChange={(e) => upd('devices', e.target.value)}
                placeholder="uuid, uuid"
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
              />
              <StatuteRef>
                2009 Rules R.3 — the direction must specify the computer
                resource(s) to be intercepted.
              </StatuteRef>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink">
                Keywords (optional; capture only around these)
              </label>
              <input
                value={form.keywords}
                onChange={(e) => upd('keywords', e.target.value)}
                placeholder="payment, transfer"
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink">
                Context apps (optional; package names)
              </label>
              <input
                value={form.contextApps}
                onChange={(e) => upd('contextApps', e.target.value)}
                placeholder="com.whatsapp, org.telegram.messenger"
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">
              Puttaswamy proportionality checklist
            </h2>
            <p className="text-sm text-muted">
              All four prongs must be justified in the officer&rsquo;s own
              words. Empty prongs will block issuance.
            </p>

            {(
              [
                { key: 'legality', label: 'Legality', hint: 'Which valid law backs this direction?', cite: 'Puttaswamy 2017 — prong 1.' },
                { key: 'legitimateAim', label: 'Legitimate aim', hint: 'What legitimate state interest is served?', cite: 'Puttaswamy 2017 — prong 2.' },
                { key: 'proportionality', label: 'Proportionality', hint: 'Why is this the least intrusive means?', cite: 'Puttaswamy 2017 — prong 3.' },
                { key: 'proceduralSafeguards', label: 'Procedural safeguards', hint: 'Which oversight and review mechanisms apply?', cite: 'Puttaswamy 2017 — prong 4; 2009 Rules R.22.' },
              ] as const
            ).map((prong) => (
              <div key={prong.key}>
                <label className="block text-sm font-medium text-ink">
                  {prong.label}
                </label>
                <p className="mt-0.5 text-xs text-muted">{prong.hint}</p>
                <textarea
                  value={form[prong.key]}
                  onChange={(e) => upd(prong.key, e.target.value)}
                  rows={3}
                  required
                  className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <StatuteRef>{prong.cite}</StatuteRef>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">
              Competent Authority and signed order
            </h2>
            <div>
              <label className="block text-sm font-medium text-ink">
                Competent Authority
              </label>
              <select
                value={form.competentAuthorityId}
                onChange={(e) => upd('competentAuthorityId', e.target.value)}
                className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">— Select a Competent Authority —</option>
                {COMPETENT_AUTHORITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <StatuteRef>
                2009 Rules R.2 — for State-level directions, the Competent
                Authority is the Secretary in charge of the Home Department;
                for Union directions, the Union Home Secretary. Selections
                outside this allowlist are refused by the server.
              </StatuteRef>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">
                Signed order (PDF upload)
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => onFileSelected(e.target.files?.[0])}
                className="mt-1 block w-full text-sm text-muted file:mr-3 file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:uppercase file:tracking-register hover:file:bg-slate-100"
              />
              {form.orderFileHash && (
                <p className="mt-2 font-mono text-xs text-muted break-all">
                  SHA-256: {form.orderFileHash}
                </p>
              )}
              <div className="mt-3">
                <Pill tone="warning">
                  Prototype — e-Sign not verified
                </Pill>
              </div>
              <StatuteRef>
                Real system requires UIDAI e-Sign verification of the
                Competent Authority&rsquo;s digital signature. This prototype
                stores only the SHA-256 hash of the uploaded PDF.
              </StatuteRef>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">
              Review Committee approval
            </h2>
            <div className="border border-red-200 bg-red-50 p-4 text-sm text-warning">
              <strong className="font-semibold">Prototype stub —</strong>{' '}
              production requires a quorum record from Cabinet Secretary,
              Secretary Legal Affairs, and Secretary Telecommunications (or
              State equivalents). This prototype records approval in a
              separate action (POST /api/authorizations/[id]/review) after
              the warrant is created in PENDING_REVIEW.
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">
                Approver note (optional; carried into audit context)
              </label>
              <textarea
                rows={3}
                value={form.reviewNote}
                onChange={(e) => upd('reviewNote', e.target.value)}
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <StatuteRef>
                2009 Rules R.22 — every direction shall be placed before the
                Review Committee within seven working days.
              </StatuteRef>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">Confirmation</h2>
            <dl className="divide-y divide-slate-200 border border-slate-200 text-sm">
              {[
                ['Case', form.caseId || '—'],
                ['Subject', form.subjectId || '—'],
                [
                  'Legitimate aim',
                  LEGITIMATE_AIMS.find((a) => a.value === form.aim)?.label ?? '—',
                ],
                ['Data categories', form.dataCategories.join(', ') || '—'],
                ['Devices', form.devices || '—'],
                [
                  'Competent Authority',
                  COMPETENT_AUTHORITIES.find(
                    (c) => c.id === form.competentAuthorityId,
                  )?.label ?? '—',
                ],
                ['Signed order', form.orderFileName || '—'],
                ['Signed order SHA-256', form.orderFileHash || '—'],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-3 gap-4 px-4 py-3">
                  <dt className="text-xs uppercase tracking-register text-muted">
                    {k}
                  </dt>
                  <dd className="col-span-2 text-ink break-all">{v}</dd>
                </div>
              ))}
            </dl>

            {(error || violations.length > 0) && (
              <div className="border border-red-200 bg-red-50 p-4 text-sm text-warning">
                {error && (
                  <p className="font-semibold">Server rejected the warrant: {error}</p>
                )}
                {violations.length > 0 && (
                  <>
                    <p className="mt-2 font-semibold uppercase tracking-register text-xs">
                      Statutory violations
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {violations.map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Pill tone="success">Ready to submit</Pill>
              <DummyVerifiedPill />
            </div>
            <p className="text-xs text-muted">
              On submission, the row is written to `authorization` with status
              PENDING_REVIEW and an AUTH_ISSUE entry is appended to the
              audit chain. Approval (transition to ACTIVE) is a separate
              Review Committee action.
            </p>
          </div>
        )}

        {/* Nav */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || isPending}
            className="border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-register text-ink disabled:text-slate-400"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => canAdvance && setStep((s) => s + 1)}
              disabled={!canAdvance}
              className="bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover disabled:bg-slate-300"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={isPending}
              className="bg-success px-5 py-2 text-xs font-semibold uppercase tracking-register text-white hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Submitting…' : 'Submit for Review'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
