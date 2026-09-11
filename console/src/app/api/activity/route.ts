import { desc, eq } from 'drizzle-orm';
import { currentStaff } from '@/lib/session';
import { handle, json } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { activityView } from '@/lib/views';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req: Request) => {
  await currentStaff();
  const u = new URL(req.url).searchParams;
  const cid = u.get('customerId'); const limit = Math.min(500, Number(u.get('limit') || 100));
  const q = db().select().from(schema.activity);
  const rows = await (cid ? q.where(eq(schema.activity.customerId, cid)) : q).orderBy(desc(schema.activity.at)).limit(limit);
  return json({ activity: rows.map(activityView) });
});
