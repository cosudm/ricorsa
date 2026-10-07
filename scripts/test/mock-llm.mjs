#!/usr/bin/env node
/**
 * A stand-in for an OpenAI-compatible model provider, for running the model layer against something that answers like
 * one without spending tokens: GET /v1/models lists the ids it serves, POST /v1/chat/completions streams a short tagged
 * answer (or a one-token reply for a probe). One process serves several providers on several ports, each with its own
 * model list, so Moonshot and OpenRouter can be stood in for at once:
 *
 *   node scripts/test/mock-llm.mjs 3994:kimi-k3,kimi-k3-turbo,kimi-k2.6 3995:moonshotai/kimi-k3,moonshotai/kimi-k2.6,openai/gpt-5
 *
 * then KIMI_BASE_URL=http://127.0.0.1:3994/v1 and OPENROUTER_BASE_URL=http://127.0.0.1:3995/v1 (with any key).
 * Test controls on each port: POST /__fail {model, status, message} makes that model answer the status (404, 500, 503)
 * until POST /__ok {model}; GET /__calls lists every completion asked for (model, stream, max tokens); POST /__reset.
 */
import http from 'node:http';

const specs = process.argv.slice(2);
if (!specs.length) { console.error('usage: mock-llm.mjs <port>:<model,model,...> [...]'); process.exit(1); }

function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); }); }
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

for (const spec of specs) {
  const [port, list] = spec.split(':'); const models = list.split(',').filter(Boolean);
  const state = { fail: new Map(), calls: [] };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'); const path = url.pathname.replace(/\/+$/, '');
    const body = req.method === 'POST' ? await readBody(req) : {};
    if (path === '/__fail') { state.fail.set(body.model, { status: body.status || 500, message: body.message || 'stand-in failure' }); return send(res, 200, { ok: true }); }
    if (path === '/__ok') { state.fail.delete(body.model); return send(res, 200, { ok: true }); }
    if (path === '/__calls') return send(res, 200, state.calls);
    if (path === '/__reset') { state.fail.clear(); state.calls.length = 0; return send(res, 200, { ok: true }); }
    if (!(req.headers.authorization || '').startsWith('Bearer ')) return send(res, 401, { error: { message: 'Missing bearer token', type: 'invalid_request_error' } });
    if (req.method === 'GET' && path === '/v1/models') return send(res, 200, { object: 'list', data: models.map(id => ({ id, object: 'model', owned_by: 'stand-in' })) });
    if (req.method === 'POST' && path === '/v1/chat/completions') {
      const model = String(body.model || '');
      state.calls.push({ model, stream: !!body.stream, maxTokens: body.max_tokens ?? body.max_completion_tokens ?? null, at: Date.now() });
      if (!models.includes(model)) return send(res, 404, { error: { message: `model ${model} not found or permission denied`, type: 'invalid_request_error', code: 'model_not_found' } });
      const f = state.fail.get(model); if (f) return send(res, f.status, { error: { message: f.message, type: 'server_error' } });
      const q = String((body.messages || []).slice(-1)[0]?.content || '').split('Question:').pop().trim().split('\n')[0].slice(0, 80);
      const text = (body.max_tokens ?? body.max_completion_tokens) <= 8 ? 'ok' : `<answer>\nThe stand-in model ${model} answered: ${q || 'your question'}.\n</answer>\n<related>\n- A follow-up on ${q || 'this'}\n</related>`;
      if (!body.stream) return send(res, 200, { id: 'cmpl-mock', object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 } });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const chunks = text.match(/[\s\S]{1,24}/g) || [];
      let i = 0;
      const tick = () => {
        if (i < chunks.length) { res.write(`data: ${JSON.stringify({ id: 'cmpl-mock', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: { content: chunks[i++] }, finish_reason: null }] })}\n\n`); setTimeout(tick, 15); }
        else { res.write(`data: ${JSON.stringify({ id: 'cmpl-mock', object: 'chat.completion.chunk', model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 } })}\n\n`); res.write('data: [DONE]\n\n'); res.end(); }
      };
      tick(); return;
    }
    send(res, 404, { error: { message: `No route for ${req.method} ${path}` } });
  });
  server.listen(Number(port), '127.0.0.1', () => console.log(`[mock-llm] ${models.length} models on http://127.0.0.1:${port}/v1`));
}
