'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function RevokeJurisdictionGrantButton({
  officerId,
  jurisdiction,
}: {
  officerId: string;
  jurisdiction: 'IN' | 'US' | 'UK';
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!confirm('Revoke this officer\'s cross-jurisdiction access?')) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/officers/jurisdiction-grant/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ officerId, jurisdiction }),
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
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="text-xs uppercase tracking-widest text-red-700 border border-red-300 hover:bg-red-50 px-3 py-1 disabled:opacity-50"
      >
        {isPending ? 'Revoking…' : 'Revoke'}
      </button>
      {error && <div className="mt-1 text-xs text-red-700">{error}</div>}
    </div>
  );
}
