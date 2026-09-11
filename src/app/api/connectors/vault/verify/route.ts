import { z } from 'zod';
import { currentUser } from '@/lib/session';
import { handle, json, readJson, fail } from '@/lib/http';
import { vaultClient } from '@/lib/vault';

export const dynamic = 'force-dynamic';

/** POST /api/connectors/vault/verify { challengeId, code } — checks the code; returns the workspaces the person may share. */
export const POST = handle(async (req: Request) => {
  await currentUser();
  const b = z.object({ challengeId: z.string().max(60), code: z.string().trim().max(12) }).safeParse(await readJson(req));
  if (!b.success) return fail(400, 'Enter the code from the email');
  const r = await vaultClient<{ email: string; workspaces: Array<{ id: string; name: string; tenant: string; documents: number; pages: number; paperFolders: number; role: string }> }>('/connect/verify', b.data);
  return json(r);
});
