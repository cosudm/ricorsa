import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(status: number, message: string, code?: string) {
  return NextResponse.json({ error: message, code: code || null }, { status });
}

/** Wrap a route handler so thrown HttpErrors become JSON responses. */
export function handle<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try { return await fn(...args); }
    catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message, e.code);
      console.error(e);
      return fail(500, 'Something went wrong on our side.');
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new HttpError(400, 'Body must be JSON'); }
}

export function uid(): string {
  return Date.now().toString(36) + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}
export function truncate(s: unknown, n: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}
export function slugify(s: string): string {
  return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}
export function plainText(md: string): string {
  return String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|\[\]]/g, '').replace(/\s+/g, ' ').trim();
}
