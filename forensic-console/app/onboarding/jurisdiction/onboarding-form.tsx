'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Jurisdiction } from '@/lib/entities';
import { themeFor } from '@/lib/jurisdiction-theme';

export default function OnboardingJurisdictionForm({
  officerId,
}: {
  officerId: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<'' | Jurisdiction>('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!choice) return;
    if (
      !confirm(
        `Set your home jurisdiction to ${choice}? This choice is locked after confirmation.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        const res = await fetch('/api/officer/home-jurisdiction', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ officerId, jurisdiction: choice }),
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="border-l-4 border-warning bg-red-50 p-4">
        <p className="font-semibold uppercase tracking-register text-xs text-warning">
          Choice is locked after confirmation
        </p>
        <p className="mt-1 text-sm text-ink">
          Once set, your home jurisdiction can only be changed via an
          admin-issued officer_jurisdiction_grant. Choose carefully.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(['IN', 'US', 'UK'] as const).map((j) => {
          const t = themeFor(j);
          const selected = choice === j;
          return (
            <button
              type="button"
              key={j}
              onClick={() => setChoice(j)}
              className={`text-left border p-4 transition-colors ${
                selected
                  ? `${t.accentBorderClass} ${t.headerBgClass}`
                  : 'border-slate-200 bg-white hover:border-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-register ${t.badgeBgClass}`}
                >
                  {t.label}
                </span>
                {selected && (
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-register ${t.badgeTextClass}`}
                  >
                    Selected
                  </span>
                )}
              </div>
              <p className="mt-3 font-serif text-lg text-ink">{t.fullLabel}</p>
              <p className="mt-2 text-xs text-muted">{t.statutoryFrame}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
        <button
          type="submit"
          disabled={!choice || isPending}
          className="bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover disabled:opacity-50"
        >
          {isPending ? 'Locking…' : 'Lock jurisdiction'}
        </button>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 p-3 text-sm text-warning">
          {error}
        </div>
      )}
    </form>
  );
}
