'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Approve button for a PENDING_REVIEW authorization. Mirrors RevokeForm's
 * structure/conventions. Posts to the house-standard
 * /api/authorizations/[id]/review route.
 *
 * NOTE(SCOPE): /api/authorizations/[id]/review only implements approval —
 * it unconditionally transitions PENDING_REVIEW → ACTIVE on POST and has
 * no reject/deny branch (unlike the extension-decide route). There is no
 * "reject initial issuance" endpoint anywhere in the API surface. This
 * phase's design doc assumed an approve|reject body shape; building a
 * reject button that silently calls the same unconditional-approve route
 * would be worse than not offering rejection at all, so this form only
 * offers Approve. Flagged as a deviation — a reject/deny endpoint for
 * initial issuance is a separate follow-up (out of scope here; no
 * backend change was authorised for this route this phase).
 */
export default function ApproveForm({
  authorizationId,
}: {
  authorizationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!confirm('Approve this authorization? It will transition to ACTIVE.')) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/authorizations/${authorizationId}/review`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ notes }),
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
        className="border border-success bg-white px-4 py-2 text-xs font-semibold uppercase tracking-register text-success hover:bg-green-50"
      >
        Approve
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-wrap items-center gap-3">
      <input
        name="notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="min-w-[240px] flex-1 border border-slate-300 px-3 py-2 text-sm focus:border-success focus:outline-none"
      />
      <button
        type="submit"
        disabled={isPending}
        className="border border-success bg-white px-4 py-2 text-xs font-semibold uppercase tracking-register text-success hover:bg-green-50 disabled:opacity-50"
      >
        {isPending ? 'Approving…' : 'Confirm approval'}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        disabled={isPending}
        className="border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-register text-ink hover:bg-slate-50"
      >
        Cancel
      </button>
      {error && (
        <div className="w-full border border-red-200 bg-red-50 p-3 text-xs text-warning">
          {error}
        </div>
      )}
    </form>
  );
}
