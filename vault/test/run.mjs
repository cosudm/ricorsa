/**
 * End-to-end check against a running `wrangler dev` (npm run dev) with .dev.vars:
 * tenant, person, workspace, matter, batch, upload of a folder tree, processing, search, the Ricorsa connection
 * flow (code returned in dev), the MCP tools, and the content endpoint.
 *
 *   node test/run.mjs [--url http://localhost:3180] [--key dev-staff-key] [--client dev-ricorsa-secret] [--samples ./path]
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const URL_ = opt('url', 'http://localhost:3180'); const KEY = opt('key', 'dev-staff-key'); const CLIENT = opt('client', 'dev-ricorsa-secret');
const here = dirname(fileURLToPath(import.meta.url));
const SAMPLES = opt('samples', join(here, '..', '..', '..', '..', 'tmp', 'vault-samples'));

let cookie = '';
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!cond) process.exitCode = 1; };
async function admin(path, body, method) {
  const r = await fetch(URL_ + '/api/admin' + path, { method: method || (body !== undefined ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method || 'POST'} ${path}: ${r.status} ${j.error || ''} ${(j.issues || []).join('; ')}`);
  return j;
}
async function client(path, body) {
  const r = await fetch(URL_ + '/api/clients' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CLIENT}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${j.error || ''}`);
  return j;
}
async function mcp(token, method, params, id = 1) {
  const r = await fetch(URL_ + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. staff sign-in and the tenant
await admin('/session', { key: KEY });
const health = await (await fetch(URL_ + '/api/health')).json();
ok('health', health.ok && health.db && health.files);
const stamp = Date.now().toString(36);
const tenant = (await admin('/tenants', { name: `Test Firm ${stamp}` })).tenant;
const email = `owner-${stamp}@example.com`;
await admin('/users', { tenantId: tenant.id, email, name: 'Test Owner', role: 'owner' });
await admin('/users', { tenantId: tenant.id, email: `viewer-${stamp}@example.com`, name: 'Only Viewer', role: 'viewer' });
const ws = (await admin('/workspaces', { tenantId: tenant.id, name: 'Asbestos docket' })).workspace;
const matter = (await admin('/matters', { workspaceId: ws.id, name: 'Smith v. Kaiser Gypsum et al.' })).matter;
ok('tenant, people, workspace, matter created', !!ws.id && !!matter.id, `workspace ${ws.id}`);

// 2. paper inventory
const inv = await admin('/boxes', { workspaceId: ws.id, boxes: [{ barcode: 'B-1183', label: 'Smith exposure files, sheet metal 1968 to 1992', custodian: 'J. Alvarez', dateFrom: '1968', dateTo: '1992', location: 'Row 4, shelf C', pagesEst: 2400, matterId: matter.id, folders: [{ barcode: 'F-1183-01', label: 'Union dispatch records, Sheet Metal Workers', pagesEst: 300 }, { barcode: 'F-1183-02', label: 'Employer correspondence, Natkin power plant jobs', pagesEst: 450 }] }] });
ok('inventory recorded', inv.boxes === 1 && inv.folders === 2);

// 3. a batch, uploaded with the uploader script
const b = await admin('/batches', { workspaceId: ws.id, matterId: matter.id, kind: 'electronic', name: 'Pilot samples' });
ok('batch opened with a key', !!b.intakeKey);
await new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [join(here, '..', 'scripts', 'upload.mjs'), '--url', URL_, '--batch', b.batch.id, '--key', b.intakeKey, '--matter', matter.id, '--concurrency', '3', '--seal', SAMPLES], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  p.on('close', code => { console.log(out.trim().split('\n').map(l => '      ' + l).join('\n')); code === 0 ? resolve() : reject(new Error('uploader exit ' + code)); });
});
let batch;
for (let i = 0; i < 40; i++) { batch = (await admin('/batches/' + b.batch.id)).batch; if (batch.files_done + batch.files_failed >= batch.files_received - batch.files_duplicate) break; await sleep(1000); }
ok('batch sealed and processed', batch.status === 'sealed' && batch.files_received >= 10 && batch.files_done >= 9, `received ${batch.files_received}, done ${batch.files_done}, awaiting OCR ${batch.files_awaiting_ocr}, failed ${batch.files_failed}`);

// Upload the same tree again: everything is a duplicate
const b2 = await admin('/batches', { workspaceId: ws.id, kind: 'electronic', name: 'Same files again' });
await new Promise((resolve) => { const p = spawn(process.execPath, [join(here, '..', 'scripts', 'upload.mjs'), '--url', URL_, '--batch', b2.batch.id, '--key', b2.intakeKey, '--seal', SAMPLES], { stdio: 'ignore' }); p.on('close', resolve); });
const batch2 = (await admin('/batches/' + b2.batch.id)).batch;
ok('second delivery recognised as duplicates', batch2.files_received === 0 || batch2.files_duplicate === batch2.files_received, `received ${batch2.files_received}, duplicates ${batch2.files_duplicate}`);

// 4. search and facts
const s1 = await admin(`/search?workspace=${ws.id}&q=${encodeURIComponent('LaCygne power plant')}`);
ok('search finds the deposition summary', s1.hits.some(h => /Deposition Summary/i.test(h.name)), s1.hits[0] ? `top: ${s1.hits[0].name} p.${s1.hits[0].page} (${s1.mode})` : 'no hits');
const s2 = await admin(`/search?workspace=${ws.id}&q=${encodeURIComponent('"joint compound"')}&kind=summary`);
ok('phrase search with a kind filter', s2.hits.length > 0 && s2.hits.every(h => h.kind === 'summary'));
const docs = await admin(`/workspaces/${ws.id}/documents?limit=50`);
const summary = docs.items.find(d => /Deposition Summary/i.test(d.name));
ok('summary classified with witness and defendants', summary && summary.kind === 'summary' && /Smith/i.test(summary.witness || '') && JSON.parse(summary.defendants || '[]').length > 30, summary ? `kind ${summary.kind}, witness ${summary.witness}, ${JSON.parse(summary.defendants || '[]').length} defendants` : 'not found');
const png = docs.items.find(d => /chart\.png/.test(d.name));
ok('image waits for OCR when no provider is set', png && png.status === 'awaiting_ocr', png ? png.status : 'not found');
const pdf = docs.items.find(d => /tiny\.pdf/.test(d.name));
ok('pdf read', pdf && (pdf.status === 'indexed' || pdf.status === 'awaiting_ocr'), pdf ? `${pdf.status}, ${pdf.pages} pages` : 'not found');
const chain = await admin('/receipts/verify?tenant=' + tenant.id);
ok('receipt chain verifies', chain.ok && chain.count > 20, `${chain.count} receipts`);

// 5. the Ricorsa connection flow
const st = await client('/connect/start', { email, externalUser: 'ricorsa-user-1' });
ok('code issued (returned in dev)', !!st.challengeId && !!st.devCode);
let bad = null; try { await client('/connect/verify', { challengeId: st.challengeId, code: '000000' }); } catch (e) { bad = e.message; }
ok('wrong code rejected', !!bad);
const ver = await client('/connect/verify', { challengeId: st.challengeId, code: st.devCode });
ok('right code lists the owner’s workspaces', ver.workspaces.some(w => w.id === ws.id));
const viewerStart = await client('/connect/start', { email: `viewer-${stamp}@example.com` });
const viewerVer = await client('/connect/verify', { challengeId: viewerStart.challengeId, code: viewerStart.devCode });
ok('a viewer without membership sees no workspaces', viewerVer.workspaces.length === 0);
const stranger = await client('/connect/start', { email: `nobody-${stamp}@example.com` });
ok('unknown email gets a challenge but no code', !!stranger.challengeId && !stranger.devCode);
const appr = await client('/connect/approve', { challengeId: st.challengeId, workspaceIds: [ws.id], label: 'Ricorsa' });
ok('connection approved with a token', appr.token && appr.token.length > 30 && appr.connectionId);
const token = appr.token;

// 6. MCP
const init = await mcp(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
ok('mcp initialize', init.status === 200 && init.body.result.serverInfo.name === 'VDRPros Vault');
const noauth = await mcp('not-a-token-at-all-really', 'tools/list', {});
ok('mcp without a valid token is 401', noauth.status === 401);
const tl = await mcp(token, 'tools/list', {});
ok('mcp lists five tools', tl.body.result.tools.length === 5, tl.body.result.tools.map(t => t.name).join(', '));
const wsl = await mcp(token, 'tools/call', { name: 'vault_workspaces', arguments: {} });
ok('vault_workspaces', wsl.body.result.structuredContent.workspaces.length === 1 && wsl.body.result.structuredContent.workspaces[0].paperFolders === 2);
const sr = await mcp(token, 'tools/call', { name: 'vault_search', arguments: { query: 'Natkin power plant', limit: 5 } });
const hits = sr.body.result.structuredContent.hits;
ok('vault_search returns hits with cites and paper matches', hits.length > 0 && /^vault:.+#page=\d+$/.test(hits[0].cite) && sr.body.result.structuredContent.paper.length > 0, `${hits.length} hits, ${sr.body.result.structuredContent.paper.length} paper folders`);
const rd = await mcp(token, 'tools/call', { name: 'vault_read', arguments: { doc_id: hits[0].docId, from_page: 1, to_page: 1 } });
ok('vault_read returns page text', /\[Page 1\]/.test(rd.body.result.content[0].text) && rd.body.result.content[0].text.length > 200);
const dc = await mcp(token, 'tools/call', { name: 'vault_document', arguments: { doc_id: hits[0].docId } });
ok('vault_document returns the seal', /sha256 seal: [0-9a-f]{64}/.test(dc.body.result.content[0].text));
const paper = sr.body.result.structuredContent.paper[0];
const scan = await mcp(token, 'tools/call', { name: 'vault_request_scan', arguments: { folder_id: paper.folderId, note: 'Needed for the Natkin question' } });
ok('vault_request_scan creates a request', !!scan.body.result.structuredContent.requestId);
const reqs = (await admin('/workspaces/' + ws.id)).requests;
ok('request visible to staff with a due date', reqs.length === 1 && reqs[0].via === 'ricorsa' && reqs[0].due_at > Date.now());

// 7. content for the client's viewer
const c1 = await fetch(`${URL_}/api/docs/${hits[0].docId}/content`, { headers: { Authorization: `Bearer ${token}` } });
ok('content served with the token', c1.status === 200 && (c1.headers.get('content-type') || '').includes('spreadsheet'), `${c1.status} ${c1.headers.get('content-type')}`);
const c2 = await fetch(`${URL_}/api/docs/${hits[0].docId}/content`, { headers: { Authorization: `Bearer ${token}`, Range: 'bytes=0-99' } });
ok('range request answered with 206', c2.status === 206 && c2.headers.get('content-range')?.startsWith('bytes 0-99/'));
const meta = await (await fetch(`${URL_}/api/docs/${hits[0].docId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
const v = await fetch(meta.link);
ok('signed viewer link works', v.status === 200);
const badLink = await fetch(meta.link.replace(/s=[0-9a-f]+/, 's=' + '0'.repeat(64)));
ok('tampered link refused', badLink.status === 403);
const other = (await admin('/workspaces', { tenantId: tenant.id, name: 'Not shared' })).workspace;
const bad2 = await mcp(token, 'tools/call', { name: 'vault_search', arguments: { query: 'anything', workspace_id: other.id } });
ok('workspace outside the connection is refused', !!bad2.body.error || bad2.body.result?.isError);
await client('/connect/revoke', { connectionId: appr.connectionId });
const after = await mcp(token, 'tools/list', {});
ok('revoked token no longer works', after.status === 401);
const log = await admin('/access-log?tenant=' + tenant.id);
ok('access log has the reads', log.items.filter(x => x.action === 'search').length >= 1 && log.items.some(x => x.action === 'read'));
console.log(process.exitCode ? '\nSome checks failed.' : '\nAll checks passed.');
