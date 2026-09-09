import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

export type DB = DrizzleD1Database<typeof schema>;

const cache = new WeakMap<object, DB>();

/**
 * The database handle: Cloudflare D1, reached through the `DB` binding declared in wrangler.jsonc.
 * In production the binding comes from the Worker; under `next dev` it comes from the local
 * miniflare instance that `initOpenNextCloudflareForDev()` (next.config.ts) starts, with the
 * data kept in `.wrangler/state`. Apply migrations with `npm run db:migrate:local` before the first run.
 */
export function db(): DB {
  const { env } = getCloudflareContext();
  const d1 = (env as unknown as { DB?: D1Database }).DB;
  if (!d1) throw new Error('D1 binding "DB" is missing; check wrangler.jsonc');
  let inst = cache.get(d1);
  if (!inst) { inst = drizzle(d1 as never, { schema }); cache.set(d1, inst); }
  return inst;
}

export { schema };
