/**
 * PrototypeBanner — persistent, high-contrast top banner.
 *
 * Server Component. Reads NEXT_PUBLIC_PROTOTYPE (default: enabled).
 * Rendered inside <body> as the first element of the root layout so that
 * `sticky top-0` anchors it above every route.
 *
 * Compliance requirements (PROTOTYPE_NOTICE.md):
 *   - Must be visible on every route.
 *   - Must state that Aadhaar / e-Sign are dummy.
 *   - Must link to /prototype-notice.
 *   - Min height ≥ 44px; respects safe-area-inset-top on iOS.
 */
export default function PrototypeBanner() {
  const enabled =
    (process.env.NEXT_PUBLIC_PROTOTYPE ?? 'true').toLowerCase() !== 'false';
  if (!enabled) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-50 bg-warning text-white shadow-register"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div
        className="mx-auto flex min-h-[44px] max-w-7xl items-center justify-between gap-4 px-4 py-2 text-sm sm:px-6 lg:px-8"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full bg-white/90"
          />
          <p className="font-semibold tracking-wide">
            <span className="uppercase">Prototype</span>
            <span className="mx-2 opacity-70">—</span>
            <span className="font-normal">
              Not for production use. Aadhaar and e-Sign verification are
              dummy.
            </span>
          </p>
        </div>
        <a
          href="/prototype-notice"
          className="hidden shrink-0 whitespace-nowrap rounded border border-white/40 px-3 py-1 text-xs font-semibold uppercase tracking-register hover:bg-white/10 sm:inline-block"
        >
          Read notice
        </a>
      </div>
    </div>
  );
}
