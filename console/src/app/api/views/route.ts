import { z } from 'zod';
import { desc, eq, or } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json, readJson, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { parse, zText } from '@/lib/validate';

export const dynamic = 'force-dynamic';
const view = (v: typeof schema.views.$inferSelect) => ({ ...v, createdAt: v.createdAt.getTime(), updatedAt: v.updatedAt.getTime() });

/** Saved grid views: mine plus the shared ones. */
export const GET = handle(async () => {
  const me = await currentStaff();
  const rows = await db().select().from(schema.views).where(or(eq(schema.views.staffId, me.id), eq(schema.views.shared, true))).orderBy(desc(schema.views.updatedAt));
  return json({ views: rows.map(view) });
});

export const POST = handle(async (req: Request) => {
  const me = await currentStaff();
  const b = parse(z.object({ entity: zText(40).min(1), name: zText(80).min(1), shared: z.boolean().optional(), config: z.record(z.string(), z.unknown()) }), await readJson(req));
  const id = uid();
  await db().insert(schema.views).values({ id, staffId: me.id, entity: b.entity, name: b.name, shared: !!b.shared, config: b.config });
  return json({ view: view((await db().select().from(schema.views).where(eq(schema.views.id, id)))[0]) }, { status: 201 });
});
