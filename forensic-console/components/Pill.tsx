import type { ReactNode } from 'react';

type Tone = 'warning' | 'success' | 'muted' | 'primary';

const toneClass: Record<Tone, string> = {
  warning: 'bg-warning text-white',
  success: 'bg-success text-white',
  muted: 'bg-slate-100 text-slate-700 border border-slate-200',
  primary: 'bg-indigo-50 text-primary border border-indigo-100',
};

/**
 * Pill — small status/badge chip. Compulsory for every "dummy verified"
 * indicator in the UI per PROTOTYPE_NOTICE.md.
 */
export function Pill({
  tone = 'muted',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-register ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

export function DummyVerifiedPill() {
  return <Pill tone="warning">Dummy Verified — Prototype</Pill>;
}
