'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * POSTs /api/exports/[id]/generate. On success the response is a PDF
 * stream — we turn it into an object URL and trigger a browser download,
 * then refresh the page so the certificate ref appears in the summary.
 */
export default function GenerateButton({ exportId }: { exportId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, unknown> | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    setDetails(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/exports/${exportId}/generate`, {
          method: 'POST',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            brokenAtIndex?: number;
            reason?: string;
            quarantinedIds?: string[];
          };
          setError(body.error ?? `Request failed (${res.status})`);
          if (
            body.brokenAtIndex !== undefined ||
            body.quarantinedIds !== undefined
          ) {
            setDetails(body as Record<string, unknown>);
          }
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bsa63-${exportId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClick}
          disabled={isPending}
          className="bg-success px-4 py-2 text-xs font-semibold uppercase tracking-register text-white hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Generating…' : 'Generate BSA §63 certificate'}
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-sm bg-warning px-2 py-0.5 text-[11px] font-semibold uppercase tracking-register text-white">
          Dummy-signed — Prototype
        </span>
      </div>
      {error && (
        <div className="border border-red-200 bg-red-50 p-3 text-xs text-warning">
          <p className="font-semibold">{error}</p>
          {details && (
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px]">
              {JSON.stringify(details, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
