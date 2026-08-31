import type { ReactNode } from 'react';

/**
 * StatuteRef — inline citation of the statute governing a UI field.
 * Used throughout the authorization wizard: users see WHY a field exists.
 */
export default function StatuteRef({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 text-xs italic text-muted">
      <span className="not-italic font-semibold uppercase tracking-register text-slate-500">
        Governing statute —{' '}
      </span>
      {children}
    </p>
  );
}
