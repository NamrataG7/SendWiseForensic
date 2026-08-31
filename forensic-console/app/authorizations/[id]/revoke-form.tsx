'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Revoke button + reason input for an authorization detail page.
 *
 * Posts to /api/authorizations/[id]/revoke and refreshes the page on
 * success. Displays server-side violations inline.
 */
export default function RevokeForm({ authorizationId }: { authorizationId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setViolations([]);
    if (!confirm('Revoke this authorization? Active sessions will be terminated.')) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/authorizations/${authorizationId}/revoke`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reason }),
          },
        );
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          violations?: string[];
        };
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Request failed (${res.status})`);
          setViolations(body.violations ?? []);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-wrap items-center gap-3">
      <input
        name="reason"
        required
        minLength={1}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for revocation (required)"
        className="min-w-[240px] flex-1 border border-slate-300 px-3 py-2 text-sm focus:border-warning focus:outline-none"
      />
      <button
        type="submit"
        disabled={isPending || reason.length === 0}
        className="border border-warning bg-white px-4 py-2 text-xs font-semibold uppercase tracking-register text-warning hover:bg-red-50 disabled:opacity-50"
      >
        {isPending ? 'Revoking…' : 'Revoke authorization'}
      </button>
      {(error || violations.length > 0) && (
        <div className="w-full border border-red-200 bg-red-50 p-3 text-xs text-warning">
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
