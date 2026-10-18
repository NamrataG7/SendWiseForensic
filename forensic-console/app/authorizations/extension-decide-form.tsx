'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Approve/deny button pair for a pending warrant-extension request.
 * Mirrors RevokeForm/filter-team's decision-form.tsx conventions. Posts
 * to /api/authorizations/extensions/[id]/decide — body shape
 * { decision: 'approve' | 'deny', notes } matching that route's
 * post-fix contract. Mandatory reason (minLength=3) on deny, mirroring
 * filter-team/decision-form.tsx's mandatory-reason-on-rejection
 * convention.
 */
export default function ExtensionDecideForm({
  extensionId,
}: {
  extensionId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'approve' | 'deny' | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(decision: 'approve' | 'deny') {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/authorizations/extensions/${extensionId}/decide`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ decision, notes }),
          },
        );
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Request failed (${res.status})`);
          return;
        }
        setMode(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  if (mode === null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('approve')}
          className="border border-success bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-register text-success hover:bg-green-50"
        >
          Approve extension
        </button>
        <button
          type="button"
          onClick={() => setMode('deny')}
          className="border border-warning bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-register text-warning hover:bg-red-50"
        >
          Deny
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(mode);
      }}
      className="w-full space-y-3"
    >
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-register text-muted">
          {mode === 'deny' ? 'Reason for denial (required)' : 'Notes (optional)'}
        </label>
        <textarea
          rows={2}
          required={mode === 'deny'}
          minLength={mode === 'deny' ? 3 : undefined}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full border border-slate-300 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || (mode === 'deny' && notes.length < 3)}
          className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-register text-white hover:opacity-90 disabled:opacity-50 ${
            mode === 'approve' ? 'bg-success' : 'bg-warning'
          }`}
        >
          {isPending
            ? 'Filing…'
            : mode === 'approve'
              ? 'Confirm approval'
              : 'Confirm denial'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(null);
            setError(null);
          }}
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
