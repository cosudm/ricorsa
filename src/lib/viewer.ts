import { auth0, devFakeUserEnabled } from './auth0';

/** Who is viewing a page, without touching the database. */
export async function viewer(): Promise<{ sub: string; name?: string; email?: string } | null> {
  if (devFakeUserEnabled()) return { sub: 'dev|local', name: 'Dev User', email: 'dev@example.com' };
  try {
    const s = await auth0().getSession();
    return s?.user?.sub ? { sub: s.user.sub, name: s.user.name ?? undefined, email: s.user.email ?? undefined } : null;
  } catch { return null; }
}
