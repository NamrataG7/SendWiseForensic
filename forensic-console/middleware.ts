import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

/**
 * Route protection for the forensic console.
 *
 * Public:
 *   - /login, /auth/callback
 *   - /counsel  (defense-counsel portal landing; magic-link gated internally)
 *   - /prototype-notice
 *   - static assets
 *
 * Protected (require Supabase session):
 *   - /                      (redirect logic)
 *   - /cases, /cases/*
 *   - /authorizations, /authorizations/*
 *   - /audit
 *
 * TODO(WIRE-TO-SCHEMA): once Officer↔user role mapping is wired, gate
 * /audit to JUDICIAL_AUDITOR and /counsel/* to DEFENSE_COUNSEL.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const publicPath =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/login' ||
    pathname.startsWith('/auth/callback') ||
    pathname === '/counsel' ||
    pathname === '/prototype-notice';

  if (publicPath) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(req);

  const protectedPath =
    pathname === '/' ||
    pathname.startsWith('/cases') ||
    pathname.startsWith('/authorizations') ||
    pathname.startsWith('/audit');

  if (!protectedPath) return response;
  if (user) return response;

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)',
  ],
};
