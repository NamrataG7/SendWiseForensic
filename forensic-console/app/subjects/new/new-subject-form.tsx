'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Jurisdiction } from '@/lib/entities';
import { themeFor } from '@/lib/jurisdiction-theme';

async function sha256Hex(source: string): Promise<string> {
  const data = new TextEncoder().encode(source);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * NewSubjectForm — the subject's jurisdiction is inherited from the
 * case and locked. The identity capture is jurisdiction-appropriate:
 *   IN → Aadhaar (last 4 digits + SHA-256 hash of full; raw never stored)
 *   US → SSN last 4 (SHA-256 hash of full; raw never stored)
 *   UK → NI number (SHA-256 hash; raw never stored)
 *
 * All of these are hashed client-side before submission — the server
 * never sees the raw identifier. The verifiedByStub flag is set true
 * with a mandatory DUMMY pill so no reviewer confuses the prototype for
 * a real UIDAI / SSA / HMRC verification.
 */
export default function NewSubjectForm({
  caseId,
  jurisdiction,
}: {
  caseId: string;
  jurisdiction: Jurisdiction;
}) {
  const router = useRouter();
  const theme = themeFor(jurisdiction);
  const [pseudonymousLabel, setPseudonymousLabel] = useState('');
  const [rawIdentifier, setRawIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const identifierLabel =
    jurisdiction === 'IN'
      ? 'Aadhaar number (never stored raw; hashed in-browser)'
      : jurisdiction === 'US'
      ? 'Social Security number (never stored raw; hashed in-browser)'
      : 'National Insurance number (never stored raw; hashed in-browser)';

  const identifierPlaceholder =
    jurisdiction === 'IN' ? '1234 5678 9012' : jurisdiction === 'US' ? '000-00-0000' : 'AB 12 34 56 C';

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const hash = await sha256Hex(rawIdentifier.replace(/\s|-/g, ''));
        const res = await fetch('/api/subjects', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            caseId,
            // jurisdiction is derived server-side from case; sent here for
            // clarity in the audit context. Server ignores mismatches.
            jurisdiction,
            pseudonymousLabel,
            identityRefs: {
              // Jurisdiction-tagged key so an IN aadhaarHash cannot be
              // silently swapped for a US ssnHash on read.
              [`${jurisdiction.toLowerCase()}IdentityHash`]: hash,
              verifiedByStub: true,
            },
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: { id?: string };
          error?: string;
        };
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Request failed (${res.status})`);
          return;
        }
        router.push(`/cases/${caseId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-slate-200 bg-white p-6 sm:p-8 space-y-6"
    >
      <div className={`inline-flex items-center gap-2 border ${theme.accentBorderClass} px-2.5 py-1`}>
        <span
          className={`inline-flex items-center gap-1 rounded-sm ${theme.badgeBgClass} px-2 py-0.5 text-[10px] font-semibold uppercase tracking-register`}
        >
          Jurisdiction · {theme.label} (inherited from case)
        </span>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink">
          Pseudonymous label
        </label>
        <input
          value={pseudonymousLabel}
          onChange={(e) => setPseudonymousLabel(e.target.value)}
          required
          minLength={3}
          placeholder="e.g., Subject A-7391"
          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <p className="mt-1 text-xs text-muted">
          The label shown in every officer-facing UI. The real identity is
          resolved only under an in-scope, active authorization.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink">
          {identifierLabel}
        </label>
        <input
          value={rawIdentifier}
          onChange={(e) => setRawIdentifier(e.target.value)}
          required
          minLength={5}
          placeholder={identifierPlaceholder}
          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
        />
        <p className="mt-1 text-xs text-muted">
          Only a SHA-256 hash of the identifier is submitted. The raw value
          never leaves your browser.
        </p>
      </div>

      <div className={`inline-flex items-center gap-1.5 rounded-sm ${theme.badgeBgClass} px-2 py-0.5 text-[10px] font-semibold uppercase tracking-register`}>
        {theme.dummyStampLabel}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="submit"
          disabled={isPending || !pseudonymousLabel || !rawIdentifier}
          className="bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover disabled:opacity-50"
        >
          {isPending ? 'Enrolling…' : 'Enrol subject'}
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
