import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { createIdentity } from './finix';

/** The buyer identity Finix holds for this person, made on first use (name and email, our account id in the tags) and kept on the account. */
export async function buyerIdentity(user: { id: string; email: string | null; name: string | null; finixIdentityId: string | null }): Promise<string> {
  if (user.finixIdentityId) return user.finixIdentityId;
  const parts = String(user.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || (user.email ? user.email.split('@')[0] : 'Ricorsa');
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : 'Customer';
  const identity = await createIdentity({ firstName, lastName, email: user.email, userId: user.id });
  await db().update(schema.users).set({ finixIdentityId: identity.id }).where(eq(schema.users.id, user.id));
  return identity.id;
}
