'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Decision = 'RELEASE' | 'SUPPRESS' | 'REDACT_AND_RELEASE';

/**
 * Row-level decision modal for Filter Team console. Shown inline (no
 * overlay) to avoid a11y complications; each row expands its own decision
 * form when the reviewer clicks "Decide".
 */
export default function DecisionForm({ evidenceId }: { evidenceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<Decision>('RELEASE');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/filter-team/reviews', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ evidenceId, decision, reason }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Request failed (${res.status})`);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-filter px-3 py-1.5 text-xs font-semibold uppercase tracking-register text-filter hover:bg-amber-50"
      >
        Decide
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-register text-muted">
          Decision
        </label>
        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value as Decision)}
          className="w-full border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-filter focus:outline-none"
        >
          <option value="RELEASE">Release to investigators</option>
          <option value="SUPPRESS">Suppress from investigators</option>
          <option value="REDACT_AND_RELEASE">Redact and release</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-register text-muted">
          Reason (required)
        </label>
        <textarea
          rows={2}
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border border-slate-300 px-2 py-1.5 text-xs focus:border-filter focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || reason.length < 3}
          className="bg-filter px-3 py-1.5 text-xs font-semibold uppercase tracking-register text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Filing…' : 'Record decision'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-register text-ink hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      {error && (
        <div className="border border-red-200 bg-red-50 p-2 text-xs text-warning">
          {error}
        </div>
      )}
    </form>
  );
}
