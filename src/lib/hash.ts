/**
 * Provenance hashing. Everything created from the identity graph gets a SHA-256 id derived from
 * the exact graph state it came from, so lineage can be traced back to where an idea originated.
 * Uses Web Crypto so it runs on Cloudflare Workers, Vercel and Node alike.
 */
import type { GraphData } from './db/schema';

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Deterministic JSON: keys sorted, no whitespace, so the same object always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const o = value as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

/** Fingerprint of the graph as it stands: every node id with its weight and count, plus the event counter. */
export async function graphFingerprint(g: GraphData): Promise<string> {
  const nodes = Object.values(g.nodes).map(n => `${n.id}:${n.weight.toFixed(3)}:${n.count}`).sort();
  const edges = Object.keys(g.edges).sort();
  return sha256Hex(canonical({ v: 1, events: g.events, nodes, edges }));
}

/** A person's stable, non-reversible subject id for provenance records (never the raw sign-in id). */
export function subjectId(userId: string): Promise<string> { return sha256Hex('ricorsa:subject:' + userId); }

/** Chain a new link onto a lineage: previous hash + what happened now. */
export function chain(prev: string | null | undefined, event: Record<string, unknown>): Promise<string> {
  return sha256Hex(canonical({ prev: prev || null, ...event }));
}

export const short = (h: string | null | undefined) => (h ? h.slice(0, 12) : '');
