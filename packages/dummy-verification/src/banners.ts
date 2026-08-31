/**
 * Human-readable prototype banners. Every screen that renders a dummy
 * verification result MUST also render `PROTOTYPE_BANNER_TEXT` in a
 * high-visibility red badge (see docs/PROTOTYPE_NOTICE.md).
 */

export const PROTOTYPE_BANNER_TEXT =
  'PROTOTYPE — NOT FOR PRODUCTION USE. Verification is DUMMY.' as const;

export const PROTOTYPE_BANNER_STRINGS = {
  short: 'DUMMY — PROTOTYPE ONLY',
  full: PROTOTYPE_BANNER_TEXT,
  identity: 'DUMMY VERIFIED — PROTOTYPE ONLY',
  esign: 'DUMMY E-SIGN — PROTOTYPE ONLY',
  reviewCommittee: 'DUMMY QUORUM — PROTOTYPE ONLY',
} as const;

/**
 * Wrap a plain object with a top-level `_prototype` banner field so any
 * downstream serializer (log line, PDF footer, UI JSON dump) surfaces the
 * dummy marker even without knowing the token's specific shape. The
 * returned object is deeply frozen so callers cannot mutate the token
 * after the fact.
 */
export function wrapWithDummyMarker<T extends object>(
  value: T,
): Readonly<T & { _prototype: typeof PROTOTYPE_BANNER_TEXT }> {
  const wrapped = { _prototype: PROTOTYPE_BANNER_TEXT, ...value } as T & {
    _prototype: typeof PROTOTYPE_BANNER_TEXT;
  };
  return deepFreeze(wrapped);
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    for (const key of Object.keys(v as Record<string, unknown>)) {
      const child = (v as Record<string, unknown>)[key];
      if (child && typeof child === 'object') {
        deepFreeze(child);
      }
    }
    Object.freeze(v);
  }
  return v;
}
