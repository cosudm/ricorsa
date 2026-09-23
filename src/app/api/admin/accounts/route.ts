import { desc, sql } from 'drizzle-orm';
import { currentUser, isAdminEmail } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { normalizePlanKey, PLANS } from '@/lib/plans';
import { periods } from '@/lib/usage';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

/**
 * GET /api/admin/accounts — admins only: who has signed up and what they are doing. Totals (accounts, new in the
 * last 24 hours, new and active in the last 7 and 30 days, questions and reports this month, threads, built apps), the plan mix,
 * sign-ups per day for the last 30 days, and the 200 most recent accounts with plan, subscription status,
 * usage this month and when they were last seen. The full grid, with customers and licences, is the staff
 * console at manage.ricorsa.com; this is the quick read from inside the product.
 */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user.admin) return fail(403, 'Admins only');
  const d = db();
  const now = Date.now();
  const { month } = periods();
  const users = await d.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, plan: schema.users.plan, subscriptionStatus: schema.users.subscriptionStatus, billingCycle: schema.users.billingCycle, planRenewsAt: schema.users.planRenewsAt, createdAt: schema.users.createdAt, lastSeenAt: schema.users.lastSeenAt })
    .from(schema.users).orderBy(desc(schema.users.createdAt)).limit(5000);
  const usageRows = await d.select({ userId: schema.usage.userId, questions: schema.usage.questions, research: schema.usage.research, searches: schema.usage.searches, costMicros: schema.usage.costMicros }).from(schema.usage).where(sql`${schema.usage.period} = ${month}`);
  const usageBy = new Map(usageRows.map(r => [r.userId, r]));
  const threadCounts = await d.select({ userId: schema.threads.userId, n: sql<number>`count(*)` }).from(schema.threads).groupBy(schema.threads.userId);
  const threadsBy = new Map(threadCounts.map(r => [r.userId, Number(r.n)]));
  const buildCounts = await d.select({ userId: schema.builds.userId, n: sql<number>`count(*)` }).from(schema.builds).where(sql`${schema.builds.parentId} is null`).groupBy(schema.builds.userId);
  const buildsBy = new Map(buildCounts.map(r => [r.userId, Number(r.n)]));

  const ms = (v: Date | number | null | undefined) => v == null ? 0 : v instanceof Date ? v.getTime() : Number(v);
  const plans: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) byDay[new Date(now - i * DAY).toISOString().slice(0, 10)] = 0;
  let new1 = 0, new7 = 0, new30 = 0, active7 = 0, active30 = 0, questions = 0, research = 0, searches = 0, costMicros = 0, threads = 0, builds = 0, staff = 0;
  const accounts = users.map(u => {
    const created = ms(u.createdAt), seen = ms(u.lastSeenAt);
    const plan = normalizePlanKey(u.plan);
    const admin = isAdminEmail(u.email);
    if (admin) staff++;
    plans[plan] = (plans[plan] || 0) + 1;
    if (now - created < DAY) new1++;
    if (now - created < 7 * DAY) new7++;
    if (now - created < 30 * DAY) { new30++; const k = new Date(created).toISOString().slice(0, 10); if (k in byDay) byDay[k]++; }
    if (now - seen < 7 * DAY) active7++;
    if (now - seen < 30 * DAY) active30++;
    const us = usageBy.get(u.id);
    questions += us?.questions || 0; research += us?.research || 0; searches += us?.searches || 0; costMicros += us?.costMicros || 0;
    const t = threadsBy.get(u.id) || 0, b = buildsBy.get(u.id) || 0; threads += t; builds += b;
    return { id: u.id, email: u.email, name: u.name, plan, planName: PLANS[plan]?.name || plan, subscriptionStatus: u.subscriptionStatus, billingCycle: u.billingCycle || null, planRenewsAt: ms(u.planRenewsAt) || null, createdAt: created, lastSeenAt: seen, admin, questionsThisMonth: us?.questions || 0, researchThisMonth: us?.research || 0, threads: t, builds: b };
  });
  return json({
    at: now,
    totals: { accounts: users.length, staff, new1, new7, new30, active7, active30, questionsThisMonth: questions, researchThisMonth: research, searchesThisMonth: searches, costThisMonthUsd: Math.round(costMicros / 10_000) / 100, threads, builds },
    plans, signupsByDay: byDay,
    accounts: accounts.slice(0, 200),
  });
});
