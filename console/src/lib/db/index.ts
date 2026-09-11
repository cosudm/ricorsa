import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';
import * as ricorsa from './ricorsa';

export type DB = DrizzleD1Database<typeof schema>;
export type RicorsaDB = DrizzleD1Database<typeof ricorsa>;

const cache = new WeakMap<object, unknown>();
function bound<T>(name: string, make: (d1: D1Database) => T): T {
  const { env } = getCloudflareContext();
  const d1 = (env as unknown as Record<string, D1Database | undefined>)[name];
  if (!d1) throw new Error(`D1 binding "${name}" is missing; check wrangler.jsonc`);
  let inst = cache.get(d1) as T | undefined;
  if (!inst) { inst = make(d1); cache.set(d1, inst); }
  return inst;
}

/** The console's own database (binding DB). Locally a miniflare database under .wrangler/state; run `npm run db:migrate:local` first. */
export function db(): DB { return bound('DB', d1 => drizzle(d1 as never, { schema })); }
/** The product database (binding RICORSA): live accounts, subscriptions and usage. */
export function rdb(): RicorsaDB { return bound('RICORSA', d1 => drizzle(d1 as never, { schema: ricorsa })); }

export { schema, ricorsa };
