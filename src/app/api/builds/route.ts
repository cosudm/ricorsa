import { desc, eq, inArray } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { isStaleBuild, INTERRUPTED } from '@/lib/build';

export const dynamic = 'force-dynamic';

/** GET /api/builds — the person's build sessions, newest first, each with its latest version's state. */
export const GET = handle(async () => {
  const user = await currentUser();
  const d = db();
  const rows = await d.select({ id: schema.builds.id, rootId: schema.builds.rootId, version: schema.builds.version, title: schema.builds.title, kind: schema.builds.kind, status: schema.builds.status, summary: schema.builds.summary, category: schema.builds.category, ideaId: schema.builds.ideaId, parentId: schema.builds.parentId, lineage: schema.builds.lineage, createdAt: schema.builds.createdAt, updatedAt: schema.builds.updatedAt })
    .from(schema.builds).where(eq(schema.builds.userId, user.id)).orderBy(desc(schema.builds.updatedAt)).limit(300);
  // Versions whose stream died without saying so (a killed worker, a dropped connection) are settled as interrupted.
  const stale = rows.filter(isStaleBuild).map(r => r.id);
  if (stale.length) {
    for (const r of rows) if (stale.includes(r.id)) r.status = 'error';
    try { await d.update(schema.builds).set({ status: 'error', error: INTERRUPTED }).where(inArray(schema.builds.id, stale)); } catch (e) { console.warn('could not settle stale builds', e); }
  }
  // Fold versions into their session: one entry per root, carrying the newest version's status and count.
  const sessions = new Map<string, { id: string; title: string; kind: string; category: string | null; ideaId: string | null; lineage: string | null; status: string; summary: string; versions: number; latestId: string; createdAt: number; updatedAt: number }>();
  for (const r of rows) {
    const key = r.rootId || r.id;
    const cur = sessions.get(key);
    const at = new Date(r.updatedAt).getTime();
    if (!cur) sessions.set(key, { id: key, title: r.title, kind: r.kind, category: r.category, ideaId: r.ideaId, lineage: r.lineage, status: r.status, summary: r.summary, versions: 1, latestId: r.id, createdAt: new Date(r.createdAt).getTime(), updatedAt: at });
    else { cur.versions++; if (at > cur.updatedAt) { cur.updatedAt = at; cur.status = r.status; cur.summary = r.summary || cur.summary; cur.latestId = r.id; } if (new Date(r.createdAt).getTime() < cur.createdAt) cur.createdAt = new Date(r.createdAt).getTime(); }
  }
  return json({ builds: [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt) });
});
