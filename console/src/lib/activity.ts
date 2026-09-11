import { db, schema } from './db';
import { uid } from './http';
import type { Staff } from './session';

/** Record who did what. Best effort: an audit line never fails the action it describes. */
export async function logActivity(actor: Staff | null, action: string, entityType: string, entityId: string | null, summary: string, opts: { customerId?: string | null; data?: Record<string, unknown> } = {}): Promise<void> {
  try {
    await db().insert(schema.activity).values({ id: uid(), actorId: actor?.id ?? null, actorEmail: actor?.email ?? null, action, entityType, entityId, customerId: opts.customerId ?? null, summary, data: opts.data ?? null });
  } catch (e) { console.warn('[activity] not recorded', action, String((e as Error)?.message || e)); }
}
