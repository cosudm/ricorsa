import { NextRequest, NextResponse } from 'next/server';
import { auth0, auth0Configured, devFakeUserEnabled } from '@/lib/auth0';

/**
 * Mounts Auth0's routes (/auth/login, /auth/logout, /auth/callback, /auth/profile) and sends signed-out visitors
 * to sign in. Every page of the console is private; the API answers 401 on its own.
 */
export async function proxy(request: NextRequest) {
  if (devFakeUserEnabled()) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/webhooks/') || pathname === '/api/health') return NextResponse.next();
  if (!auth0Configured()) {
    const body = pathname.startsWith('/api/') ? JSON.stringify({ error: 'Sign-in is not configured yet', code: 'auth_unconfigured' }) : '<!doctype html><meta charset="utf-8"><title>Ricorsa Manager Console</title><body style="font-family:system-ui;padding:48px;max-width:560px;margin:auto;color:#1B2228"><h1 style="font-weight:500">Almost there</h1><p>Sign-in for the console is still being set up. Please check back shortly.</p></body>';
    return new NextResponse(body, { status: 503, headers: { 'Content-Type': pathname.startsWith('/api/') ? 'application/json' : 'text/html; charset=utf-8', 'Retry-After': '300' } });
  }
  const res = await auth0().middleware(request);
  if (pathname.startsWith('/auth/')) return res;
  if (!pathname.startsWith('/api/')) {
    const session = await auth0().getSession(request);
    if (!session) {
      const url = new URL('/auth/login', request.nextUrl.origin);
      url.searchParams.set('returnTo', pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg|favicon.png|apple-touch-icon.png|console/|brand/).*)'],
};
