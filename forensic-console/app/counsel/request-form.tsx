'use client';

import { useState } from 'react';

export default function CounselRequestForm() {
  const [state, setState] = useState({
    fullName: '',
    barCouncilId: '',
    email: '',
    caseRef: '',
    jurisdiction: 'IN' as 'IN' | 'US' | 'UK',
    reason: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      const res = await fetch('/api/counsel/request-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(state),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(`${body?.error || 'Request failed.'}${body?.detail ? ' — ' + body.detail : ''}`);
        setLoading(false);
        return;
      }
      setSuccess(true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm p-4">
        Request submitted. An administrator will review it. If approved, you will receive a magic-link email.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 border border-slate-200 bg-white p-6">
      <Field label="Full name">
        <input required value={state.fullName} onChange={(e) => setState({ ...state, fullName: e.target.value })} className="w-full border border-slate-300 px-3 py-2" />
      </Field>
      <Field label="Bar Council ID">
        <input required value={state.barCouncilId} onChange={(e) => setState({ ...state, barCouncilId: e.target.value })} className="w-full border border-slate-300 px-3 py-2" />
      </Field>
      <Field label="Official email">
        <input type="email" required value={state.email} onChange={(e) => setState({ ...state, email: e.target.value })} className="w-full border border-slate-300 px-3 py-2" />
      </Field>
      <Field label="Case reference (FIR / docket)">
        <input required value={state.caseRef} onChange={(e) => setState({ ...state, caseRef: e.target.value })} className="w-full border border-slate-300 px-3 py-2" />
      </Field>
      <Field label="Jurisdiction">
        <select value={state.jurisdiction} onChange={(e) => setState({ ...state, jurisdiction: e.target.value as any })} className="w-full border border-slate-300 px-3 py-2">
          <option value="IN">IN — India</option>
          <option value="US">US — United States</option>
          <option value="UK">UK — United Kingdom</option>
        </select>
      </Field>
      <Field label="Reason for access">
        <textarea required rows={3} value={state.reason} onChange={(e) => setState({ ...state, reason: e.target.value })} className="w-full border border-slate-300 px-3 py-2" />
      </Field>
      {error && <div className="border border-red-200 bg-red-50 text-red-800 text-sm p-3">{error}</div>}
      <button type="submit" disabled={loading} className="w-full bg-indigo-800 hover:bg-indigo-900 disabled:bg-slate-400 text-white uppercase tracking-widest text-xs font-semibold py-3">
        {loading ? 'Submitting...' : 'Request Magic-Link Access'}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
