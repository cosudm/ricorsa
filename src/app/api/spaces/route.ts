import { z } from 'zod';
import { eq, count } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { planFor } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const user = await currentUser();
  const rows = await db().select().from(schema.spaces).where(eq(schema.spaces.userId, user.id));
  return json({ spaces: rows.map(s => ({ ...s, createdAt: new Date(s.createdAt).getTime() })) });
});

const Body = z.object({ emoji: z.string().max(8).default('🗂️'), name: z.string().trim().min(1).max(60), description: z.string().max(140).default(''), instructions: z.string().max(4000).default('') });
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request');
  const [{ n }] = await db().select({ n: count() }).from(schema.spaces).where(eq(schema.spaces.userId, user.id));
  const plan = planFor(user.plan);
  if (Number(n) >= plan.spaces) return fail(402, `The ${plan.name} plan allows ${plan.spaces} Space${plan.spaces === 1 ? '' : 's'}. Upgrade for more.`, 'upgrade_required');
  const rows = await db().insert(schema.spaces).values({ id: uid(), userId: user.id, ...b.data }).returning();
  return json({ space: { ...rows[0], createdAt: new Date(rows[0].createdAt).getTime() } });
});
