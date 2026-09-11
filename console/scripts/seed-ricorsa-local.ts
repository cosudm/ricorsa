/**
 * Local development only: give the console's local copy of the product database (binding RICORSA) the product's
 * tables and a few sample accounts, so the Sign-ups page and account panels have something to show.
 *   npm run db:seed:ricorsa:local
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const run = (args: string[]) => execFileSync('npx', ['wrangler', 'd1', ...args], { stdio: 'inherit' });
const migrations = join(__dirname, '..', '..', 'drizzle');
for (const f of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) {
  console.log('applying', f);
  try { run(['execute', 'ricorsa', '--local', '--file', join(migrations, f)]); } catch { console.log('  (skipped: already applied)'); }
}
const now = Date.now();
const users = [
  ['auth0|sample1', 'maria@northwind.example', 'Maria Lopez', 'pro', 'ACTIVE', now - 40 * 86400e3, now - 3600e3],
  ['auth0|sample2', 'dev@contoso.example', 'Devon Reyes', 'free', null, now - 3 * 86400e3, now - 86400e3],
  ['auth0|sample3', 'ops@fabrikam.example', 'Ops Fabrikam', 'team', 'ACTIVE', now - 200 * 86400e3, now - 7200e3],
  ['auth0|sample4', 'sam@example.com', 'Sam Field', 'free', null, now - 1 * 86400e3, now - 600e3],
];
const sql = users.map(([id, email, name, plan, status, created, seen]) => `INSERT OR IGNORE INTO users (id, email, name, plan, subscription_status, created_at, last_seen_at, settings) VALUES ('${id}', '${email}', '${name}', '${plan}', ${status ? `'${status}'` : 'NULL'}, ${created}, ${seen}, '{}');`).join('\n')
  + `\nINSERT OR IGNORE INTO usage (user_id, period, questions, research, tokens_in, tokens_out, searches, cost_micros) VALUES ('auth0|sample1', 'm:${new Date().toISOString().slice(0, 7)}', 142, 6, 900000, 210000, 120, 812000);`
  + `\nINSERT OR IGNORE INTO threads (id, user_id, title, turns, turn_count, snippet, created_at, updated_at) VALUES ('t1', 'auth0|sample1', 'Pricing strategy for a SaaS launch', '[]', 4, '', ${now - 86400e3}, ${now - 3600e3});`;
run(['execute', 'ricorsa', '--local', '--command', sql]);
console.log('seeded', users.length, 'sample accounts');
