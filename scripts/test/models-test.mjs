#!/usr/bin/env node
/**
 * The model offering, end to end against the dev server and two stand-in providers (scripts/test/mock-llm.mjs): the list
 * of named models the composer offers, Auto's choice of tier, class pricing (a premium model three gas, the rest one),
 * a model served through OpenRouter when its maker has no key, the backstop within a request when the maker fails, a
 * maker's 404 setting the pair aside, the fall back to Auto when both are down, Research running on Auto, the health
 * endpoint and the default-model setting.
 *
 * Run the stand-ins and the dev server first:
 *   node scripts/test/mock-llm.mjs 3994:kimi-k3,kimi-k3-turbo,kimi-k2.6 3995:moonshotai/kimi-k3,moonshotai/kimi-k2.6,openai/gpt-5,openai/gpt-5-mini
 *   DEV_FAKE_USER=1 KIMI_API_KEY=test KIMI_BASE_URL=http://127.0.0.1:3994/v1 OPENROUTER_API_KEY=test OPENROUTER_BASE_URL=http://127.0.0.1:3995/v1 npx next dev
 * then `node scripts/test/models-test.mjs`. Start the stand-ins fresh before the dev server (the health loop probes them
 * on the first request and keeps its record for ten minutes). Nothing else (no Anthropic, OpenAI or Google key) should be
 * set, so the expectations about which models are offered hold.
 */
const APP = process.env.APP_URL || 'http://127.0.0.1:3000';
const HOME = 'http://127.0.0.1:3994', OR = 'http://127.0.0.1:3995';
let pass = 0, failed = 0;
function check(name, ok, detail = '') { if (ok) pass++; else failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = async (url, init) => { const r = await fetch(url, init); const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b, text: t }; };
const post = (url, body) => j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function ask(body) {
  const r = await fetch(APP + '/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  const ev = text.split('\n\n').filter(c => /^event: (done|error)/m.test(c)).pop() || '';
  const line = ev.split('\n').find(l => l.startsWith('data:'));
  const d = line ? JSON.parse(line.slice(5)) : {};
  const t = d.turn || {};
  return { status: r.status, pick: t.pick, tier: t.tier, model: t.model, name: t.modelName, fallback: t.fallback, cost: d.gas ? d.gas.cost : null, answer: t.answer || '', err: d.message || d.error || null };
}
const offered = async () => (await j(APP + '/api/me')).body.models;

async function main() {
  // The stand-ins are expected fresh (started after any earlier run); the health loop has run after the first /api/me or runs now.
  await post(HOME + '/__ok', { model: 'kimi-k2.6' }); await post(OR + '/__ok', { model: 'moonshotai/kimi-k2.6' });
  const h = await j(APP + '/api/health/models');
  check('the health endpoint answers and names the models', (h.status === 200 || h.status === 503) && h.body && typeof h.body.models === 'object', `${h.status} ${h.text.slice(0, 200)}`);
  check('the health endpoint says the Kimi models are answering and GPT is served (through OpenRouter)', h.body.models['kimi-k3'] === 'ok' && h.body.models['gpt'] === 'ok' && h.body.models['gemini-pro'] === 'unset', JSON.stringify(h.body.models));
  check('the stand-ins were probed with one-token messages', (await j(HOME + '/__calls')).body.some(c => c.model === 'kimi-k3' && c.maxTokens === 1) && (await j(OR + '/__calls')).body.some(c => c.model === 'openai/gpt-5' && c.maxTokens === 1));

  let m = await offered();
  const ids = m.list.map(x => x.id);
  check('the composer is offered Auto by default and the models that answer: the Kimi models at home, GPT and GPT mini through OpenRouter', m.default === 'auto' && ids.includes('kimi-k3') && ids.includes('kimi-k2.6') && ids.includes('gpt') && ids.includes('gpt-mini') && !ids.includes('claude-fable') && !ids.includes('gemini-pro'), JSON.stringify(ids));
  check('each offered model carries its maker, role, class and price', m.list.every(x => x.maker && x.role && x.class && x.gas && x.blurb) && m.list.find(x => x.id === 'gpt').gas === 3 && m.list.find(x => x.id === 'kimi-k3').gas === 1, JSON.stringify(m.list[0]));
  check('names come from the served ids', m.list.find(x => x.id === 'gpt').name === 'GPT-5' && m.list.find(x => x.id === 'kimi-k2.6').name === 'Kimi K2.6');

  // Auto
  let r = await ask({ question: 'Capital of Peru?', mode: 'search', model: 'auto' });
  check('Auto: a short plain question goes to the Fast tier for one gas, with no model named', r.pick === 'auto' && r.tier === 'quick' && r.cost === 1 && !r.name && !r.fallback, JSON.stringify(r));
  r = await ask({ question: 'Compare leasing and buying industrial space in Houston over five years and reason through the tax effects step by step for a growing logistics firm', mode: 'search', model: 'auto' });
  check('Auto: a question that asks for reasoning goes to the Reasoning tier and still costs one gas', r.tier === 'complex' && r.cost === 1 && r.pick === 'auto', JSON.stringify(r));
  r = await ask({ question: 'Explain how transformers attend', mode: 'search', model: 'auto', focus: 'code' });
  check('Auto: a code focus goes to the Best tier', r.tier === 'default' && r.cost === 1, JSON.stringify(r));

  // Named models
  r = await ask({ question: 'What is prepaid gas?', mode: 'search', model: 'kimi-k2.6' });
  check('a named standard model answers under its name for one gas', r.pick === 'kimi-k2.6' && r.model === 'kimi-k2.6' && r.name === 'Kimi K2.6' && r.cost === 1 && r.tier === 'default' && !r.fallback, JSON.stringify(r));
  r = await ask({ question: 'Who wrote Hamlet?', mode: 'search', model: 'gpt' });
  check('a premium model costs three gas and is served through OpenRouter when its maker has no key', r.pick === 'gpt' && r.model === 'openai/gpt-5' && r.name === 'GPT-5' && r.cost === 3 && r.tier === 'complex', JSON.stringify(r));
  r = await ask({ question: 'Quick one: what is 2+2?', mode: 'search', model: 'gpt-mini' });
  check('a fast named model uses the Fast tier for one gas', r.model === 'openai/gpt-5-mini' && r.cost === 1 && r.tier === 'quick', JSON.stringify(r));
  r = await ask({ question: 'State of EU AI Act obligations', mode: 'research', model: 'gpt' });
  check('Research runs on Auto whatever model was picked, for the report price', r.cost === 10 && r.model === 'kimi-k3' && !r.name, JSON.stringify(r));
  r = await ask({ question: 'Hello there', mode: 'search', model: 'claude-fable' });
  check('a model not on offer falls back to Auto and says what was wanted', r.pick === 'claude-fable' && r.fallback && r.fallback.wanted === 'Claude Fable 5.1' && r.model === 'kimi-k3' && r.cost === 1, JSON.stringify(r));
  r = await ask({ question: 'Hello legacy', mode: 'search', tier: 'complex' });
  check('an older client sending a tier is served as before (three gas for the Reasoning tier)', r.tier === 'complex' && r.cost === 3 && !r.pick, JSON.stringify(r));
  r = await ask({ question: 'Nonsense model', mode: 'search', model: 'not-a-model' });
  check('an unknown model id means Auto', r.pick === 'auto' && r.cost === 1, JSON.stringify(r));

  // The backstop within a request: the maker refuses, OpenRouter serves the same model, the name stays.
  await post(HOME + '/__fail', { model: 'kimi-k2.6', status: 503, message: 'stand-in overloaded' });
  r = await ask({ question: 'Define entropy', mode: 'search', model: 'kimi-k2.6' });
  check('when the maker fails before a word is written, the same model answers through OpenRouter under its own name', r.model === 'moonshotai/kimi-k2.6' && r.name === 'Kimi K2.6' && !r.fallback && r.cost === 1, JSON.stringify(r));
  await post(HOME + '/__fail', { model: 'kimi-k2.6', status: 404, message: 'model not found or permission denied' });
  r = await ask({ question: 'Define enthalpy', mode: 'search', model: 'kimi-k2.6' });
  check('a 404 from the maker sets the pair aside and the backstop answers', r.model === 'moonshotai/kimi-k2.6' && r.name === 'Kimi K2.6', JSON.stringify(r));
  await post(HOME + '/__ok', { model: 'kimi-k2.6' });
  const before = (await j(HOME + '/__calls')).body.length;
  r = await ask({ question: 'Define work', mode: 'search', model: 'kimi-k2.6' });
  check('while the pair is set aside the maker is not asked again; OpenRouter serves it', r.model === 'moonshotai/kimi-k2.6' && (await j(HOME + '/__calls')).body.length === before, JSON.stringify(r));
  m = await offered();
  check('the model stays on offer while OpenRouter serves it', m.list.some(x => x.id === 'kimi-k2.6'));
  await post(OR + '/__fail', { model: 'moonshotai/kimi-k2.6', status: 500, message: 'gone too' });
  r = await ask({ question: 'Define torque', mode: 'search', model: 'kimi-k2.6' });
  check('with the maker set aside and OpenRouter failing, Auto answers and the note names the model wanted', r.model === 'kimi-k3' && r.name === 'Kimi K3' && r.fallback && r.fallback.wanted === 'Kimi K2.6' && r.cost === 1, JSON.stringify(r));
  await post(OR + '/__ok', { model: 'moonshotai/kimi-k2.6' });

  // Settings: the default model.
  let s = await j(APP + '/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-mini' }) });
  check('the default model can be saved', s.status === 200 && s.body.settings.model === 'gpt-mini', s.text.slice(0, 200));
  check('/api/me reports it', (await offered()).default === 'gpt-mini');
  s = await j(APP + '/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'bogus' }) });
  check('an unknown default becomes Auto', s.body.settings.model === 'auto', s.text.slice(0, 200));

  // Copy a customer sees never names a provider.
  const page = await j(APP + '/app');
  check('the app shell carries no provider names in its copy', !/Finix|Moonshot|OpenRouter/i.test(page.text.replace(/<script[\s\S]*?<\/script>/g, '')));

  console.log(`\n${pass} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error('test run crashed', e); process.exit(2); });
