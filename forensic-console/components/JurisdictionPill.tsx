import type { Jurisdiction } from '@/lib/entities';
import { JURISDICTION_THEME } from '@/lib/jurisdiction-theme';

/**
 * Coloured jurisdiction chip. Uses JURISDICTION_THEME.pillClass so every
 * surface renders IN / US / UK with the same visual identity.
 */
export function JurisdictionPill({
  jurisdiction,
  locked = false,
}: {
  jurisdiction: Jurisdiction;
  locked?: boolean;
}) {
  const theme = JURISDICTION_THEME[jurisdiction];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-register ${theme.pillClass}`}
      aria-label={`Jurisdiction ${jurisdiction}${locked ? ' (immutable)' : ''}`}
    >
      {locked ? 'LOCKED' : null}
      {locked ? <span className="opacity-60">·</span> : null}
      <span>{jurisdiction}</span>
    </span>
  );
}

/** Muted-tone variant for light backgrounds — used in tables. */
export function JurisdictionPillLight({
  jurisdiction,
}: {
  jurisdiction: Jurisdiction;
}) {
  const theme = JURISDICTION_THEME[jurisdiction];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-register text-white ${theme.accent}`}
    >
      {jurisdiction}
    </span>
  );
}
