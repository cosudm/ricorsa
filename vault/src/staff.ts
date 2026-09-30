/**
 * Staff accounts and sessions for the admin screens. Staff sign in with their email and a password of their own;
 * passwords are stored as PBKDF2-SHA256 hashes, sign-in locks for a while after repeated wrong passwords, and a
 * session is a signed cookie that names the account and the moment its password last changed, so changing the
 * password signs every other session out. The staff key (ADMIN_KEY) stays as the way to create the first owner
 * account and as the recovery path when nobody can sign in.
 */
import type { Env } from './env';
import { all, first, run } from './db';
import { HttpError, base64url, hmacHex, timingSafeEqual, uid } from './util';

export type StaffRow = {
  id: string; email: string; name: string | null; role: 'owner' | 'staff'; status: 'active' | 'disabled';
  password_hash: string | null; must_change: number; failed_attempts: number; locked_until: number | null;
  password_changed_at: number | null; last_sign_in_at: number | null; created_by: string | null; created_at: number;
};
/** Who is signed in: a staff account (via password) or the staff key (via key, no account). */
export type StaffSession = { via: 'password' | 'key'; id: string | null; email: string | null; name: string | null; role: 'owner' | 'staff' | 'key'; mustChange: boolean; exp: number };

export const SESSION_TTL = 12 * 3600;
export const MIN_PASSWORD = 12;
const ITERATIONS = 310_000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

// ---------- passwords ----------
async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
}
function fromBase64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${base64url(salt)}$${base64url(new Uint8Array(hash))}`;
}
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const got = base64url(new Uint8Array(await pbkdf2(password, fromBase64url(salt), Number(iter))));
  return timingSafeEqual(got, hash);
}
/** The rules a password has to meet; throws a 400 naming the first one it breaks. */
export function checkPassword(password: string, email: string): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters`, 'weak_password');
  if (password.length > 200) throw new HttpError(400, 'That password is too long', 'weak_password');
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 4 && password.toLowerCase().includes(local)) throw new HttpError(400, 'A password should not contain your email address', 'weak_password');
  if (/^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|abcdefghijkl|qwertyuiop)/i.test(password)) throw new HttpError(400, 'Pick a less predictable password', 'weak_password');
}
/** A temporary password a person can read over the phone: 4 groups of 4 from an unambiguous alphabet. */
export function temporaryPassword(): string {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint8Array(16));
  const s = Array.from(r, b => A[b % A.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}

// ---------- sessions ----------
type Payload = { exp: number; sub: string; pc: number };
const secretOf = (env: Env) => env.LINK_SECRET || 'dev-link-secret';
function encodePayload(p: Payload): string { return base64url(new TextEncoder().encode(JSON.stringify(p))); }
function decodePayload(s: string): Payload | null { try { const p = JSON.parse(new TextDecoder().decode(fromBase64url(s))) as Payload; return typeof p.exp === 'number' && typeof p.sub === 'string' ? p : null; } catch { return null; } }

/** A session cookie value for a staff account (`sub` = its id) or for the staff key (`sub` = 'key'). */
export async function issueSession(env: Env, sub: string, passwordChangedAt: number | null): Promise<{ value: string; exp: number }> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = encodePayload({ exp, sub, pc: passwordChangedAt || 0 });
  return { value: `${payload}.${await hmacHex(secretOf(env), `admin:${payload}`)}`, exp };
}

/** The session behind a cookie, or null: expired, forged, for a disabled account, or issued before a password change. */
export async function readSession(env: Env, cookie: string | undefined): Promise<StaffSession | null> {
  if (!cookie) return null;
  const parts = cookie.split('.');
  const nowS = Math.floor(Date.now() / 1000);
  // Cookies from before staff accounts existed: `<exp>.<sig>` signed over `admin:<exp>`, a staff-key session.
  if (parts.length === 2 && /^\d+$/.test(parts[0])) {
    const [exp, sig] = parts;
    if (+exp < nowS || !timingSafeEqual(sig, await hmacHex(secretOf(env), `admin:${exp}`))) return null;
    return { via: 'key', id: null, email: null, name: null, role: 'key', mustChange: false, exp: +exp };
  }
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!timingSafeEqual(sig, await hmacHex(secretOf(env), `admin:${payload}`))) return null;
  const p = decodePayload(payload); if (!p || p.exp < nowS) return null;
  if (p.sub === 'key') return { via: 'key', id: null, email: null, name: null, role: 'key', mustChange: false, exp: p.exp };
  const row = await first<StaffRow>(env.DB, 'SELECT * FROM staff WHERE id = ?', p.sub);
  if (!row || row.status !== 'active') return null;
  if ((row.password_changed_at || 0) !== p.pc) return null;
  return { via: 'password', id: row.id, email: row.email, name: row.name, role: row.role, mustChange: !!row.must_change, exp: p.exp };
}

// ---------- accounts ----------
export const normalizeEmail = (e: string) => String(e || '').trim().toLowerCase();
export function isEmail(e: string): boolean { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

export async function staffByEmail(env: Env, email: string): Promise<StaffRow | null> { return first<StaffRow>(env.DB, 'SELECT * FROM staff WHERE email = ?', normalizeEmail(email)); }
export async function staffById(env: Env, id: string): Promise<StaffRow | null> { return first<StaffRow>(env.DB, 'SELECT * FROM staff WHERE id = ?', id); }
export async function listStaff(env: Env): Promise<StaffRow[]> { return all<StaffRow>(env.DB, 'SELECT * FROM staff ORDER BY created_at'); }
export async function ownerCount(env: Env): Promise<number> { return (await first<{ n: number }>(env.DB, `SELECT COUNT(*) AS n FROM staff WHERE role = 'owner' AND status = 'active'`))?.n || 0; }

export async function logStaff(env: Env, staffId: string | null, email: string | null, action: string, detail?: Record<string, unknown>): Promise<void> {
  await run(env.DB, 'INSERT INTO staff_log (id, staff_id, email, action, detail, at) VALUES (?, ?, ?, ?, ?, ?)', uid(), staffId, email, action, detail ? JSON.stringify(detail).slice(0, 2000) : null, Date.now()).catch(() => {});
}

/**
 * Sign in with an email and a password. The answer is the same for an unknown address, a wrong password and a
 * disabled account, so the form gives nothing away; a locked account says so, with the time.
 */
export async function signInWithPassword(env: Env, email: string, password: string): Promise<StaffRow> {
  const generic = new HttpError(401, 'That email and password do not match', 'bad_credentials');
  const row = await staffByEmail(env, email);
  if (!row || row.status !== 'active' || !row.password_hash) {
    // Spend the same time as a real check so timing does not tell an address apart.
    await verifyPassword(password, `pbkdf2$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`).catch(() => false);
    throw generic;
  }
  if (row.locked_until && row.locked_until > Date.now()) {
    const mins = Math.max(1, Math.ceil((row.locked_until - Date.now()) / 60_000));
    throw new HttpError(429, `Too many tries. Sign-in for this account opens again in ${mins} minute${mins === 1 ? '' : 's'}.`, 'locked');
  }
  if (!(await verifyPassword(password, row.password_hash))) {
    const attempts = row.failed_attempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await run(env.DB, 'UPDATE staff SET failed_attempts = ?, locked_until = ? WHERE id = ?', lock ? 0 : attempts, lock ? Date.now() + LOCK_MS : null, row.id);
    if (lock) await logStaff(env, row.id, row.email, 'staff.locked', { attempts });
    throw generic;
  }
  await run(env.DB, 'UPDATE staff SET failed_attempts = 0, locked_until = NULL, last_sign_in_at = ? WHERE id = ?', Date.now(), row.id);
  await logStaff(env, row.id, row.email, 'staff.signed_in');
  return { ...row, failed_attempts: 0, locked_until: null };
}

/** Create a staff account. With a password given it is ready to use; without one a temporary password is returned once. */
export async function createStaff(env: Env, o: { email: string; name?: string | null; role: 'owner' | 'staff'; password?: string | null; createdBy: string }): Promise<{ row: StaffRow; tempPassword: string | null }> {
  const email = normalizeEmail(o.email);
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address');
  if (await staffByEmail(env, email)) throw new HttpError(409, 'There is already a staff account with that email', 'exists');
  const temp = o.password ? null : temporaryPassword();
  const password = o.password || temp!;
  if (o.password) checkPassword(o.password, email);
  const id = uid(); const now = Date.now();
  await run(env.DB, 'INSERT INTO staff (id, email, name, role, status, password_hash, must_change, failed_attempts, password_changed_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)', id, email, o.name?.trim() || null, o.role, 'active', await hashPassword(password), temp ? 1 : 0, now, o.createdBy, now);
  await logStaff(env, id, email, 'staff.created', { role: o.role, by: o.createdBy, temporary: !!temp });
  return { row: (await staffById(env, id))!, tempPassword: temp };
}

/** Set a new password on an account (their own choice, or a temporary one from an owner) and sign its other sessions out. */
export async function setPassword(env: Env, id: string, password: string | null, o: { temporary: boolean; by: string }): Promise<string | null> {
  const row = await staffById(env, id); if (!row) throw new HttpError(404, 'No such staff account');
  const temp = password ? null : temporaryPassword();
  const next = password || temp!;
  if (password) checkPassword(password, row.email);
  await run(env.DB, 'UPDATE staff SET password_hash = ?, must_change = ?, failed_attempts = 0, locked_until = NULL, password_changed_at = ? WHERE id = ?', await hashPassword(next), o.temporary ? 1 : 0, Date.now(), id);
  await logStaff(env, id, row.email, o.temporary ? 'staff.password_reset' : 'staff.password_changed', { by: o.by });
  return temp;
}

/** What the screens see of an account: never the hash. */
export function staffView(r: StaffRow) {
  return { id: r.id, email: r.email, name: r.name, role: r.role, status: r.status, mustChange: !!r.must_change, lockedUntil: r.locked_until && r.locked_until > Date.now() ? r.locked_until : null, lastSignInAt: r.last_sign_in_at, createdAt: r.created_at, createdBy: r.created_by };
}
