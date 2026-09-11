import type { Env } from '../env';
import type { Page } from '../shard-do';
import { paginate, tidy } from './text';

/**
 * OCR providers behind one interface. Scans and images are sent out, the recognised text comes back page by page
 * with a confidence figure; a provider that works asynchronously hands back an operation to poll later, which the
 * queue does with a delay instead of holding a Worker open. `none` records the file as awaiting OCR.
 */
export type OcrOutcome =
  | { kind: 'done'; pages: Page[]; confidence: number | null; provider: string }
  | { kind: 'pending'; operation: string; provider: string }
  | { kind: 'failed'; error: string; provider: string }
  | { kind: 'unavailable'; provider: 'none' };

export interface OcrProvider {
  name: string;
  start(bytes: Uint8Array, mime: string, name: string): Promise<OcrOutcome>;
  poll(operation: string): Promise<OcrOutcome>;
}

export function ocrProvider(env: Env): OcrProvider {
  const which = (env.OCR_PROVIDER || 'none').toLowerCase();
  if (which === 'azure' && env.AZURE_DI_ENDPOINT && env.AZURE_DI_KEY) return azure(env.AZURE_DI_ENDPOINT, env.AZURE_DI_KEY);
  if (which === 'moonshot' && env.MOONSHOT_API_KEY) return moonshot(env.MOONSHOT_API_KEY, env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1');
  return none;
}

const none: OcrProvider = {
  name: 'none',
  async start() { return { kind: 'unavailable', provider: 'none' }; },
  async poll() { return { kind: 'unavailable', provider: 'none' }; },
};

/** Azure AI Document Intelligence, prebuilt-read: pages, lines, words and confidences. Asynchronous. */
function azure(endpoint: string, key: string): OcrProvider {
  const base = endpoint.replace(/\/+$/, '');
  const headers = { 'Ocp-Apim-Subscription-Key': key };
  return {
    name: 'azure',
    async start(bytes, mime) {
      const res = await fetch(`${base}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30`, { method: 'POST', headers: { ...headers, 'Content-Type': mime || 'application/octet-stream' }, body: bytes });
      if (res.status !== 202) return { kind: 'failed', error: `Azure answered ${res.status}: ${(await res.text()).slice(0, 300)}`, provider: 'azure' };
      const op = res.headers.get('operation-location');
      if (!op) return { kind: 'failed', error: 'Azure gave no operation location', provider: 'azure' };
      return { kind: 'pending', operation: op, provider: 'azure' };
    },
    async poll(operation) {
      const res = await fetch(operation, { headers });
      if (!res.ok) return { kind: 'failed', error: `Azure answered ${res.status} while polling`, provider: 'azure' };
      const j = await res.json() as { status: string; error?: { message?: string }; analyzeResult?: { content?: string; pages?: Array<{ pageNumber: number; lines?: Array<{ content: string }>; words?: Array<{ content: string; confidence?: number }> }> } };
      if (j.status === 'running' || j.status === 'notStarted') return { kind: 'pending', operation, provider: 'azure' };
      if (j.status !== 'succeeded') return { kind: 'failed', error: j.error?.message || `Azure status ${j.status}`, provider: 'azure' };
      const pages: Page[] = []; let confSum = 0, confN = 0;
      for (const p of j.analyzeResult?.pages || []) {
        const text = tidy((p.lines || []).map(l => l.content).join('\n'));
        pages.push({ page: p.pageNumber, text });
        for (const w of p.words || []) if (typeof w.confidence === 'number') { confSum += w.confidence; confN++; }
      }
      if (!pages.length && j.analyzeResult?.content) pages.push(...paginate(j.analyzeResult.content));
      return { kind: 'done', pages, confidence: confN ? Math.round((confSum / confN) * 1000) / 1000 : null, provider: 'azure' };
    },
  };
}

/** Moonshot's file extraction service (the same one Ricorsa uses for scans): whole-document text, paged by length. */
function moonshot(apiKey: string, base: string): OcrProvider {
  const auth = { Authorization: `Bearer ${apiKey}` };
  return {
    name: 'moonshot',
    async start(bytes, mime, name) {
      const form = new FormData();
      form.append('purpose', 'file-extract');
      form.append('file', new Blob([bytes as unknown as ArrayBuffer], { type: mime || 'application/octet-stream' }), name);
      const up = await fetch(`${base}/files`, { method: 'POST', headers: auth, body: form });
      if (!up.ok) return { kind: 'failed', error: `Moonshot upload answered ${up.status}: ${(await up.text()).slice(0, 300)}`, provider: 'moonshot' };
      const meta = await up.json() as { id: string };
      try {
        const res = await fetch(`${base}/files/${meta.id}/content`, { headers: auth });
        if (!res.ok) return { kind: 'failed', error: `Moonshot content answered ${res.status}`, provider: 'moonshot' };
        const raw = await res.text(); let text = raw;
        try { const j = JSON.parse(raw) as { content?: string; text?: string }; if (typeof j.content === 'string') text = j.content; else if (typeof j.text === 'string') text = j.text; } catch { /* plain text */ }
        return { kind: 'done', pages: paginate(text), confidence: null, provider: 'moonshot' };
      } finally {
        fetch(`${base}/files/${meta.id}`, { method: 'DELETE', headers: auth }).catch(() => {});
      }
    },
    async poll() { return { kind: 'failed', error: 'Moonshot extraction does not poll', provider: 'moonshot' }; },
  };
}
