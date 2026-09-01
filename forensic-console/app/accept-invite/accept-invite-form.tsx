'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function AcceptInviteForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      // Set the password on the Supabase user (session already established via magic-link)
      const { data: userData, error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message);
        setLoading(false);
        return;
      }
      // Server route creates the officer row from the invitation record
      const res = await fetch('/api/officer/accept-invite', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || 'Failed to complete onboarding.');
        setLoading(false);
        return;
      }
      router.push('/cases');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 border border-slate-200 bg-white p-6">
      <div>
        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-1">New password</label>
        <input type="password" required minLength={8} value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
          className="w-full border border-slate-300 px-3 py-2" />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-1">Confirm password</label>
        <input type="password" required minLength={8} value={confirm}
          onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
          className="w-full border border-slate-300 px-3 py-2" />
      </div>
      {error && <div className="border border-red-200 bg-red-50 text-red-800 text-sm p-3">{error}</div>}
      <button type="submit" disabled={loading}
        className="w-full bg-indigo-800 hover:bg-indigo-900 disabled:bg-slate-400 text-white font-semibold uppercase tracking-widest py-3">
        {loading ? 'Completing...' : 'Set Password and Continue'}
      </button>
    </form>
  );
}
