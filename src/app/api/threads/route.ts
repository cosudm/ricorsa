import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { createThread, listThreads, summarize } from '@/lib/threads';
import { subjectId } from '@/lib/hash';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const user = await currentUser();
  return json({ threads: await listThreads(user.id) });
});

const Origin = z.object({ kind: z.enum(['discover', 'ask']), ideaId: z.string().regex(/^[a-f0-9]{64}$/).optional(), graphHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), category: z.string().max(40).optional(), title: z.string().max(120).optional(), at: z.number().optional(), subject: z.string().regex(/^[a-f0-9]{64}$/).optional() });
const Body = z.object({ title: z.string().trim().min(1).max(200), spaceId: z.string().nullable().optional(), origin: Origin.nullable().optional() });
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = Body.safeParse(await readJson(req)); if (!b.success) return fail(400, 'Invalid request');
  const origin = b.data.origin ? { ...b.data.origin, at: b.data.origin.at || Date.now(), subject: await subjectId(user.id) } : { kind: 'ask' as const, at: Date.now(), subject: await subjectId(user.id) };
  const t = await createThread(user.id, b.data.title, b.data.spaceId || null, origin);
  return json({ thread: summarize(t) });
});
