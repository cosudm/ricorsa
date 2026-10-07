import { z } from 'zod';
import { after } from 'next/server';
import { eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { planFor, normalizePlanKey, GAS, GAS_LABELS, PAYG, RECHARGE, gasForUsd } from '@/lib/plans';
import { readUsage, gasState, capabilityPlan, subscriptionActive } from '@/lib/usage';
import { autoRechargeState, autoRechargeIfNeeded } from '@/lib/recharge';
import { listThreads } from '@/lib/threads';
import { loadGraph, graphView } from '@/lib/graph';
import { geocodingEnabled, geocoderIsOsm } from '@/lib/geo';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Everything the app needs on load: who you are, your plan and usage, thread list, spaces, graph. */
export const GET = handle(async () => {
  const user = await currentUser();
  const [threads, spaces, graph, usage, connectors, gas] = await Promise.all([
    listThreads(user.id),
    db().select().from(schema.spaces).where(eq(schema.spaces.userId, user.id)),
    loadGraph(user.id),
    readUsage(user.id),
    db().select({ id: schema.connectors.id, name: schema.connectors.name, enabled: schema.connectors.enabled, status: schema.connectors.status }).from(schema.connectors).where(eq(schema.connectors.userId, user.id)),
    gasState(user),
  ]);
  // The subscription's plan is what bills (Enterprise, or a subscription from before the plans were retired); the capability plan is what the person can do: the full set.
  const sub = planFor(user.plan);
  const plan = capabilityPlan(user);
  const auto = autoRechargeState(user);
  // The gauge's refresh is the safety net for auto-recharge: a low balance seen here is topped up after the reply.
  if (auto.on && !gas.unlimited && gas.remaining < auto.thresholdGas) after(async () => { try { await autoRechargeIfNeeded(user); } catch (e) { console.warn('[recharge] auto from /api/me failed', String((e as Error)?.message || e)); } });
  return json({
    user: { id: user.id, email: user.email, name: user.name, picture: user.picture, settings: user.settings, admin: !!user.admin },
    plan: { key: plan.key, name: sub.name, subscription: sub.key, capabilities: plan.key, caps: plan.caps, tiers: plan.tiers, gasPerMonth: gas.allowance, spaces: plan.spaces, status: user.subscriptionStatus, active: subscriptionActive(user), cycle: user.billingCycle || null, renewsAt: user.planRenewsAt ? new Date(user.planRenewsAt).getTime() : null, contactSales: !!sub.contactSales },
    usage: { today: usage.day.questions, month: usage.month.questions, research: usage.month.research, builds: usage.month.builds, ideas: usage.month.ideas, browserActions: usage.month.browserActions, gas: usage.month.gas },
    /** The gauge: what is left (the balance, plus any monthly allowance), what each thing costs, and where more comes from. */
    gas: { ...gas, remaining: gas.unlimited ? null : gas.remaining, costs: GAS, labels: GAS_LABELS, payg: PAYG, recharge: { gasPerUsd: RECHARGE.gasPerUsd, minUsd: RECHARGE.minUsd, maxUsd: RECHARGE.maxUsd, minGas: gasForUsd(RECHARGE.minUsd), signupGas: RECHARGE.signupGas }, auto: { on: auto.on, thresholdGas: auto.thresholdGas, usd: auto.usd, off: auto.off, card: auto.card } },
    connectors: { total: connectors.length, active: connectors.filter(c => c.enabled && c.status === 'ok').length, limit: user.admin ? 100 : plan.caps.connectors },
    threads,
    spaces: spaces.map(s => ({ ...s, createdAt: new Date(s.createdAt).getTime() })),
    graph: graphView(graph, plan.caps),
    graphSize: Object.keys(graph.nodes).length,
    /** The map view's data note: places are looked up by OpenStreetMap's geocoder unless a deployment names another. */
    geo: { enabled: geocodingEnabled(), provider: geocoderIsOsm() ? 'osm' : 'custom' },
  });
});

const Settings = z.object({ mode: z.enum(['search', 'research']).optional(), tier: z.enum(['quick', 'default', 'complex']).optional(), focus: z.enum(['web', 'academic', 'technical', 'legal', 'writing', 'math', 'code']).optional(), length: z.enum(['concise', 'balanced', 'detailed']).optional(), demoPlan: z.enum(['free', 'essentials', 'professional', 'enterprise', 'pro', 'team', '']).optional() });
export const PATCH = handle(async (req: Request) => {
  const user = await currentUser();
  const b = Settings.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid settings');
  const patch: Record<string, unknown> = { ...b.data };
  if ('demoPlan' in patch) { if (!user.admin) delete patch.demoPlan; else if (!patch.demoPlan) patch.demoPlan = undefined; else patch.demoPlan = normalizePlanKey(String(patch.demoPlan)); }
  const settings = { ...(user.settings || {}), ...patch };
  for (const k of Object.keys(settings)) if (settings[k] === undefined) delete settings[k];
  await db().update(schema.users).set({ settings }).where(eq(schema.users.id, user.id));
  return json({ settings });
});
