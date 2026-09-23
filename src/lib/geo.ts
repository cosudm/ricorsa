/**
 * Geography for the identity graph. When the model names a place in its <learned> block, the place becomes an entity
 * node flagged `place`; after the answer is done this module looks the place up and anchors the node to a point (and
 * a bounding box), so the Graph page can show the person's world on a map and the enterprise offer has real data.
 *
 * The geocoder speaks the Nominatim search API, the OpenStreetMap geocoder: the public instance by default (which
 * asks for an identifying User-Agent, at most one request a second and attribution, all honored here), or any
 * compatible endpoint set with GEOCODER_URL (LocationIQ, a hosted Nominatim, a company instance) with GEOCODER_KEY
 * sent as `key`. Results are cached in the config table (`geo:<slug>`) so a place is looked up once for everyone.
 * GEOCODING=off turns the whole thing off.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { slugify } from './http';
import type { GraphData, GraphNode } from './db/schema';
import { placesToGeocode } from './graph';

export type GeoHit = { lat: number; lon: number; name: string; kind: string; box?: [[number, number], [number, number]] };
type CacheRow = { hit: GeoHit | null; at: number };

const UA = 'Ricorsa/1.0 (+https://ricorsa.com; support@smeprotech.com) geocoding places a person named';
const CACHE_TTL_MS = 180 * 864e5;   // a found place is good for six months; a miss is retried after a week
const MISS_TTL_MS = 7 * 864e5;
const TIMEOUT_MS = 6000;

export function geocodingEnabled(): boolean { return process.env.GEOCODING !== 'off'; }
export function geocoderUrl(): string { return (process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org/search').replace(/\/+$/, ''); }
/** Whether the geocoder is OpenStreetMap's (which asks for attribution on the map). */
export function geocoderIsOsm(): boolean { return /openstreetmap\.org/i.test(geocoderUrl()) || !process.env.GEOCODER_URL; }

type NominatimResult = { lat?: string; lon?: string; display_name?: string; type?: string; class?: string; addresstype?: string; boundingbox?: [string, string, string, string]; importance?: number };

/** One lookup, no cache: the best match for a place name, or null. */
export async function lookupPlace(name: string, signal?: AbortSignal): Promise<GeoHit | null> {
  const u = new URL(geocoderUrl());
  u.searchParams.set('q', name.slice(0, 200)); u.searchParams.set('format', 'jsonv2'); u.searchParams.set('limit', '1'); u.searchParams.set('addressdetails', '0');
  if (process.env.GEOCODER_KEY) u.searchParams.set('key', process.env.GEOCODER_KEY);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT_MS); signal?.addEventListener('abort', () => ctl.abort());
  try {
    const res = await fetch(u.toString(), { headers: { Accept: 'application/json', 'User-Agent': UA, 'Accept-Language': 'en' }, signal: ctl.signal });
    if (!res.ok) { console.warn('[geo] lookup', res.status, name); return null; }
    const list = (await res.json()) as NominatimResult[];
    const r = Array.isArray(list) ? list[0] : null;
    if (!r || !r.lat || !r.lon) return null;
    const lat = Number(r.lat), lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const hit: GeoHit = { lat, lon, name: String(r.display_name || name).slice(0, 200), kind: String(r.addresstype || r.type || r.class || 'place').slice(0, 40) };
    if (r.boundingbox && r.boundingbox.length === 4) {
      const [s, n, w, e] = r.boundingbox.map(Number);
      if ([s, n, w, e].every(Number.isFinite)) hit.box = [[w, s], [e, n]];
    }
    return hit;
  } catch (e) { console.warn('[geo] lookup failed', name, String((e as Error)?.message || e)); return null; }
  finally { clearTimeout(t); }
}

/** A lookup through the shared cache. */
export async function geocodePlace(name: string): Promise<GeoHit | null> {
  const key = 'geo:' + slugify(name);
  const d = db();
  const row = (await d.select().from(schema.config).where(eq(schema.config.key, key)).limit(1))[0];
  const cached = row?.value as CacheRow | undefined;
  if (cached && Date.now() - cached.at < (cached.hit ? CACHE_TTL_MS : MISS_TTL_MS)) return cached.hit;
  const hit = await lookupPlace(name);
  const value: CacheRow = { hit, at: Date.now() };
  await d.insert(schema.config).values({ key, value: value as unknown as Record<string, unknown>, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.config.key, set: { value: value as unknown as Record<string, unknown>, updatedAt: new Date() } });
  return hit;
}

/** Put a hit on a node. */
export function anchor(n: GraphNode, hit: GeoHit): void {
  n.geo = { type: 'Point', coordinates: [hit.lon, hit.lat] };
  n.geoName = hit.name; n.geoKind = hit.kind; if (hit.box) n.geoBox = hit.box;
  delete n.geoFailedAt;
}

/**
 * Anchor the places the graph is still missing, a few per call (the public geocoder asks for one request a second, and
 * this runs after the answer has already been sent). Returns how many nodes changed; the caller saves the graph.
 */
export async function geocodePending(g: GraphData, max = 3): Promise<number> {
  if (!geocodingEnabled()) return 0;
  const todo = placesToGeocode(g, max);
  let changed = 0;
  for (let i = 0; i < todo.length; i++) {
    const n = todo[i];
    if (i > 0) await new Promise(r => setTimeout(r, 1100));
    try {
      const hit = await geocodePlace(n.label);
      if (hit) { anchor(n, hit); changed++; console.log('[geo] anchored', JSON.stringify({ node: n.id, name: hit.name, kind: hit.kind })); }
      else { n.geoFailedAt = Date.now(); changed++; console.log('[geo] not found', n.id); }
    } catch (e) { console.warn('[geo] geocode failed', n.id, String((e as Error)?.message || e)); n.geoFailedAt = Date.now(); changed++; }
  }
  return changed;
}
