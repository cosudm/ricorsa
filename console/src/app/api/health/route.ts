import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from '@cloudflare/workers-types';
import { auth0Configured } from '@/lib/auth0';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * A public check that the console is deployed and reachable. It says whether sign-in is configured (the secrets
 * are set on the Worker) and whether the two databases answer, and nothing about the data in them.
 */
export async function GET() {
  const checks = { signIn: auth0Configured(), consoleDb: false, ricorsaDb: false };
  try {
    const env = getCloudflareContext().env as unknown as { DB?: D1Database; RICORSA?: D1Database };
    checks.consoleDb = await answers(env.DB);
    checks.ricorsaDb = await answers(env.RICORSA);
  } catch { /* reported as false */ }
  return json({ ok: true, service: 'ricorsa-console', time: new Date().toISOString(), ...checks }, { headers: { 'Cache-Control': 'no-store' } });
}

async function answers(d1: D1Database | undefined): Promise<boolean> {
  if (!d1) return false;
  try { return (await d1.prepare('select 1 as ok').first<{ ok: number }>())?.ok === 1; } catch { return false; }
}
