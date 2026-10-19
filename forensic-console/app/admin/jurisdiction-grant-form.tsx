'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Admin form to grant cross-jurisdiction access to an officer (P1.3).
 * The admin's own home jurisdiction is fixed server-side by
 * p_admin_grant_jurisdiction -- this form only needs an officer id +
 * optional reason.
 */
export default function JurisdictionGrantForm({
  jurisdiction,
}: {
  jurisdiction: 'IN' | 'US' | 'UK';
}) {
  const router = useRouter();
  const [officerId, setOfficerId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/officers/jurisdiction-grant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ officerId, jurisdiction, reason: reason || null }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Request failed (${res.status})`);
          return;
        }
        setOfficerId('');
        setReason('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs uppercase tracking-widest text-slate-500">Officer ID</label>
        <input
          value={officerId}
          onChange={(e) => setOfficerId(e.target.value)}
          placeholder="uuid"
          required
          className="mt-1 min-w-[260px] border border-slate-300 px-3 py-2 text-sm font-mono focus:border-indigo-700 focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest text-slate-500">Reason (optional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. MLAT liaison"
          className="mt-1 min-w-[200px] border border-slate-300 px-3 py-2 text-sm focus:border-indigo-700 focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={isPending || !officerId}
        className="bg-indigo-800 hover:bg-indigo-900 text-white uppercase tracking-widest text-xs font-semibold px-4 py-2 disabled:opacity-50"
      >
        {isPending ? 'Granting…' : `Grant ${jurisdiction} access`}
      </button>
      {error && (
        <div className="w-full border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}
    </form>
  );
}
