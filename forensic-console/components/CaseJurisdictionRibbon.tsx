import type { Jurisdiction } from '@/lib/entities';
import { themeFor } from '@/lib/jurisdiction-theme';

/**
 * CaseJurisdictionRibbon — full-width ribbon rendered directly below a
 * PageHeader on any case-scoped page. Repeats the register-style prelude
 * phrase, colours the left border in the jurisdiction accent, and shows
 * the statutory frame in one line.
 *
 * The intent: an officer opening a case can never mistake which regime
 * applies to the record on screen.
 */
export default function CaseJurisdictionRibbon({
  jurisdiction,
}: {
  jurisdiction: Jurisdiction;
}) {
  const theme = themeFor(jurisdiction);
  return (
    <section
      className={`mt-6 border-l-4 ${theme.accentBorderClass} ${theme.headerBgClass} px-4 py-3 sm:px-6`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p
          className={`font-serif text-sm ${theme.badgeTextClass} tracking-wide`}
        >
          {theme.registerPrelude}
        </p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm ${theme.badgeBgClass} px-2 py-0.5 text-[10px] font-semibold uppercase tracking-register`}
        >
          Jurisdiction · {theme.label}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">{theme.statutoryFrame}</p>
    </section>
  );
}
