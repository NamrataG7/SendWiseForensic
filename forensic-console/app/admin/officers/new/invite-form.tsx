'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROLES = [
  'INVESTIGATING_OFFICER',
  'SUPERVISING_OFFICER',
  'COMPETENT_AUTHORITY',
  'REVIEW_COMMITTEE',
  'FILTER_TEAM',
  'PROSECUTOR',
  'DEFENSE_COUNSEL',
  'JUDICIAL_AUDITOR',
  'DPO',
] as const;

export default function InviteOfficerForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('INVESTIGATING_OFFICER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/officers/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          fullName: fullName.trim(),
          designation: designation.trim() || null,
          role,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const detail = body?.detail ? ` — ${body.detail}` : '';
        const code = body?.code ? ` [${body.code}]` : '';
        setError(`${body?.error || 'Invitation failed.'}${detail}${code}`);
        setLoading(false);
        return;
      }
      setSuccess(`Invitation recorded for ${email}. A second admin must approve it before the magic-link is sent (dual-control).`);
      setEmail('');
      setFullName('');
      setDesignation('');
      setLoading(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation failed.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 border border-slate-200 bg-white p-6">
      <div>
        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-1">Official email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-slate-300 px-3 py-2" />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-1">Full name</label>
        <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
          className="w-full border border-slate-300 px-3 py-2" />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-1">Designation (optional)</label>
        <input type="text" value={designation} onChange={(e) => setDesignation(e.target.value)}
          className="w-full border border-slate-300 px-3 py-2" />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-1">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
          className="w-full border border-slate-300 px-3 py-2">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <p className="text-xs text-slate-500 mt-1">ADMIN role cannot be granted here (see docs/ADMIN_BOOTSTRAP.md).</p>
      </div>
      <div className="border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        The invited officer's home jurisdiction is set to your own jurisdiction automatically.
        Cross-jurisdiction invitations are not permitted from this console.
      </div>
      {error && <div className="border border-red-200 bg-red-50 text-red-800 text-sm p-3">{error}</div>}
      {success && <div className="border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm p-3">{success}</div>}
      <button type="submit" disabled={loading}
        className="w-full bg-indigo-800 hover:bg-indigo-900 disabled:bg-slate-400 text-white font-semibold uppercase tracking-widest py-3">
        {loading ? 'Recording...' : 'Record Invitation (Awaits Co-Approval)'}
      </button>
    </form>
  );
}
