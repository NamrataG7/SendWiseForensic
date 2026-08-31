'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Jurisdiction } from '@/lib/entities';
import { JURISDICTION_THEME } from '@/lib/jurisdiction-theme';

const OPTIONS: { code: Jurisdiction; name: string }[] = [
  { code: 'IN', name: 'India — IT Act §69 / Puttaswamy' },
  { code: 'US', name: 'United States — Title III / Berger' },
  { code: 'UK', name: 'United Kingdom — IPA 2016 / ECHR Art. 8' },
];

export default function OnboardingClient({
  current,
}: {
  current: Jurisdiction | null;
}) {
  const router = useRouter();
  const [pick, setPick] = useState<Jurisdiction | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!pick) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch('/api/officer/me', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ homeJurisdiction: pick }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || body.ok === false) {
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      router.push('/cases');
      router.refresh();
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="border-l-4 border-warning bg-red-50 p-4">
        <p className="text-sm font-semibold uppercase tracking-register text-warning">
          Read this carefully
        </p>
        <p className="mt-1 text-sm text-warning">
          Your home jurisdiction determines which cases you can access by
          default. Changes require an administrative grant.
          TODO(SUPPORT-HOME-JURISDICTION-CHANGE-VIA-ADMIN).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {OPTIONS.map(({ code, name }) => {
          const t = JURISDICTION_THEME[code];
          const selected = pick === code;
          return (
            <label
              key={code}
              className={`flex cursor-pointer flex-col overflow-hidden border-2 bg-white transition ${
                selected
                  ? 'border-ink shadow-lg'
                  : 'border-slate-200 hover:border-slate-400'
              }`}
            >
              <div className={`${t.headerBg} px-4 py-3 text-slate-100`}>
                <p className="font-serif text-xs italic leading-snug text-slate-200">
                  {t.prelude}
                </p>
                <p className="mt-1 text-lg font-semibold">{code}</p>
              </div>
              <div className={`h-1 ${t.accent}`} aria-hidden="true" />
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="text-sm font-medium text-ink">{name}</p>
                <p className="text-xs text-muted">{t.purgeNote}</p>
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <input
                    type="radio"
                    name="home_jurisdiction"
                    value={code}
                    checked={selected}
                    onChange={() => setPick(code)}
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

      {error && (
        <div className="border border-red-200 bg-red-50 p-3 text-sm text-warning">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!pick || isPending}
          onClick={submit}
          className="bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover disabled:bg-slate-300"
        >
          {isPending ? 'Saving…' : 'Set home jurisdiction'}
        </button>
      </div>
    </div>
  );
}
