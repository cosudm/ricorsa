import type { Env } from './env';
import { all, first, run } from './db';
import { hashToken, type WorkspaceRow } from './access';
import { receipt } from './receipts';
import { HttpError, randomToken, sha256Hex, timingSafeEqual, uid } from './util';

/**
 * How an outside client (Ricorsa) gets connected to a person's Vault: the person types their Vault email in the
 * client, a one-time code arrives, they pick the workspaces to share and approve. The Vault's own sign-in is not
 * involved, and either side can revoke. The client authenticates itself with a shared secret.
 */
const CODE_TTL_MS = 10 * 60_000;
const APPROVE_TTL_MS = 30 * 60_000;
const MAX_ATTEMPTS = 5;

export function clientAuthorized(env: Env, req: Request): boolean {
  const secret = env.RICORSA_CLIENT_SECRET; if (!secret) return false;
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || ''); if (!m) return false;
  return timingSafeEqual(m[1].trim(), secret);
}

type UserRow = { id: string; tenant_id: string; email: string; name: string | null; role: string; status: string };

async function usersByEmail(env: Env, email: string): Promise<UserRow[]> {
  return all<UserRow>(env.DB, `SELECT * FROM users WHERE email = ? AND status = 'active'`, email);
}

/** Workspaces a person may share: every workspace of the tenants they own or administer, plus their memberships. */
export async function availableWorkspaces(env: Env, email: string): Promise<Array<WorkspaceRow & { tenant: string; userId: string; role: string }>> {
  const users = await usersByEmail(env, email);
  const out: Array<WorkspaceRow & { tenant: string; userId: string; role: string }> = [];
  for (const u of users) {
    const rows = u.role === 'owner' || u.role === 'admin'
      ? await all<WorkspaceRow & { tenant: string }>(env.DB, 'SELECT w.*, t.name AS tenant FROM workspaces w JOIN tenants t ON t.id = w.tenant_id WHERE w.tenant_id = ? ORDER BY w.name', u.tenant_id)
      : await all<WorkspaceRow & { tenant: string }>(env.DB, 'SELECT w.*, t.name AS tenant FROM workspaces w JOIN tenants t ON t.id = w.tenant_id JOIN members m ON m.workspace_id = w.id WHERE m.user_id = ? ORDER BY w.name', u.id);
    for (const w of rows) out.push({ ...w, userId: u.id, role: u.role });
  }
  return out;
}

export async function startChallenge(env: Env, o: { email: string; client: string; externalUser?: string | null }): Promise<{ challengeId: string; sent: boolean; devCode?: string }> {
  const email = o.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  const id = uid();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const users = await usersByEmail(env, email);
  await run(env.DB, 'INSERT INTO challenges (id, email, code_hash, client, external_user, attempts, expires_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)', id, email, await sha256Hex(`${id}:${code}`), o.client, o.externalUser || null, Date.now() + CODE_TTL_MS, Date.now());
  let sent = false; let devCode: string | undefined;
  if (users.length) {
    const r = await sendCode(env, email, code, o.client);
    sent = r.sent; if (r.devCode) devCode = r.devCode;
  }
  return { challengeId: id, sent, ...(devCode ? { devCode } : {}) };
}

export async function verifyChallenge(env: Env, o: { challengeId: string; code: string; client: string }): Promise<{ email: string; workspaces: Array<{ id: string; name: string; tenant: string; documents: number; pages: number; paperFolders: number; role: string }> }> {
  const ch = await first<{ id: string; email: string; code_hash: string; client: string; attempts: number; expires_at: number; verified_at: number | null; consumed_at: number | null }>(env.DB, 'SELECT * FROM challenges WHERE id = ? AND client = ?', o.challengeId, o.client);
  if (!ch || ch.consumed_at) throw new HttpError(400, 'Start again: this code request is no longer valid', 'challenge_gone');
  if (ch.expires_at < Date.now()) throw new HttpError(400, 'That code has expired. Request a new one.', 'expired');
  if (ch.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many tries. Request a new code.', 'too_many');
  const ok = timingSafeEqual(ch.code_hash, await sha256Hex(`${ch.id}:${String(o.code || '').trim()}`));
  await run(env.DB, 'UPDATE challenges SET attempts = attempts + 1, verified_at = COALESCE(verified_at, ?) WHERE id = ?', ok ? Date.now() : null, ch.id);
  if (!ok) throw new HttpError(400, 'That code is not right, or the address has no Vault account.', 'bad_code');
  const ws = await availableWorkspaces(env, ch.email);
  return { email: ch.email, workspaces: ws.map(w => ({ id: w.id, name: w.name, tenant: w.tenant, documents: w.doc_count, pages: w.page_count, paperFolders: w.paper_folders, role: w.role })) };
}

export async function approveChallenge(env: Env, o: { challengeId: string; client: string; workspaceIds: string[]; label?: string | null }): Promise<{ token: string; connectionId: string; email: string; workspaces: Array<{ id: string; name: string; tenant: string }> }> {
  const ch = await first<{ id: string; email: string; client: string; external_user: string | null; verified_at: number | null; consumed_at: number | null }>(env.DB, 'SELECT * FROM challenges WHERE id = ? AND client = ?', o.challengeId, o.client);
  if (!ch || ch.consumed_at) throw new HttpError(400, 'Start again: this code request is no longer valid', 'challenge_gone');
  if (!ch.verified_at) throw new HttpError(400, 'Enter the code first', 'unverified');
  if (Date.now() - ch.verified_at > APPROVE_TTL_MS) throw new HttpError(400, 'This approval took too long. Start again.', 'expired');
  const available = await availableWorkspaces(env, ch.email);
  const chosen = available.filter(w => o.workspaceIds.includes(w.id));
  if (!chosen.length) throw new HttpError(400, 'Choose at least one workspace you have access to', 'no_workspaces');
  const tenants = new Set(chosen.map(w => w.tenant_id));
  if (tenants.size > 1) throw new HttpError(400, 'Choose workspaces from one Vault account at a time; connect a second account separately', 'mixed_tenants');
  const tenantId = chosen[0].tenant_id; const userId = chosen[0].userId;
  const token = randomToken(32); const id = uid();
  await run(env.DB, 'INSERT INTO connections (id, tenant_id, user_id, client, external_user, label, workspace_ids, token_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, tenantId, userId, o.client, ch.external_user, (o.label || '').slice(0, 120) || null, JSON.stringify(chosen.map(w => w.id)), await hashToken(token), 'active', Date.now());
  await run(env.DB, 'UPDATE challenges SET consumed_at = ? WHERE id = ?', Date.now(), ch.id);
  await receipt(env.DB, tenantId, 'connection.created', id, { client: o.client, email: ch.email, workspaces: chosen.map(w => w.id), externalUser: ch.external_user });
  return { token, connectionId: id, email: ch.email, workspaces: chosen.map(w => ({ id: w.id, name: w.name, tenant: w.tenant })) };
}

export async function revokeConnection(env: Env, id: string, by: string): Promise<boolean> {
  const c = await first<{ id: string; tenant_id: string; status: string }>(env.DB, 'SELECT id, tenant_id, status FROM connections WHERE id = ?', id);
  if (!c) return false;
  if (c.status !== 'revoked') {
    await run(env.DB, `UPDATE connections SET status = 'revoked', revoked_at = ? WHERE id = ?`, Date.now(), id);
    await receipt(env.DB, c.tenant_id, 'connection.revoked', id, { by });
  }
  return true;
}

async function sendCode(env: Env, to: string, code: string, client: string): Promise<{ sent: boolean; devCode?: string }> {
  const subject = `Your Vault code: ${code}`;
  const app = client === 'ricorsa' ? 'Ricorsa' : client;
  const text = `Someone (we hope you) asked to connect ${app} to your VDRPros Vault.\n\nYour one-time code is ${code}. It works for 10 minutes.\n\nIf you did not ask for this, ignore this message; nothing is connected without the code.\n\nVDRPros Vault`;
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1B2228;max-width:520px"><p>Someone (we hope you) asked to connect <b>${app}</b> to your VDRPros Vault.</p><p style="font-size:28px;letter-spacing:4px;font-weight:600;margin:18px 0">${code}</p><p>The code works for 10 minutes. If you did not ask for this, ignore this message; nothing is connected without the code.</p><p style="color:#5B665F">VDRPros Vault</p></div>`;
  if (!env.RESEND_API_KEY) {
    console.log(`[vault] code for ${to}: ${code} (no RESEND_API_KEY; not sent)`);
    return { sent: false, devCode: /localhost|127\.0\.0\.1/.test(env.APP_BASE_URL) ? code : undefined };
  }
  const base = (env.RESEND_BASE_URL || 'https://api.resend.com').replace(/\/+$/, '');
  const res = await fetch(`${base}/emails`, { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html }) });
  if (!res.ok) { console.warn('[vault] code email failed', res.status, (await res.text()).slice(0, 300)); return { sent: false }; }
  return { sent: true };
}
