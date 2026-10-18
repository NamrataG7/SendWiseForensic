'use client';

import { useState, useTransition } from 'react';

/**
 * Generates a single-use, 30-min-TTL device enrollment code bound to this
 * authorization. Mirrors RevokeForm's structure/conventions.
 *
 * Posts to /api/authorizations/[id]/enrollment-codes and displays the raw
 * code inline exactly once — it is never shown again after this response.
 */
export default function EnrollmentCodeForm({
  authorizationId,
}: {
  authorizationId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setViolations([]);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/authorizations/${authorizationId}/enrollment-codes`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
          },
        );
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          violations?: string[];
          data?: { code: string; expiresAt: string };
        };
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Request failed (${res.status})`);
          setViolations(body.violations ?? []);
          return;
        }
        setCode(body.data?.code ?? null);
        setExpiresAt(body.data?.expiresAt ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={isPending}
        className="border border-primary bg-white px-4 py-2 text-xs font-semibold uppercase tracking-register text-primary hover:bg-slate-50 disabled:opacity-50"
      >
        {isPending ? 'Generating…' : 'Generate device enrollment code'}
      </button>
      {code && (
        <div className="w-full border border-success bg-green-50 p-3 text-xs text-ink">
          <p className="font-mono text-base font-semibold">{code}</p>
          {expiresAt && (
            <p className="mt-1 text-xs text-muted">
              Expires {new Date(expiresAt).toLocaleString()}
            </p>
          )}
          <p className="mt-2 font-semibold text-warning">
            Hand this code to the person enrolling the device. It will not be
            shown again.
          </p>
        </div>
      )}
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
