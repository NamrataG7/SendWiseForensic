'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Jurisdiction } from '@/lib/entities';
import { JURISDICTION_THEME } from '@/lib/jurisdiction-theme';

/**
 * Two-step case creation.
 *   Step 1 — jurisdiction (three big radio cards, immutable warning)
 *   Step 2 — case reference + offences
 *
 * The case_ref label switches by jurisdiction (FIR / docket / IPA case ref)
 * to reflect the artifact the officer will actually be entering.
 * TODO(OFFENCE-TAXONOMIES) — free-text with searchable stub only for now.
 */

const JURISDICTIONS: {
  code: Jurisdiction;
  name: string;
  docsHref: string;
}[] = [
  {
    code: 'IN',
    name: 'India — IT Act §69 / Puttaswamy 4-prong',
    docsHref: '/docs/LEGAL_FRAMEWORK_IN.md',
  },
  {
    code: 'US',
    name: 'United States — Title III / Berger particularity',
    docsHref: '/docs/LEGAL_FRAMEWORK_US.md',
  },
  {
    code: 'UK',
    name: 'United Kingdom — IPA 2016 double-lock / ECHR Art. 8',
    docsHref: '/docs/LEGAL_FRAMEWORK_UK.md',
  },
];

const CASE_REF_LABEL: Record<Jurisdiction, string> = {
  IN: 'FIR number',
  US: 'Federal / State docket number',
  UK: 'IPA case reference',
};

const CASE_REF_PLACEHOLDER: Record<Jurisdiction, string> = {
  IN: 'e.g. 145/2026 — Yerawada PS',
  US: 'e.g. 1:26-cr-00123-XYZ (D.D.C.)',
  UK: 'e.g. IPA/2026/000123',
};

export default function CreateCaseForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction | null>(null);
  const [caseRef, setCaseRef] = useState('');
  const [offences, setOffences] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!jurisdiction || !caseRef.trim()) return;
    setError(null);
    setViolations([]);
    startTransition(async () => {
      try {
        const res = await fetch('/api/cases', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jurisdiction,
            externalCaseRef: caseRef.trim(),
            offences: offences
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean),
          }),
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
        const id = body.data?.id;
        router.push(id ? `/cases/${id}` : '/cases');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error');
      }
    });
  }

  return (
    <div className="mt-8 space-y-8">
      {step === 0 && (
        <section className="space-y-6">
          <div className="border-l-4 border-amber-500 bg-amber-50 p-4">
            <p className="text-sm font-semibold uppercase tracking-register text-amber-900">
              Immutable — choose deliberately
            </p>
            <p className="mt-1 text-sm text-amber-900/90">
              Jurisdiction cannot be changed after this case is created. It
              governs statute cites, competent authority allowlist, purge
              schedule, and evidence certificate format for every artifact
              filed under this docket.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {JURISDICTIONS.map(({ code, name, docsHref }) => {
              const t = JURISDICTION_THEME[code];
              const selected = jurisdiction === code;
              return (
                <label
                  key={code}
                  className={`group flex cursor-pointer flex-col overflow-hidden border-2 bg-white transition ${
                    selected
                      ? 'border-ink shadow-lg'
                      : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div
                    className={`${t.headerBg} px-4 py-3 text-slate-100`}
                  >
                    <p className="font-serif text-xs italic leading-snug text-slate-200">
                      {t.prelude}
                    </p>
                    <p className="mt-1 text-lg font-semibold">{code}</p>
                  </div>
                  <div className={`h-1 ${t.accent}`} aria-hidden="true" />
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <p className="text-sm font-medium text-ink">{name}</p>
                    <p className="text-xs leading-relaxed text-muted">
                      {t.purgeNote}
                    </p>
                    <a
                      href={docsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline decoration-dotted underline-offset-4 hover:text-primaryHover"
                    >
                      Read the framework doc →
                    </a>
                    <div className="mt-auto flex items-center gap-2 pt-2">
                      <input
                        type="radio"
                        name="jurisdiction"
                        value={code}
                        checked={selected}
                        onChange={() => setJurisdiction(code)}
                        className="accent-ink"
                      />
                      <span className="text-xs font-semibold uppercase tracking-register text-ink">
                        Select {code}
                      </span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!jurisdiction}
              onClick={() => setStep(1)}
              className="bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover disabled:bg-slate-300"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 1 && jurisdiction && (
        <section className="space-y-6 border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-register ${JURISDICTION_THEME[jurisdiction].pillClass}`}
            >
              LOCKED · {jurisdiction}
            </span>
            <span className="text-xs text-muted">
              Jurisdiction is fixed for this case.
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink">
              {CASE_REF_LABEL[jurisdiction]}
            </label>
            <input
              value={caseRef}
              onChange={(e) => setCaseRef(e.target.value)}
              placeholder={CASE_REF_PLACEHOLDER[jurisdiction]}
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink">
              Offences (comma-separated)
            </label>
            <input
              value={offences}
              onChange={(e) => setOffences(e.target.value)}
              placeholder={
                jurisdiction === 'IN'
                  ? 'BNS_318(4), BNS_336'
                  : jurisdiction === 'US'
                  ? '18 U.S.C. §1343, §1956'
                  : 'Fraud Act 2006 s.2, POCA 2002 s.327'
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-xs text-muted">
              TODO(OFFENCE-TAXONOMIES) — free-text for now; a searchable
              per-jurisdiction taxonomy picker is pending.
            </p>
          </div>

          {(error || violations.length > 0) && (
            <div className="border border-red-200 bg-red-50 p-4 text-sm text-warning">
              {error && <p className="font-semibold">{error}</p>}
              {violations.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {violations.map((v) => (
                    <li key={v}>{v}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 pt-6">
            <button
              type="button"
              onClick={() => setStep(0)}
              disabled={isPending}
              className="border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-register text-ink"
            >
              Back
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!caseRef.trim() || isPending}
              className="bg-success px-5 py-2 text-xs font-semibold uppercase tracking-register text-white hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Opening case…' : 'Open case'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
