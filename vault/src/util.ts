export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32, lower case, no i l o u

/** Time-ordered id: 8 chars of time (ms, base32) then 12 random chars. Sorts by creation, safe in URLs and file names. */
export function uid(): string {
  let t = Date.now(); let time = '';
  for (let i = 0; i < 8; i++) { time = ALPHABET[t % 32] + time; t = Math.floor(t / 32); }
  const r = crypto.getRandomValues(new Uint8Array(12)); let rand = '';
  for (const b of r) rand += ALPHABET[b % 32];
  return time + rand;
}

export function shortId(n = 10): string {
  const r = crypto.getRandomValues(new Uint8Array(n)); let s = '';
  for (const b of r) s += ALPHABET[b % 32];
  return s;
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function base64url(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function hex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = ''; for (const b of u) s += b.toString(16).padStart(2, '0');
  return s;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', buf as BufferSource));
}

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0; for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export const now = () => Date.now();

/** JSON with keys sorted, so the same facts always hash the same. */
export function canonical(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') { const o: Record<string, unknown> = {}; for (const k of Object.keys(v as object).sort()) o[k] = sortKeys((v as Record<string, unknown>)[k]); return o; }
  return v;
}

export function extOf(name: string): string { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }

const MIME: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain; charset=utf-8', csv: 'text/plain; charset=utf-8', tsv: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', rtf: 'application/rtf',
  eml: 'message/rfc822', msg: 'application/vnd.ms-outlook', json: 'application/json', xml: 'text/xml', html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  tif: 'image/tiff', tiff: 'image/tiff', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', heic: 'image/heic',
  zip: 'application/zip',
};
export function mimeFor(name: string): string { return MIME[extOf(name)] || 'application/octet-stream'; }

export function clamp(n: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, n)); }

export function truncate(s: string, n: number): string { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

/** Two business days from now, at 17:00 UTC. */
export function twoBusinessDays(from = new Date()): number {
  const d = new Date(from); let added = 0;
  while (added < 2) { d.setUTCDate(d.getUTCDate() + 1); const day = d.getUTCDay(); if (day !== 0 && day !== 6) added++; }
  d.setUTCHours(17, 0, 0, 0);
  return d.getTime();
}
