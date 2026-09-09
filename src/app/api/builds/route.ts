import { desc, eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/builds — the person's builds, newest first, without the HTML. */
export const GET = handle(async () => {
  const user = await currentUser();
  const rows = await db().select({ id: schema.builds.id, title: schema.builds.title, kind: schema.builds.kind, status: schema.builds.status, summary: schema.builds.summary, category: schema.builds.category, ideaId: schema.builds.ideaId, parentId: schema.builds.parentId, lineage: schema.builds.lineage, createdAt: schema.builds.createdAt, updatedAt: schema.builds.updatedAt })
    .from(schema.builds).where(eq(schema.builds.userId, user.id)).orderBy(desc(schema.builds.updatedAt)).limit(100);
  return json({ builds: rows.map(r => ({ ...r, createdAt: new Date(r.createdAt).getTime(), updatedAt: new Date(r.updatedAt).getTime() })) });
});
