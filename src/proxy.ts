import { NextRequest, NextResponse } from 'next/server';
import { auth0, auth0Configured, devFakeUserEnabled } from '@/lib/auth0';

/**
 * Mounts Auth0's routes (/auth/login, /auth/logout, /auth/callback, /auth/profile)
 * and sends signed-out visitors of the app pages to login.
 */
export async function proxy(request: NextRequest) {
  // www -> apex, so cookies and Auth0 callbacks live on one host
  const host = request.headers.get('host') || '';
  if (host.startsWith('www.')) { const url = new URL(request.url); url.host = host.slice(4); return NextResponse.redirect(url, 308); }
  if (devFakeUserEnabled()) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (!auth0Configured()) {
    // Marketing pages stay up while sign-in is being set up; the app itself waits.
    const needsAuth = pathname.startsWith('/auth/') || pathname === '/app' || pathname.startsWith('/app/') || pathname === '/account' || pathname.startsWith('/api/');
    if (!needsAuth) return NextResponse.next();
    const body = pathname.startsWith('/api/') ? JSON.stringify({ error: 'Sign-in is not configured yet', code: 'auth_unconfigured' }) : '<!doctype html><meta charset="utf-8"><title>Ricorsa</title><body style="font-family:system-ui;padding:48px;max-width:560px;margin:auto;color:#1B2228"><h1 style="font-weight:500">Almost there</h1><p>Sign-in for Ricorsa is still being set up. Please check back shortly.</p><p><a href="/">Back to the home page</a></p></body>';
    return new NextResponse(body, { status: 503, headers: { 'Content-Type': pathname.startsWith('/api/') ? 'application/json' : 'text/html; charset=utf-8', 'Retry-After': '300' } });
  }
  const res = await auth0().middleware(request);
  if (pathname.startsWith('/auth/')) return res;
  const protectedPage = pathname === '/app' || pathname.startsWith('/app/') || pathname === '/account';
  if (protectedPage) {
    const session = await auth0().getSession(request);
    if (!session) {
      const url = new URL('/auth/login', request.nextUrl.origin);
      url.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(url);
    }
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|favicon.svg|favicon.png|apple-touch-icon.png|sitemap.xml|robots.txt|app/assets|brand/).*)'],
};
