/**
 * Server-side helper that derives the "current-view jurisdiction" from
 * the request path. This is what powers the persistent status bar and
 * the JurisdictionContext provider in the root layout.
 *
 * Route matrix:
 *   /cases/[caseId]/**            → case.jurisdiction
 *   /authorizations/[id]/**       → authorization.jurisdiction
 *   /filter-team                  → officer.home_jurisdiction
 *   everything else               → officer.home_jurisdiction (falls back
 *                                    to null if the officer has not
 *                                    completed /onboarding/jurisdiction)
 *
 * The helper NEVER trusts a query string or client cookie for
 * jurisdiction — it always reads the DB row.
 */

import { cookies, headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import type { Jurisdiction } from '@/lib/entities';

const CASE_PATH = /^\/cases\/([^/]+)(\/|$)/;
const AUTH_PATH = /^\/authorizations\/([^/]+)(\/|$)/;

/**
 * The current request URL is not directly available in a Server
 * Component. Next.js exposes it via the `x-invoke-path` / `next-url`
 * headers set by the router; we probe the standard candidates.
 */
function currentPathname(): string {
  try {
    // headers() is sync in the app router at RSC time; if called during a
    // non-request context (e.g. build), fall back to root.
    // Note: read the header synchronously — some older Next versions expose
    // this as a promise; we tolerate both.
    const h = headers() as unknown as {
      get?: (name: string) => string | null;
    };
    const candidates = [
      h.get?.('x-invoke-path'),
      h.get?.('x-matched-path'),
      h.get?.('next-url'),
      h.get?.('x-pathname'),
      h.get?.('referer'),
    ];
    for (const c of candidates) {
      if (!c) continue;
      // referer is a full URL; extract pathname
      if (c.startsWith('http')) {
        try {
          return new URL(c).pathname;
        } catch {
          continue;
        }
      }
      if (c.startsWith('/')) return c;
    }
  } catch {
    // ignore
  }
  return '/';
}

export async function getViewJurisdiction(): Promise<Jurisdiction | null> {
  const path = currentPathname();
  const supabase = createClient(await cookies());

  // Case route → case.jurisdiction
  const caseMatch = path.match(CASE_PATH);
  if (caseMatch) {
    const caseId = decodeURIComponent(caseMatch[1]);
    const { data } = await supabase
      .from('case')
      .select('jurisdiction')
      .eq('id', caseId)
      .maybeSingle();
    const j = (data as { jurisdiction?: Jurisdiction } | null)?.jurisdiction;
    if (j) return j;
  }

  // Authorization route → authorization.jurisdiction
  const authMatch = path.match(AUTH_PATH);
  if (authMatch) {
    const id = decodeURIComponent(authMatch[1]);
    // Skip the /authorizations/new literal
    if (id !== 'new') {
      const { data } = await supabase
        .from('authorization')
        .select('jurisdiction')
        .eq('id', id)
        .maybeSingle();
      const j = (data as { jurisdiction?: Jurisdiction } | null)?.jurisdiction;
      if (j) return j;
    }
  }

  // Everything else → officer's home_jurisdiction.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: officer } = await supabase
    .from('officer')
    .select('home_jurisdiction')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  return (
    ((officer as { home_jurisdiction: Jurisdiction | null } | null)
      ?.home_jurisdiction) ?? null
  );
}
