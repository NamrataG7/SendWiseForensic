'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * File-objection form used inside the counsel portal.
 * Posts to POST /api/counsel/objections — the route re-validates and
 * appends SUBJECT_OBJECTION_FILED to the audit chain.
 */
export default function ObjectionForm({
  authorizationId,
  magicLinkToken,
  counselOfficerId,
}: {
  authorizationId: string;
  magicLinkToken: string;
  counselOfficerId: string;
}) {
  const router = useRouter();
  const [grounds, setGrounds] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setViolations([]);
    setOk(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/counsel/objections', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            authorizationId,
            grounds,
            magicLinkToken,
            filedByCounselOfficerId: counselOfficerId,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: { objectionId?: string };
          error?: string;
          violations?: string[];
        };
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Request failed (${res.status})`);
          setViolations(body.violations ?? []);
          return;
        }
        setOk(`Objection filed (id: ${body.data?.objectionId ?? '—'}).`);
        setGrounds('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">
          Grounds of objection
        </label>
        <textarea
          rows={4}
          required
          minLength={10}
          value={grounds}
          onChange={(e) => setGrounds(e.target.value)}
          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="e.g., scope drift beyond the categories named in the direction; disproportionate duration for the aim stated."
        />
      </div>
      <button
        type="submit"
        disabled={isPending || grounds.length < 10}
        className="bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover disabled:opacity-50"
      >
        {isPending ? 'Filing…' : 'File objection'}
      </button>
      {ok && (
        <div className="border border-emerald-200 bg-emerald-50 p-3 text-xs text-success">
          {ok}
        </div>
      )}
      {(error || violations.length > 0) && (
        <div className="border border-red-200 bg-red-50 p-3 text-xs text-warning">
          {error && <p className="font-semibold">{error}</p>}
          {violations.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {violations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
