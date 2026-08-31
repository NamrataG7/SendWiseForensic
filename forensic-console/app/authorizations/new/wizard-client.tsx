'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import StatuteRef from '@/components/StatuteRef';
import { Pill, DummyVerifiedPill } from '@/components/Pill';
import { JurisdictionPill } from '@/components/JurisdictionPill';
import type { Jurisdiction } from '@/lib/entities';
import { JURISDICTION_THEME } from '@/lib/jurisdiction-theme';

/**
 * Multi-step authorization issuance wizard.
 *
 * Officers do NOT choose jurisdiction here — it is pulled from the case
 * they selected in Step 1 and is displayed as a locked pill. Every
 * downstream branch (legitimate aim list, proportionality prongs,
 * competent authority upload count, review committee semantics) reads
 * from `case.jurisdiction`. The server re-derives jurisdiction from the
 * DB before writing.
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

// ---------------------------------------------------------------------------
// Per-jurisdiction Step 2 (Legitimate Aim) source lists
// ---------------------------------------------------------------------------

const LEGITIMATE_AIMS: Record<
  Jurisdiction,
  { value: string; label: string }[]
> = {
  IN: [
    { value: 'SOVEREIGNTY_INTEGRITY', label: 'Sovereignty and integrity of India' },
    { value: 'DEFENCE_OF_INDIA', label: 'Defence of India' },
    { value: 'SECURITY_OF_STATE', label: 'Security of the State' },
    {
      value: 'FRIENDLY_RELATIONS_FOREIGN_STATES',
      label: 'Friendly relations with foreign States',
    },
    { value: 'PUBLIC_ORDER', label: 'Public order' },
    {
      value: 'PREVENT_INCITEMENT_COGNIZABLE_OFFENCE',
      label: 'Preventing incitement to the commission of any cognizable offence',
    },
  ],
  US: [
    {
      value: 'US_PARTICULAR_OFFENSE_S2516',
      label: 'Particular offense enumerated in 18 U.S.C. §2516',
    },
    {
      value: 'US_INVESTIGATION_OF_ORGANIZED_CRIME',
      label: 'Investigation of organized crime (§2516(1)(c))',
    },
    {
      value: 'US_NATIONAL_SECURITY_NON_FISA',
      label: 'National security (non-FISA — Title III)',
    },
    {
      value: 'US_PRETRIAL_SUPERVISION_S3142',
      label: 'Pretrial supervision condition (18 U.S.C. §3142)',
    },
    {
      value: 'US_PROBATION_CONDITIONS_S3563',
      label: 'Probation condition (18 U.S.C. §3563)',
    },
    {
      value: 'US_CORPORATE_INSIDER_CONTRACT',
      label: 'Corporate insider — contractual monitoring',
    },
    {
      value: 'US_VOLUNTARY_VICTIM_CONSENT',
      label: 'Voluntary victim consent (one-party consent)',
    },
  ],
  UK: [
    {
      value: 'UK_NATIONAL_SECURITY_IPA_S19_1_A',
      label: 'National security — IPA 2016 §19(1)(a)',
    },
    {
      value: 'UK_SERIOUS_CRIME_IPA_S19_1_B',
      label: 'Serious crime — IPA 2016 §19(1)(b)',
    },
    {
      value: 'UK_ECONOMIC_WELLBEING_IPA_S19_1_C',
      label:
        'Economic well-being of the UK (national-security-related) — IPA 2016 §19(1)(c)',
    },
  ],
};

const AIM_STATUTE_LEGEND: Record<Jurisdiction, string> = {
  IN: 'IT Act §69 (read with 2009 Rules R.3) — the aim must be one of the enumerated grounds.',
  US: '18 U.S.C. §2516 — the offense must be on the enumerated wiretap list.',
  UK: 'IPA 2016 §19 — targeted interception warrants require one of three statutory grounds.',
};

// ---------------------------------------------------------------------------
// Per-jurisdiction Step 4 (Proportionality) prongs
// ---------------------------------------------------------------------------

interface Prong {
  key: string;
  label: string;
  hint: string;
  cite: string;
}

const PRONGS: Record<Jurisdiction, Prong[]> = {
  IN: [
    { key: 'legality', label: 'Legality', hint: 'Which valid law backs this direction?', cite: 'Puttaswamy 2017 — prong 1.' },
    { key: 'legitimateAim', label: 'Legitimate aim', hint: 'What legitimate state interest is served?', cite: 'Puttaswamy 2017 — prong 2.' },
    { key: 'proportionality', label: 'Proportionality', hint: 'Why is this the least intrusive means?', cite: 'Puttaswamy 2017 — prong 3.' },
    { key: 'proceduralSafeguards', label: 'Procedural safeguards', hint: 'Which oversight and review mechanisms apply?', cite: 'Puttaswamy 2017 — prong 4; 2009 Rules R.22.' },
  ],
  US: [
    { key: 'particularOffense', label: 'Particular offense', hint: 'Which §2516 enumerated offense is under investigation?', cite: 'Berger v. New York, 388 U.S. 41 (1967) — particularity #1.' },
    { key: 'particularPlace', label: 'Particular facilities / place', hint: 'Which specific facility or device is targeted?', cite: 'Berger — particularity #2; §2518(1)(b)(ii).' },
    { key: 'particularCommunication', label: 'Particular type of communication', hint: 'Which type of communication (voice / SMS / IM) is sought?', cite: 'Berger — particularity #3; §2518(1)(b)(iii).' },
    { key: 'particularPersons', label: 'Particular persons', hint: 'Whose communications are to be intercepted?', cite: 'Berger — particularity #4; §2518(1)(b)(iv).' },
  ],
  UK: [
    { key: 'inAccordanceWithLaw', label: 'In accordance with law', hint: 'Which statutory power (IPA 2016) authorises this measure?', cite: 'ECHR Art. 8(2) — prong 1; IPA 2016 §§19–20.' },
    { key: 'necessaryInDemocraticSociety', label: 'Necessary in a democratic society', hint: 'Why is this pressing social need?', cite: 'ECHR Art. 8(2) — prong 2.' },
    { key: 'proportionate', label: 'Proportionate', hint: 'Why is this the least intrusive means to achieve the aim?', cite: 'ECHR Art. 8(2) — prong 3; IPA 2016 §20(2).' },
  ],
};

// ---------------------------------------------------------------------------
// Step 5 competent-authority allowlists per jurisdiction
// ---------------------------------------------------------------------------

const COMPETENT_AUTHORITIES: Record<
  Jurisdiction,
  { id: string; label: string }[]
> = {
  IN: [
    { id: 'IN-UNION-HS-STUB', label: 'Union Home Secretary (stub)' },
    { id: 'IN-STATE-HS-MH-STUB', label: 'Maharashtra Home Secretary (stub)' },
    { id: 'IN-STATE-HS-KA-STUB', label: 'Karnataka Home Secretary (stub)' },
    { id: 'IN-STATE-HS-DL-STUB', label: 'Delhi Home Secretary (stub)' },
  ],
  US: [
    { id: 'US-JUDGE-DDC-STUB', label: 'Federal Judge — D.D.C. (stub)' },
    { id: 'US-JUDGE-SDNY-STUB', label: 'Federal Judge — S.D.N.Y. (stub)' },
    { id: 'US-JUDGE-CACR-STUB', label: 'State Judge — CA Superior (stub)' },
  ],
  UK: [
    { id: 'UK-SOS-HOME-STUB', label: 'Secretary of State for the Home Department (stub)' },
    { id: 'UK-SOS-FCO-STUB', label: 'Foreign Secretary (stub)' },
  ],
};

const UK_JC_STUBS = [
  { id: 'UK-JC-1-STUB', label: 'Judicial Commissioner (IPCO) — stub #1' },
  { id: 'UK-JC-2-STUB', label: 'Judicial Commissioner (IPCO) — stub #2' },
];

const STATUTE_REFS: Record<Jurisdiction, string[]> = {
  IN: ['IT_ACT_S69', 'IT_RULES_2009_R3', 'IT_RULES_2009_R11'],
  US: ['US_18_USC_S2510', 'US_18_USC_S2516', 'US_18_USC_S2518', 'US_4TH_AMENDMENT'],
  UK: ['UK_IPA_2016_S19', 'UK_IPA_2016_S23', 'UK_ECHR_ART_8'],
};

const CA_STATUTE_CITE: Record<Jurisdiction, string> = {
  IN: '2009 Rules R.2 — Competent Authority is the Union or State Home Secretary.',
  US: 'Title III §2518 — the authorizer is a court judge, not an executive officer.',
  UK: 'IPA 2016 §§19–23 — double-lock: Secretary of State issues, Judicial Commissioner approves.',
};

const DATA_CATEGORIES = [
  { value: 'KEYSTROKE', label: 'Keystrokes' },
  { value: 'APP_EVENT', label: 'App events' },
  { value: 'COMMS_METADATA', label: 'Communications metadata' },
  { value: 'RISK_DETECTION', label: 'Risk detection outputs' },
];

async function sha256Hex(source: string | ArrayBuffer): Promise<string> {
  const data =
    typeof source === 'string' ? new TextEncoder().encode(source) : source;
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------

export default function WizardClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction | null>(null);
  const [caseLookupError, setCaseLookupError] = useState<string | null>(null);

  const [form, setForm] = useState({
    caseId: '',
    subjectId: '',
    aim: '',
    dataCategories: [] as string[],
    devices: '',
    keywords: '',
    contextApps: '',
    // Proportionality — the key set depends on jurisdiction; we store all
    // possible keys in one bag and only submit the active set.
    prongs: {} as Record<string, string>,
    competentAuthorityId: '',
    orderFileName: '',
    orderFileHash: '',
    // UK-specific double-lock uploads
    ukJcId: '',
    ukJcFileName: '',
    ukJcFileHash: '',
    ukUrgentS29: false,
    ukJcPromisedBy: '',
    reviewNote: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [contamination, setContamination] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function upd<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function updProng(key: string, value: string) {
    setForm((f) => ({ ...f, prongs: { ...f.prongs, [key]: value } }));
  }
  function toggleCategory(v: string) {
    setForm((f) => ({
      ...f,
      dataCategories: f.dataCategories.includes(v)
        ? f.dataCategories.filter((x) => x !== v)
        : [...f.dataCategories, v],
    }));
  }

  // Fetch the case's jurisdiction as soon as a caseId is entered.
  useEffect(() => {
    const id = form.caseId.trim();
    if (!id) {
      setJurisdiction(null);
      setCaseLookupError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cases/${encodeURIComponent(id)}`);
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: { case?: { jurisdiction?: Jurisdiction } };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || body.ok === false || !body.data?.case?.jurisdiction) {
          setJurisdiction(null);
          setCaseLookupError(body.error ?? 'Case not found or not visible');
          return;
        }
        setJurisdiction(body.data.case.jurisdiction);
        setCaseLookupError(null);
      } catch {
        if (!cancelled) {
          setJurisdiction(null);
          setCaseLookupError('Network error while looking up case');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.caseId]);

  async function onFileSelected(
    file: File | undefined,
    which: 'order' | 'jc',
  ) {
    if (!file) {
      if (which === 'order') {
        upd('orderFileName', '');
        upd('orderFileHash', '');
      } else {
        upd('ukJcFileName', '');
        upd('ukJcFileHash', '');
      }
      return;
    }
    const buf = await file.arrayBuffer();
    const hash = await sha256Hex(buf);
    if (which === 'order') {
      upd('orderFileName', file.name);
      upd('orderFileHash', hash);
    } else {
      upd('ukJcFileName', file.name);
      upd('ukJcFileHash', hash);
    }
  }

  const activeProngs = jurisdiction ? PRONGS[jurisdiction] : [];

  const canAdvance = (() => {
    switch (step) {
      case 0:
        return (
          form.caseId.trim() && form.subjectId.trim() && !!jurisdiction
        );
      case 1:
        return !!form.aim;
      case 2:
        return form.dataCategories.length > 0 && form.devices.trim();
      case 3:
        return activeProngs.every((p) => (form.prongs[p.key] ?? '').trim());
      case 4:
        if (!jurisdiction) return false;
        if (jurisdiction === 'UK') {
          const base =
            form.competentAuthorityId.trim() &&
            form.orderFileHash.length === 64 &&
            form.ukJcId.trim() &&
            form.ukJcFileHash.length === 64;
          if (form.ukUrgentS29 && !form.ukJcPromisedBy) return false;
          return !!base;
        }
        return (
          form.competentAuthorityId.trim() && form.orderFileHash.length === 64
        );
      case 5:
        return true;
      default:
        return true;
    }
  })();

  function buildPayload() {
    if (!jurisdiction) throw new Error('jurisdiction not resolved');
    const issuedOn = new Date();
    const expiresOn = new Date(
      issuedOn.getTime() + 30 * 24 * 60 * 60 * 1000,
    ); // 30 days — within every jurisdiction's per-order cap.
    const prongMap = Object.fromEntries(
      activeProngs.map((p) => [
        p.key,
        { justified: true, note: (form.prongs[p.key] ?? '').trim() },
      ]),
    );
    return {
      jurisdiction,
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
      proportionalityChecklist: prongMap,
      reviewCommitteeApproval: null,
      statuteReferences: STATUTE_REFS[jurisdiction],
      signedOrderDocumentHash: form.orderFileHash,
      signedOrderDocumentRef: `prototype://uploaded/${form.orderFileName}`,
      dpdpaExemptionRef: null,
    };
  }

  function onSubmit() {
    setError(null);
    setViolations([]);
    setContamination([]);
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
          const vios = body.violations ?? [];
          const contam = vios.filter((v) =>
            v.includes('cross-jurisdiction contamination'),
          );
          if (contam.length > 0) setContamination(contam);
          setViolations(vios);
          return;
        }
        const newId = body.data?.id;
        router.push(newId ? `/authorizations/${newId}` : '/cases');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <ol className="flex flex-row gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'current' : 'pending';
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
        {jurisdiction && (
          <div className="mt-4 border border-slate-200 bg-white p-3">
            <p className="text-[10px] uppercase tracking-register text-muted">
              Case jurisdiction
            </p>
            <div className="mt-1.5">
              <JurisdictionPill jurisdiction={jurisdiction} locked />
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted">
              Fixed by the case. Statute cites, competent authority, and
              duration limits below are governed by this jurisdiction.
            </p>
          </div>
        )}
      </aside>

      <section className="border border-slate-200 bg-white p-6 sm:p-8">
        <p className="eyebrow mb-4">
          Step {step + 1} of {STEPS.length}
        </p>

        {step === 0 && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">
              Case and subject on record
            </h2>
            <div>
              <label className="block text-sm font-medium text-ink">
                Case ID
              </label>
              <input
                value={form.caseId}
                onChange={(e) => upd('caseId', e.target.value)}
                placeholder="UUID from /cases"
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
              />
              {jurisdiction && (
                <div className="mt-2 flex items-center gap-2">
                  <JurisdictionPill jurisdiction={jurisdiction} locked />
                  <span className="text-xs text-muted">
                    Jurisdiction is fixed by the case. Statute cites,
                    competent authority, and duration limits below are
                    governed by this jurisdiction.
                  </span>
                </div>
              )}
              {caseLookupError && (
                <p className="mt-2 text-xs text-warning">{caseLookupError}</p>
              )}
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
                Subject.jurisdiction is server-derived from the parent
                case and cannot be changed.
              </StatuteRef>
            </div>
          </div>
        )}

        {step === 1 && jurisdiction && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">Legitimate aim</h2>
            <div>
              <label className="block text-sm font-medium text-ink">
                Statutory ground ({jurisdiction})
              </label>
              <select
                value={form.aim}
                onChange={(e) => upd('aim', e.target.value)}
                className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">— Select a ground —</option>
                {LEGITIMATE_AIMS[jurisdiction].map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <StatuteRef>{AIM_STATUTE_LEGEND[jurisdiction]}</StatuteRef>
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
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">
                Keywords (optional)
              </label>
              <input
                value={form.keywords}
                onChange={(e) => upd('keywords', e.target.value)}
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
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
          </div>
        )}

        {step === 3 && jurisdiction && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">
              Proportionality checklist —{' '}
              {jurisdiction === 'IN'
                ? 'Puttaswamy 4 prongs'
                : jurisdiction === 'US'
                ? 'Berger four particularity requirements'
                : 'ECHR Article 8 three-prong test'}
            </h2>
            <p className="text-sm text-muted">
              Every prong must be justified in the officer&rsquo;s own words.
              Empty prongs will block issuance.
            </p>
            {activeProngs.map((prong) => (
              <div key={prong.key}>
                <label className="block text-sm font-medium text-ink">
                  {prong.label}
                </label>
                <p className="mt-0.5 text-xs text-muted">{prong.hint}</p>
                <textarea
                  value={form.prongs[prong.key] ?? ''}
                  onChange={(e) => updProng(prong.key, e.target.value)}
                  rows={3}
                  required
                  className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <StatuteRef>{prong.cite}</StatuteRef>
              </div>
            ))}
          </div>
        )}

        {step === 4 && jurisdiction && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">
              Competent Authority and signed order
            </h2>

            <div>
              <label className="block text-sm font-medium text-ink">
                {jurisdiction === 'IN'
                  ? 'Union / State Home Secretary'
                  : jurisdiction === 'US'
                  ? 'Federal / State Judge'
                  : 'Secretary of State (issuing authority)'}
              </label>
              <select
                value={form.competentAuthorityId}
                onChange={(e) => upd('competentAuthorityId', e.target.value)}
                className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="">— Select —</option>
                {COMPETENT_AUTHORITIES[jurisdiction].map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <StatuteRef>{CA_STATUTE_CITE[jurisdiction]}</StatuteRef>
            </div>

            <SignedOrderUpload
              label={
                jurisdiction === 'UK'
                  ? 'Secretary of State signed order (PDF)'
                  : 'Signed order (PDF)'
              }
              fileName={form.orderFileName}
              fileHash={form.orderFileHash}
              onFile={(f) => onFileSelected(f, 'order')}
              stampLabel={JURISDICTION_THEME[jurisdiction].dummyStampLabel}
              accent={JURISDICTION_THEME[jurisdiction].accent}
            />

            {jurisdiction === 'UK' && (
              <div className="space-y-6 border-t border-dashed border-slate-300 pt-6">
                <div>
                  <label className="block text-sm font-medium text-ink">
                    Judicial Commissioner (IPCO)
                  </label>
                  <select
                    value={form.ukJcId}
                    onChange={(e) => upd('ukJcId', e.target.value)}
                    className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="">— Select Judicial Commissioner —</option>
                    {UK_JC_STUBS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <StatuteRef>
                    IPA 2016 §23 — a Judicial Commissioner must approve the
                    Secretary of State&rsquo;s decision to issue.
                  </StatuteRef>
                </div>

                <SignedOrderUpload
                  label="Judicial Commissioner approval (PDF)"
                  fileName={form.ukJcFileName}
                  fileHash={form.ukJcFileHash}
                  onFile={(f) => onFileSelected(f, 'jc')}
                  stampLabel="DUMMY JC APPROVAL — PROTOTYPE"
                  accent={JURISDICTION_THEME.UK.accent}
                />

                <label className="flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.ukUrgentS29}
                    onChange={(e) => upd('ukUrgentS29', e.target.checked)}
                    className="mt-0.5 accent-warning"
                  />
                  <span>
                    <span className="font-semibold text-amber-900">
                      Urgent — IPA 2016 §29
                    </span>
                    <span className="ml-1 text-amber-900/80">
                      Warrant issued without prior JC approval; approval
                      required within 3 working days.
                    </span>
                  </span>
                </label>

                {form.ukUrgentS29 && (
                  <div>
                    <label className="block text-sm font-medium text-ink">
                      Promised JC approval by (datetime)
                    </label>
                    <input
                      type="datetime-local"
                      value={form.ukJcPromisedBy}
                      onChange={(e) => upd('ukJcPromisedBy', e.target.value)}
                      className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                    <StatuteRef>
                      IPA 2016 §29(4) — urgent warrant ceases to have effect
                      if the JC does not approve within 3 working days.
                    </StatuteRef>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 5 && jurisdiction && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">
              Review Committee approval
            </h2>
            {jurisdiction === 'IN' ? (
              <div className="border border-red-200 bg-red-50 p-4 text-sm text-warning">
                <strong className="font-semibold">Prototype stub —</strong>{' '}
                production requires a quorum record from Cabinet Secretary,
                Secretary Legal Affairs, and Secretary Telecommunications
                (or State equivalents). Approval is filed via POST
                /api/authorizations/[id]/review after the warrant is
                created in PENDING_REVIEW.
              </div>
            ) : (
              <div className="border-l-4 border-slate-400 bg-slate-50 p-4 text-sm text-ink">
                <p className="font-semibold">
                  Review Committee is India-specific; not required in this
                  jurisdiction.
                </p>
                <p className="mt-2 text-muted">
                  {jurisdiction === 'US'
                    ? 'Oversight in the United States runs through the issuing court and the Administrative Office of the U.S. Courts wiretap report. TODO(US-OVERSIGHT-DIRECTORY).'
                    : 'Oversight in the United Kingdom runs through the Investigatory Powers Commissioner (IPCO) and the Judicial Commissioners. TODO(UK-JUDICIAL-COMMISSIONER-DIRECTORY).'}
                </p>
              </div>
            )}
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
            </div>
          </div>
        )}

        {step === 6 && jurisdiction && (
          <div className="space-y-6">
            <h2 className="font-serif text-2xl text-ink">Confirmation</h2>
            <div className="flex flex-wrap items-center gap-3">
              <JurisdictionPill jurisdiction={jurisdiction} locked />
              <span className="text-xs text-muted">
                All statute cites below are namespaced to this jurisdiction.
              </span>
            </div>
            <dl className="divide-y divide-slate-200 border border-slate-200 text-sm">
              {[
                ['Case', form.caseId || '—'],
                ['Subject', form.subjectId || '—'],
                [
                  'Legitimate aim',
                  LEGITIMATE_AIMS[jurisdiction].find(
                    (a) => a.value === form.aim,
                  )?.label ?? '—',
                ],
                ['Data categories', form.dataCategories.join(', ') || '—'],
                ['Devices', form.devices || '—'],
                [
                  'Competent Authority',
                  COMPETENT_AUTHORITIES[jurisdiction].find(
                    (c) => c.id === form.competentAuthorityId,
                  )?.label ?? '—',
                ],
                ['Signed order', form.orderFileName || '—'],
                ['Signed order SHA-256', form.orderFileHash || '—'],
                ...(jurisdiction === 'UK'
                  ? ([
                      [
                        'Judicial Commissioner',
                        UK_JC_STUBS.find((j) => j.id === form.ukJcId)?.label ??
                          '—',
                      ],
                      ['JC approval file', form.ukJcFileName || '—'],
                      ['JC approval SHA-256', form.ukJcFileHash || '—'],
                      [
                        'Urgent §29',
                        form.ukUrgentS29
                          ? `Yes — JC approval due ${form.ukJcPromisedBy || '(unset)'}`
                          : 'No',
                      ],
                    ] as [string, string][])
                  : []),
                [
                  'Statute references',
                  STATUTE_REFS[jurisdiction].join(', '),
                ],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-3 gap-4 px-4 py-3">
                  <dt className="text-xs uppercase tracking-register text-muted">
                    {k}
                  </dt>
                  <dd className="col-span-2 text-ink break-all">{v}</dd>
                </div>
              ))}
            </dl>

            {contamination.length > 0 && (
              <div className="border-2 border-red-500 bg-red-50 p-4 text-sm text-warning">
                <p className="font-semibold uppercase tracking-register">
                  REJECTED — cross-jurisdiction contamination
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {contamination.map((v) => (
                    <li key={v} className="font-mono text-xs">
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(error || (violations.length > 0 && contamination.length === 0)) && (
              <div className="border border-red-200 bg-red-50 p-4 text-sm text-warning">
                {error && (
                  <p className="font-semibold">
                    Server rejected the warrant: {error}
                  </p>
                )}
                {violations.length > 0 && (
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {violations.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Pill tone="success">Ready to submit</Pill>
              <DummyVerifiedPill />
            </div>
          </div>
        )}

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

/**
 * Signed-order file input with a jurisdiction-flavoured dummy stamp badge.
 * The stamp label is read from JURISDICTION_THEME so an examiner cannot
 * confuse an UIDAI e-Sign stub with a US judge e-signature stub or a UK
 * double-lock stub.
 */
function SignedOrderUpload({
  label,
  fileName,
  fileHash,
  onFile,
  stampLabel,
  accent,
}: {
  label: string;
  fileName: string;
  fileHash: string;
  onFile: (f: File | undefined) => void;
  stampLabel: string;
  accent: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink">{label}</label>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="mt-1 block w-full text-sm text-muted file:mr-3 file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:uppercase file:tracking-register hover:file:bg-slate-100"
      />
      {fileHash && (
        <p className="mt-2 font-mono text-xs text-muted break-all">
          SHA-256: {fileHash}
        </p>
      )}
      {fileName && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-register text-white ${accent}`}
          >
            {stampLabel}
          </span>
          <span className="text-xs text-muted">{fileName}</span>
        </div>
      )}
      <StatuteRef>
        Prototype — the real system verifies the issuing authority&rsquo;s
        digital signature. This prototype stores only the SHA-256 hash of
        the uploaded PDF and stamps a jurisdiction-specific dummy badge.
      </StatuteRef>
    </div>
  );
}
