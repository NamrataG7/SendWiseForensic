'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message || 'Invalid credentials.');
        setLoading(false);
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 border border-slate-200 bg-white p-6">
      <div>
        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-1">Admin email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full border border-slate-300 px-3 py-2 focus:outline-none focus:border-indigo-700"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full border border-slate-300 px-3 py-2 focus:outline-none focus:border-indigo-700"
        />
      </div>
      {error && (
        <div className="border border-red-200 bg-red-50 text-red-800 text-sm p-3">{error}</div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-800 hover:bg-indigo-900 disabled:bg-slate-400 text-white font-semibold uppercase tracking-widest py-3"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
      <p className="text-xs text-slate-500 pt-2">
        Admin accounts are provisioned by SQL only. See <code>docs/ADMIN_BOOTSTRAP.md</code>.
      </p>
    </form>
  );
}
