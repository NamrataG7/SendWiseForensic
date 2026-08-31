import type { Jurisdiction } from '@/lib/entities';
import { JURISDICTION_THEME } from '@/lib/jurisdiction-theme';

/**
 * Persistent per-jurisdiction status bar. Rendered directly below the red
 * prototype banner in the root layout. Reads its jurisdiction server-side
 * from getViewJurisdiction() and applies the matching headerBg + accent +
 * serif prelude so an officer cannot mistake which court they are viewing.
 *
 * When no jurisdiction is resolvable (e.g. the officer has not yet
 * completed onboarding), the bar renders a neutral prompt directing them
 * to /onboarding/jurisdiction.
 */
export default function JurisdictionStatusBar({
  jurisdiction,
}: {
  jurisdiction: Jurisdiction | null;
}) {
  if (!jurisdiction) {
    return (
      <div className="sticky top-[36px] z-40 bg-slate-800 text-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-2 text-center text-xs uppercase tracking-register">
          Home jurisdiction not set —{' '}
          <a
            href="/onboarding/jurisdiction"
            className="underline decoration-dotted underline-offset-4 hover:text-white"
          >
            complete onboarding to unlock cases
          </a>
        </div>
      </div>
    );
  }

  const theme = JURISDICTION_THEME[jurisdiction];

  return (
    <div className={`sticky top-[36px] z-40 ${theme.headerBg} text-slate-100`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <div
          className={`h-1.5 w-16 shrink-0 ${theme.accent}`}
          aria-hidden="true"
        />
        <p className="flex-1 text-center font-serif text-sm italic tracking-wide text-slate-100 sm:text-base">
          {theme.prelude}
        </p>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-register ${theme.pillClass}`}
        >
          {jurisdiction}
        </span>
      </div>
    </div>
  );
}
