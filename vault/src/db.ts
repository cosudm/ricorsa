/** Small helpers over D1: typed rows, one statement at a time, no ORM. */
export type Row = Record<string, unknown>;

export async function all<T = Row>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const r = await db.prepare(sql).bind(...params).all<T>();
  return r.results || [];
}
export async function first<T = Row>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  const r = await db.prepare(sql).bind(...params).first<T>();
  return (r as T | null) ?? null;
}
export async function run(db: D1Database, sql: string, ...params: unknown[]): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}
/** Several statements in one round trip (D1 runs them as a batch). */
export async function batch(db: D1Database, stmts: Array<[string, unknown[]]>): Promise<void> {
  if (!stmts.length) return;
  await db.batch(stmts.map(([sql, params]) => db.prepare(sql).bind(...params)));
}

export function jsonArray(s: unknown): string[] {
  if (Array.isArray(s)) return s.map(String);
  try { const v = JSON.parse(String(s || '[]')); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
