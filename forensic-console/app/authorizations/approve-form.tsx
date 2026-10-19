'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Approve/reject buttons for a PENDING_REVIEW authorization. Mirrors
 * RevokeForm's structure/conventions. Posts to the house-standard
 * /api/authorizations/[id]/review route.
 *
 * P1.1 (previously a documented gap): the reject path now exists
 * (p_authorization_review_reject, 20260909000001) -- a single
 * REVIEW_COMMITTEE member's decision, in every jurisdiction, requiring a
 * non-empty reason. Transitions PENDING_REVIEW -> REJECTED (terminal,
 * distinct from REVOKED: this warrant never activated at all).
 */
export default function ApproveForm({
  authorizationId,
}: {
  authorizationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (open === 'reject') {
      if (reason.trim().length === 0) {
        setError('A reason is required to reject.');
        return;
      }
      if (!confirm('Reject this authorization? It will transition to REJECTED and can never be activated.')) {
        return;
      }
    } else if (!confirm('Approve this authorization? It will transition to ACTIVE.')) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/authorizations/${authorizationId}/review`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(
              open === 'reject' ? { action: 'reject', reason } : { action: 'approve', notes },
            ),
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
        setOpen(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen('approve')}
          className="border border-success bg-white px-4 py-2 text-xs font-semibold uppercase tracking-register text-success hover:bg-green-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => setOpen('reject')}
          className="border border-warning bg-white px-4 py-2 text-xs font-semibold uppercase tracking-register text-warning hover:bg-red-50"
        >
          Reject
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-wrap items-center gap-3">
      {open === 'reject' ? (
        <input
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          required
          minLength={3}
          className="min-w-[240px] flex-1 border border-slate-300 px-3 py-2 text-sm focus:border-warning focus:outline-none"
        />
      ) : (
        <input
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="min-w-[240px] flex-1 border border-slate-300 px-3 py-2 text-sm focus:border-success focus:outline-none"
        />
      )}
      <button
        type="submit"
        disabled={isPending}
        className={
          open === 'reject'
            ? 'border border-warning bg-white px-4 py-2 text-xs font-semibold uppercase tracking-register text-warning hover:bg-red-50 disabled:opacity-50'
            : 'border border-success bg-white px-4 py-2 text-xs font-semibold uppercase tracking-register text-success hover:bg-green-50 disabled:opacity-50'
        }
      >
        {isPending
          ? open === 'reject'
            ? 'Rejecting…'
            : 'Approving…'
          : open === 'reject'
            ? 'Confirm rejection'
            : 'Confirm approval'}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(null);
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
