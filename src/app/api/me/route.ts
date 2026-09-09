import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { planFor } from '@/lib/plans';
import { readUsage } from '@/lib/usage';
import { listThreads } from '@/lib/threads';
import { loadGraph, graphView } from '@/lib/graph';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Everything the app needs on load: who you are, your plan and usage, thread list, spaces, graph. */
export const GET = handle(async () => {
  const user = await currentUser();
  const [threads, spaces, graph, usage, connectors] = await Promise.all([
    listThreads(user.id),
    db().select().from(schema.spaces).where(eq(schema.spaces.userId, user.id)),
    loadGraph(user.id),
    readUsage(user.id),
    db().select({ id: schema.connectors.id, name: schema.connectors.name, enabled: schema.connectors.enabled, status: schema.connectors.status }).from(schema.connectors).where(eq(schema.connectors.userId, user.id)),
  ]);
  const plan = planFor(user.plan);
  return json({
    user: { id: user.id, email: user.email, name: user.name, picture: user.picture, settings: user.settings, admin: !!user.admin },
    plan: { key: plan.key, name: plan.name, caps: plan.caps, tiers: plan.tiers, questionsPerDay: plan.questionsPerDay, questionsPerMonth: plan.questionsPerMonth, researchPerMonth: plan.researchPerMonth, spaces: plan.spaces, status: user.subscriptionStatus, renewsAt: user.planRenewsAt ? new Date(user.planRenewsAt).getTime() : null },
    usage: { today: usage.day.questions, month: usage.month.questions, research: usage.month.research },
    connectors: { total: connectors.length, active: connectors.filter(c => c.enabled && c.status === 'ok').length, limit: user.admin ? 100 : plan.caps.connectors },
    threads,
    spaces: spaces.map(s => ({ ...s, createdAt: new Date(s.createdAt).getTime() })),
    graph: graphView(graph, plan.caps),
    graphSize: Object.keys(graph.nodes).length,
  });
});

const Settings = z.object({ mode: z.enum(['search', 'research']).optional(), tier: z.enum(['quick', 'default', 'complex']).optional(), focus: z.enum(['web', 'academic', 'writing', 'math', 'code']).optional(), length: z.enum(['concise', 'balanced', 'detailed']).optional(), demoPlan: z.enum(['free', 'pro', 'team', '']).optional() });
export const PATCH = handle(async (req: Request) => {
  const user = await currentUser();
  const b = Settings.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid settings');
  const patch: Record<string, unknown> = { ...b.data };
  if ('demoPlan' in patch) { if (!user.admin) delete patch.demoPlan; else if (!patch.demoPlan) patch.demoPlan = undefined; }
  const settings = { ...(user.settings || {}), ...patch };
  for (const k of Object.keys(settings)) if (settings[k] === undefined) delete settings[k];
  await db().update(schema.users).set({ settings }).where(eq(schema.users.id, user.id));
  return json({ settings });
});
