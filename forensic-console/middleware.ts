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
 *   - /api/counsel/objections (magic-link gated in the handler; TODO(COUNSEL-PORTAL))
 *
 * Protected (require Supabase session):
 *   - /                              (redirect logic)
 *   - /cases, /cases/*
 *   - /authorizations, /authorizations/*
 *   - /audit
 *   - all other /api/* (per-route role checks in the handler)
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const publicPath =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/login' ||
    pathname.startsWith('/auth/callback') ||
    pathname === '/counsel' ||
    pathname === '/prototype-notice' ||
    pathname === '/api/counsel/objections';

  if (publicPath) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(req);

  const isProtectedApi = pathname.startsWith('/api/');
  const isProtectedPage =
    pathname === '/' ||
    pathname.startsWith('/cases') ||
    pathname.startsWith('/authorizations') ||
    pathname.startsWith('/audit');

  if (!isProtectedApi && !isProtectedPage) return response;
  if (user) return response;

  if (isProtectedApi) {
    return NextResponse.json(
      { ok: false, error: 'Not authenticated' },
      { status: 401 },
    );
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)',
  ],
};
