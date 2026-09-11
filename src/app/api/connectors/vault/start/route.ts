import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { planFor } from '@/lib/plans';
import { listConnectors } from '@/lib/connectors';
import { vaultClient, vaultConfigured } from '@/lib/vault';

export const dynamic = 'force-dynamic';

/** POST /api/connectors/vault/start { email } — the Vault emails a one-time code to the person's Vault address. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!vaultConfigured()) return fail(503, 'The VDRPros Vault connection is not set up on this server yet', 'vault_unconfigured');
  const plan = planFor(user.plan); const limit = user.admin ? 100 : plan.caps.connectors;
  if (limit <= 0) return fail(402, 'Connectors are part of the Pro and Team plans.', 'upgrade_required');
  if ((await listConnectors(user.id)).length >= limit) return fail(402, `The ${plan.name} plan allows ${limit} connector${limit === 1 ? '' : 's'}. Upgrade for more.`, 'upgrade_required');
  const b = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).safeParse(await readJson(req));
  if (!b.success) return fail(400, 'Enter the email address you use for the Vault');
  const r = await vaultClient<{ challengeId: string; sent: boolean; devCode?: string }>('/connect/start', { email: b.data.email, externalUser: user.id });
  // In local development the Vault hands the code back instead of emailing it; never in production.
  return json({ challengeId: r.challengeId, email: b.data.email, ...(process.env.NODE_ENV !== 'production' && r.devCode ? { devCode: r.devCode } : {}) });
});
