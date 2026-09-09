import { and, eq, or, asc } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle, json, fail } from '@/lib/http';
import { db, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

const RAW_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; form-action 'none'; base-uri 'none'", 'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': 'private, no-store' };

async function owned(userId: string, id: string) {
  return (await db().select().from(schema.builds).where(and(eq(schema.builds.id, id), eq(schema.builds.userId, userId))).limit(1))[0];
}

/**
 * GET /api/builds/:id — a build session: the conversation, every version (without HTML) and the
 * HTML of the newest finished version (or of ?version=n). The id may be the session's root or any version.
 * Add ?raw=1 to get a version's document itself, for a full-screen tab.
 */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const b = await owned(user.id, id);
  if (!b) return fail(404, 'Build not found', 'not_found');
  if (url.searchParams.get('raw') === '1') {
    return new Response(b.html || '<!doctype html><p>This build has no app yet.</p>', { headers: RAW_HEADERS });
  }
  const rootId = b.rootId || b.id;
  const root = b.rootId ? await owned(user.id, b.rootId) : b;
  if (!root) return fail(404, 'Build not found', 'not_found');
  const versions = await db().select().from(schema.builds).where(and(eq(schema.builds.userId, user.id), or(eq(schema.builds.id, rootId), eq(schema.builds.rootId, rootId)))).orderBy(asc(schema.builds.version));
  const wanted = url.searchParams.get('version');
  const pick = wanted ? versions.find(v => String(v.version) === wanted) : (b.rootId ? b : null);
  const current = pick || [...versions].reverse().find(v => v.status === 'done' && v.html) || versions[versions.length - 1];
  let spec: unknown = null; try { spec = JSON.parse(root.spec); } catch { spec = { title: root.title, kind: root.kind, what: root.spec }; }
  return json({
    session: { id: root.id, title: root.title, kind: root.kind, category: root.category, ideaId: root.ideaId, graphHash: root.graphHash, spec, messages: root.messages || [], createdAt: new Date(root.createdAt).getTime(), updatedAt: new Date(root.updatedAt).getTime() },
    versions: versions.map(v => ({ id: v.id, version: v.version, status: v.status, summary: v.summary, plan: v.plan, lineage: v.lineage, error: v.error, changes: v.changes, createdAt: new Date(v.createdAt).getTime() })),
    current: current ? { id: current.id, version: current.version, status: current.status, html: current.html, plan: current.plan, summary: current.summary, lineage: current.lineage, error: current.error } : null,
  });
});

/** DELETE /api/builds/:id — remove a whole session (every version) or one version. */
export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  const { id } = await ctx.params;
  const b = await owned(user.id, id);
  if (!b) return fail(404, 'Build not found', 'not_found');
  const d = db();
  if (!b.rootId) await d.delete(schema.builds).where(and(eq(schema.builds.userId, user.id), eq(schema.builds.rootId, b.id)));
  await d.delete(schema.builds).where(eq(schema.builds.id, id));
  void req;
  return json({ ok: true });
});
