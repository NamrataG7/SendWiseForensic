'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

interface Props {
  className?: string;
  label?: string;
}

export default function LogoutButton({ className, label = 'Sign out' }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={
        className ??
        'text-xs uppercase tracking-widest text-slate-600 hover:text-red-700 border border-slate-300 hover:border-red-700 px-3 py-2 disabled:opacity-50'
      }
    >
      {loading ? '...' : label}
    </button>
  );
}
