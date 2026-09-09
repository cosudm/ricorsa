import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from './db';
import type { Turn, ThreadOrigin } from './db/schema';
import { HttpError, plainText, truncate, uid } from './http';

export type ThreadRow = typeof schema.threads.$inferSelect;

export function summarize(t: ThreadRow) {
  return { id: t.id, title: t.title, spaceId: t.spaceId, createdAt: new Date(t.createdAt).getTime(), updatedAt: new Date(t.updatedAt).getTime(), turnCount: t.turnCount, snippet: t.snippet, origin: t.origin || null };
}
export function toClient(t: ThreadRow) {
  return { ...summarize(t), turns: t.turns };
}

export async function listThreads(userId: string) {
  const rows = await db().select({ id: schema.threads.id, title: schema.threads.title, spaceId: schema.threads.spaceId, createdAt: schema.threads.createdAt, updatedAt: schema.threads.updatedAt, turnCount: schema.threads.turnCount, snippet: schema.threads.snippet, origin: schema.threads.origin })
    .from(schema.threads).where(eq(schema.threads.userId, userId)).orderBy(desc(schema.threads.updatedAt)).limit(300);
  return rows.map(r => ({ ...r, createdAt: new Date(r.createdAt).getTime(), updatedAt: new Date(r.updatedAt).getTime() }));
}

export async function getThreadOwned(userId: string, id: string): Promise<ThreadRow> {
  const rows = await db().select().from(schema.threads).where(and(eq(schema.threads.id, id), eq(schema.threads.userId, userId))).limit(1);
  if (!rows[0]) throw new HttpError(404, 'That thread is not in your library', 'not_found');
  return rows[0];
}

export async function createThread(userId: string, title: string, spaceId: string | null, origin?: ThreadOrigin | null): Promise<ThreadRow> {
  const rows = await db().insert(schema.threads).values({ id: uid(), userId, title: truncate(title, 80), spaceId, turns: [], turnCount: 0, snippet: '', origin: origin || null }).returning();
  return rows[0];
}

export async function saveTurns(thread: ThreadRow, turns: Turn[]): Promise<void> {
  const first = turns[0];
  const snippet = truncate(plainText(first?.answer || '') || (first?.status === 'running' ? 'Answering…' : ''), 160);
  await db().update(schema.threads).set({ turns, turnCount: turns.length, snippet, updatedAt: new Date() }).where(eq(schema.threads.id, thread.id));
  thread.turns = turns; thread.turnCount = turns.length; thread.snippet = snippet; thread.updatedAt = new Date();
}

export function makeTurn(q: string, o: { mode?: string; tier?: string; focus?: string; length?: string | null }): Turn {
  return {
    id: uid(), q, mode: (o.mode === 'research' ? 'research' : 'search'), tier: (['quick', 'default', 'complex'].includes(o.tier || '') ? o.tier : 'default') as Turn['tier'],
    focus: (['web', 'academic', 'writing', 'math', 'code'].includes(o.focus || '') ? o.focus : 'web') as Turn['focus'],
    length: (['concise', 'balanced', 'detailed'].includes(o.length || '') ? o.length : null) as Turn['length'],
    createdAt: Date.now(), status: 'pending', sources: [], answer: '', related: [], learned: null, learnedMerged: false, truncated: false, tierApplied: null, error: null,
  };
}
