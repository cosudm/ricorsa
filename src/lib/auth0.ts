import { Auth0Client } from '@auth0/nextjs-auth0/server';

let _client: Auth0Client | null = null;

/** True when every Auth0 setting is present; public pages keep working without them, sign-in does not. */
export function auth0Configured(): boolean {
  return Boolean(process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET && process.env.AUTH0_SECRET && process.env.APP_BASE_URL);
}

export function auth0(): Auth0Client {
  if (_client) return _client;
  if (!auth0Configured()) throw new Error('Auth0 is not configured (AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, APP_BASE_URL)');
  _client = new Auth0Client({
    domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.AUTH0_CLIENT_ID!,
    clientSecret: process.env.AUTH0_CLIENT_SECRET!,
    secret: process.env.AUTH0_SECRET!,
    appBaseUrl: process.env.APP_BASE_URL!,
    authorizationParameters: { scope: 'openid profile email' },
  });
  return _client;
}

/** True only for local development with DEV_FAKE_USER=1; never in a production build. */
export function devFakeUserEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_FAKE_USER === '1';
}
