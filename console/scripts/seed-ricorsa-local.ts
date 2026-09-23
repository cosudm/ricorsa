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
const month = new Date().toISOString().slice(0, 7);
const day = (i: number) => new Date(now - i * 86400e3).toISOString().slice(0, 10);
// id, email, name, plan, status, created, seen, paypal subscription, billing cycle
const users: Array<[string, string, string, string, string | null, number, number, string | null, string | null]> = [
  ['auth0|sample1', 'maria@northwind.example', 'Maria Lopez', 'essentials', 'ACTIVE', now - 40 * 86400e3, now - 3600e3, 'I-SAMPLE1', 'monthly'],
  ['auth0|sample2', 'dev@contoso.example', 'Devon Reyes', 'free', null, now - 3 * 86400e3, now - 86400e3, null, null],
  ['auth0|sample3', 'ops@fabrikam.example', 'Ops Fabrikam', 'professional', 'ACTIVE', now - 200 * 86400e3, now - 7200e3, 'I-SAMPLE3', 'annual'],
  ['auth0|sample4', 'sam@example.com', 'Sam Field', 'free', null, now - 1 * 86400e3, now - 600e3, null, null],
  ['auth0|sample5', 'lena@tailspin.example', 'Lena Ortiz', 'professional', 'ACTIVE', now - 120 * 86400e3, now - 5 * 3600e3, 'I-SAMPLE5', 'monthly'],
  ['auth0|sample6', 'cfo@wingtip.example', 'Wingtip Finance', 'free', 'CANCELLED', now - 150 * 86400e3, now - 20 * 86400e3, 'I-SAMPLE6', null],
];
const q = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v}'`);
const sql = users.map(([id, email, name, plan, status, created, seen, sub, cycle]) => `INSERT OR IGNORE INTO users (id, email, name, plan, subscription_status, paypal_subscription_id, billing_cycle, created_at, last_seen_at, settings) VALUES (${q(id)}, ${q(email)}, ${q(name)}, ${q(plan)}, ${q(status)}, ${q(sub)}, ${q(cycle)}, ${created}, ${seen}, '{}');`).join('\n')
  // Subscriptions: two monthly, one annual, one canceled a month ago (a churn event for the Professional monthly cohort).
  + `\nINSERT OR IGNORE INTO subscriptions (id, user_id, plan_key, paypal_plan_id, billing_cycle, status, started_at, next_billing_at, updated_at) VALUES ('I-SAMPLE1', 'auth0|sample1', 'essentials', 'P-E', 'monthly', 'ACTIVE', ${now - 40 * 86400e3}, ${now + 20 * 86400e3}, ${now});`
  + `\nINSERT OR IGNORE INTO subscriptions (id, user_id, plan_key, paypal_plan_id, billing_cycle, status, started_at, next_billing_at, updated_at) VALUES ('I-SAMPLE3', 'auth0|sample3', 'professional', 'P-PA', 'annual', 'ACTIVE', ${now - 200 * 86400e3}, ${now + 165 * 86400e3}, ${now});`
  + `\nINSERT OR IGNORE INTO subscriptions (id, user_id, plan_key, paypal_plan_id, billing_cycle, status, started_at, next_billing_at, updated_at) VALUES ('I-SAMPLE5', 'auth0|sample5', 'professional', 'P-P', 'monthly', 'ACTIVE', ${now - 120 * 86400e3}, ${now + 10 * 86400e3}, ${now});`
  + `\nINSERT OR IGNORE INTO subscriptions (id, user_id, plan_key, paypal_plan_id, billing_cycle, status, started_at, next_billing_at, cancelled_at, updated_at) VALUES ('I-SAMPLE6', 'auth0|sample6', 'professional', 'P-P', 'monthly', 'CANCELLED', ${now - 150 * 86400e3}, NULL, ${now - 30 * 86400e3}, ${now - 30 * 86400e3});`
  // Usage: monthly rows for the counters, daily rows for the trailing-30-day cost. Fabrikam (annual Professional) is past its 30 versions.
  + `\nINSERT OR IGNORE INTO usage (user_id, period, questions, research, tokens_in, tokens_out, searches, cost_micros, builds, ideas) VALUES ('auth0|sample1', 'm:${month}', 142, 6, 900000, 210000, 120, 812000, 0, 0);`
  + `\nINSERT OR IGNORE INTO usage (user_id, period, questions, research, tokens_in, tokens_out, searches, cost_micros, builds, ideas) VALUES ('auth0|sample3', 'm:${month}', 1380, 42, 30000000, 4000000, 900, 96500000, 44, 71);`
  + `\nINSERT OR IGNORE INTO usage (user_id, period, questions, research, tokens_in, tokens_out, searches, cost_micros, builds, ideas) VALUES ('auth0|sample5', 'm:${month}', 310, 9, 4000000, 600000, 260, 9800000, 6, 12);`
  + [0, 3, 9, 15, 22, 28].map(i => `\nINSERT OR IGNORE INTO usage (user_id, period, questions, research, tokens_in, tokens_out, searches, cost_micros, builds, ideas) VALUES ('auth0|sample3', 'd:${day(i)}', 230, 7, 5000000, 660000, 150, 16000000, 7, 12);`).join('')
  + [1, 8, 20].map(i => `\nINSERT OR IGNORE INTO usage (user_id, period, questions, research, tokens_in, tokens_out, searches, cost_micros, builds, ideas) VALUES ('auth0|sample5', 'd:${day(i)}', 100, 3, 1300000, 200000, 80, 3200000, 2, 4);`).join('')
  + [2, 12].map(i => `\nINSERT OR IGNORE INTO usage (user_id, period, questions, research, tokens_in, tokens_out, searches, cost_micros, builds, ideas) VALUES ('auth0|sample1', 'd:${day(i)}', 70, 3, 450000, 105000, 60, 400000, 0, 0);`).join('')
  + `\nINSERT OR IGNORE INTO threads (id, user_id, title, turns, turn_count, snippet, created_at, updated_at) VALUES ('t1', 'auth0|sample1', 'Pricing strategy for a SaaS launch', '[]', 4, '', ${now - 86400e3}, ${now - 3600e3});`;
run(['execute', 'ricorsa', '--local', '--command', sql]);
console.log('seeded', users.length, 'sample accounts');
