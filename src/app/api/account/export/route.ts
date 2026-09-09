import { eq } from 'drizzle-orm';
import { currentUser } from '@/lib/session';
import { handle } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { loadGraph } from '@/lib/graph';

export const dynamic = 'force-dynamic';

/** Everything we hold about the person, as one JSON download (data portability). */
export const GET = handle(async () => {
  const user = await currentUser();
  const [threads, spaces, graph] = await Promise.all([
    db().select().from(schema.threads).where(eq(schema.threads.userId, user.id)),
    db().select().from(schema.spaces).where(eq(schema.spaces.userId, user.id)),
    loadGraph(user.id),
  ]);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), user: { id: user.id, email: user.email, name: user.name, plan: user.plan }, threads, spaces, graph }, null, 2);
  return new Response(body, { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="ricorsa-export.json"' } });
});
