'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Purpose = 'COURT_SUBMISSION' | 'INTERNAL_REVIEW' | 'DEFENSE_DISCLOSURE';

/**
 * Client form for creating an evidence_export row. On success, navigates
 * to /exports/[id] where the approval + generate flow lives.
 */
export default function ExportRequestForm({
  caseId,
  evidenceIds,
}: {
  caseId: string;
  evidenceIds: string[];
}) {
  const router = useRouter();
  const [purpose, setPurpose] = useState<Purpose>('COURT_SUBMISSION');
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setViolations([]);
    if (evidenceIds.length === 0) {
      setError('Basket is empty. Select at least one evidence row.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/exports', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            caseId,
            evidenceIds,
            purpose,
            recipientNotice: recipient,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: { id?: string };
          error?: string;
          violations?: string[];
        };
        if (!res.ok || body.ok === false) {
          setError(body.error ?? `Request failed (${res.status})`);
          setViolations(body.violations ?? []);
          return;
        }
        const id = body.data?.id;
        if (id) router.push(`/exports/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-ink">
          Purpose of export
        </label>
        <select
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as Purpose)}
          className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="COURT_SUBMISSION">
            Court submission (BSA §63 certificate required)
          </option>
          <option value="INTERNAL_REVIEW">
            Internal review (audit-restricted; not for court)
          </option>
          <option value="DEFENSE_DISCLOSURE">
            Defense disclosure (counsel-side)
          </option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">
          Recipient notice
        </label>
        <textarea
          rows={3}
          required
          minLength={3}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Name of the court / receiving officer / counsel; delivery mode."
          className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <p className="mt-1 text-xs text-muted">
          The recipient notice is part of the audit context and appears on
          the §63 certificate cover metadata.
        </p>
      </div>
      <button
        type="submit"
        disabled={isPending || evidenceIds.length === 0}
        className="bg-primary px-5 py-2 text-xs font-semibold uppercase tracking-register text-white hover:bg-primaryHover disabled:opacity-50"
      >
        {isPending ? 'Requesting…' : 'Request export'}
      </button>
      {(error || violations.length > 0) && (
        <div className="border border-red-200 bg-red-50 p-3 text-sm text-warning">
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
