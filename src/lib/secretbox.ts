/**
 * Small AES-GCM box for credentials stored in the database (connector tokens). The key is derived from
 * CONNECTOR_SECRET, or AUTH0_SECRET when that is not set, so nothing extra has to be provisioned.
 * Runs on Web Crypto, so it works on Cloudflare Workers and Node alike.
 */
let keyPromise: Promise<CryptoKey> | null = null;

function keyMaterial(): string {
  const k = process.env.CONNECTOR_SECRET || process.env.AUTH0_SECRET;
  if (!k) throw new Error('CONNECTOR_SECRET (or AUTH0_SECRET) is not set');
  return k;
}

async function key(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ricorsa:secretbox:v1:' + keyMaterial()));
      return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    })();
  }
  return keyPromise;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function sealJson(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), data));
  return 'v1.' + b64(iv) + '.' + b64(ct);
}

export async function openJson<T = unknown>(sealed: string | null | undefined): Promise<T | null> {
  if (!sealed) return null;
  try {
    const [v, ivB, ctB] = sealed.split('.');
    if (v !== 'v1' || !ivB || !ctB) return null;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB) }, await key(), unb64(ctB));
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch { return null; }
}
