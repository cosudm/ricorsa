#!/usr/bin/env node
/**
 * Upload a folder tree into an open Vault batch.
 *
 *   node scripts/upload.mjs --url https://vault.vdrpros.com --batch <batch id> --key <batch key> [--matter <id>] [--folder <id>] [--concurrency 6] [--seal] <folder>
 *
 * Every file is hashed (SHA-256) first and listed in a manifest; files the Vault already holds are skipped; each
 * upload carries its hash so the Vault can refuse a corrupted transfer. Nothing is modified. With --seal the batch
 * is sealed when the last file is in. Files over 95 MB are listed and skipped (they belong in a bulk sync).
 */
import { createHash } from 'node:crypto';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const url = (opt('url', 'https://vault.vdrpros.com') || '').replace(/\/+$/, '');
const batch = opt('batch'); const key = opt('key'); const matter = opt('matter'); const folder = opt('folder');
const concurrency = Math.max(1, Math.min(16, +opt('concurrency', '6')));
const seal = args.includes('--seal');
const positional = []; for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === '--seal') continue; if (a.startsWith('--')) { i++; continue; } positional.push(a); }
const root = positional[0];
if (!batch || !key || !root) { console.error('usage: upload.mjs --url <vault> --batch <id> --key <key> [--matter <id>] [--folder <id>] [--concurrency 6] [--seal] <folder>'); process.exit(2); }

const MAX = 95 * 1024 * 1024;
const headers = { Authorization: `Bearer ${key}` };

async function walk(dir, out) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; await walk(p, out); }
    else if (e.isFile() && !e.name.startsWith('.') && e.name !== 'Thumbs.db' && e.name !== 'desktop.ini') out.push(p);
  }
  return out;
}
const sha = async p => createHash('sha256').update(await readFile(p)).digest('hex');

const t0 = Date.now();
const files = await walk(root, []);
console.log(`${files.length} files under ${root}; hashing`);
const manifest = []; const big = [];
for (const p of files) {
  const s = await stat(p);
  if (s.size > MAX) { big.push(p); continue; }
  manifest.push({ path: relative(root, p).split(sep).join('/'), size: s.size, sha256: await sha(p), file: p });
}
if (big.length) console.log(`${big.length} files over 95 MB skipped (list them for the bulk sync):\n  ` + big.join('\n  '));

const mres = await fetch(`${url}/api/intake/batches/${batch}/manifest`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ files: manifest.map(({ path, size, sha256 }) => ({ path, size, sha256 })) }) });
if (!mres.ok) { console.error('manifest refused:', mres.status, await mres.text()); process.exit(1); }
const m = await mres.json();
const known = m.known || {};
console.log(`manifest recorded: ${m.expected} files, ${Object.keys(known).length} already in the Vault`);

let done = 0, dup = 0, failed = 0, bytes = 0; const queue = manifest.slice(); const failures = [];
async function worker() {
  for (;;) {
    const f = queue.shift(); if (!f) return;
    if (known[f.sha256]) { dup++; done++; continue; }
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const q = new URLSearchParams({ path: f.path, sha256: f.sha256 }); if (matter) q.set('matter', matter); if (folder) q.set('folder', folder);
        const r = await fetch(`${url}/api/intake/batches/${batch}/files?${q}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: await readFile(f.file) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
        if (!r.ok) { failures.push(`${f.path}: ${j.error || r.status}`); failed++; break; }
        if (j.duplicate) dup++; done++; bytes += f.size; break;
      } catch (e) {
        if (attempt === 4) { failures.push(`${f.path}: ${e.message}`); failed++; }
        else await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    if ((done + failed) % 50 === 0) console.log(`  ${done + failed}/${manifest.length} (${dup} duplicates, ${failed} failed, ${(bytes / 1048576).toFixed(1)} MB)`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
console.log(`uploaded ${done - dup}, skipped ${dup} duplicates, ${failed} failed, ${(bytes / 1048576).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures.length) console.log('failed:\n  ' + failures.join('\n  '));
if (seal && !failed) {
  const s = await fetch(`${url}/api/intake/batches/${batch}/seal`, { method: 'POST', headers });
  const j = await s.json().catch(() => ({}));
  console.log(s.ok ? `sealed: ${j.seal} (${j.files} files${j.missing && j.missing.length ? `, ${j.missing.length} listed but never received` : ''})` : `seal refused: ${j.error || s.status}`);
} else if (seal) console.log('not sealed: fix the failures and run again (already-held files are skipped)');
