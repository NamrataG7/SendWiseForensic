'use client';

import { createContext, useContext } from 'react';
import type { Jurisdiction } from '@/lib/entities';

/**
 * Current-view jurisdiction. This is NOT global-state; it is the value
 * derived server-side by `getViewJurisdiction()` for the current URL and
 * pushed down as a Provider so leaf client components can theme without
 * re-reading the DB.
 */
export const JurisdictionContext = createContext<Jurisdiction | null>(null);

export function JurisdictionProvider({
  value,
  children,
}: {
  value: Jurisdiction | null;
  children: React.ReactNode;
}) {
  return (
    <JurisdictionContext.Provider value={value}>
      {children}
    </JurisdictionContext.Provider>
  );
}

export function useJurisdiction(): Jurisdiction | null {
  return useContext(JurisdictionContext);
}
