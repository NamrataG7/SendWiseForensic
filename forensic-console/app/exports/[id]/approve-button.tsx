'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Approve button posts to /api/exports/[id]/approve. The server enforces
 * that the requester cannot self-approve and that a SUPERVISING_OFFICER
 * must be present among approvers before the export flips to APPROVED.
 */
export default function ApproveButton({ exportId }: { exportId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    if (!confirm('Approve this export? This is recorded to the audit chain.')) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/exports/${exportId}/approve`, {
          method: 'POST',
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Request failed (${res.status})`);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover disabled:opacity-50"
      >
        {isPending ? 'Approving…' : 'Approve export'}
      </button>
      {error && (
        <div className="border border-red-200 bg-red-50 p-2 text-xs text-warning">
          {error}
        </div>
      )}
    </div>
  );
}
