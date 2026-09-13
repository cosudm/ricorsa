/**
 * The live line between an app built in the studio and Ricorsa's model.
 *
 * A built app runs in a sandboxed frame with no network. When it needs a model (answers, drafts, summaries,
 * translations, extraction) it calls window.ricorsa.ask(prompt, options), which this file provides in two halves:
 *   - the client, injected at the top of the app's document by wrap(html): it turns ask() into a postMessage to
 *     the page that holds the frame and resolves when the reply comes back, streaming text as it arrives;
 *   - the host, installed once on the page by host(getFrame, getBuildId): it relays each ask to
 *     POST /api/apps/ask with the person's own session and posts the answer back into the frame.
 * A downloaded copy of the app has no window.ricorsa; the builder is told to say so in the interface.
 */
(function () {
  'use strict';
  var CLIENT = "(function(){if(window.ricorsa)return;var pending={},seq=0;" +
    "function send(m){try{window.parent.postMessage(m,'*')}catch(e){}}" +
    "window.ricorsa={available:true,version:1," +
    "ask:function(prompt,opts){opts=opts||{};var id='a'+(++seq)+'_'+Date.now();" +
    "return new Promise(function(resolve,reject){pending[id]={resolve:resolve,reject:reject,onText:typeof opts.onText==='function'?opts.onText:null,onSources:typeof opts.onSources==='function'?opts.onSources:null,text:'',sources:[]};" +
    "send({ricorsa:1,type:'ask',id:id,prompt:String(prompt==null?'':prompt).slice(0,8000),system:opts.system?String(opts.system).slice(0,4000):'',search:!!opts.search,personal:opts.personal!==false," +
    "history:Array.isArray(opts.history)?opts.history.slice(-12).map(function(h){return{role:h&&h.role==='assistant'?'assistant':'user',content:String(h&&h.content!=null?h.content:'').slice(0,8000)}}):[]});" +
    "setTimeout(function(){var p=pending[id];if(p){delete pending[id];p.reject(new Error('The answer took too long'))}},180000)})}};" +
    "window.addEventListener('message',function(e){var m=e.data;if(!m||m.ricorsa!==1||typeof m.id!=='string')return;var p=pending[m.id];if(!p)return;" +
    "if(m.type==='delta'){var d=String(m.text||'');p.text+=d;if(p.onText){try{p.onText(d,p.text)}catch(err){}}}" +
    "else if(m.type==='sources'){p.sources=Array.isArray(m.sources)?m.sources:[];if(p.onSources){try{p.onSources(p.sources)}catch(err){}}}" +
    "else if(m.type==='done'){delete pending[m.id];p.resolve({text:typeof m.text==='string'?m.text:p.text,sources:Array.isArray(m.sources)?m.sources:p.sources,model:m.model||''})}" +
    "else if(m.type==='error'){delete pending[m.id];p.reject(new Error(String(m.message||'The answer could not be produced')))}});})();";

  /** The app's document with the client at the top of <head> (or of <body>, or first of all). */
  function wrap(html) {
    var s = String(html || '');
    if (s.indexOf('data-ricorsa-bridge') >= 0) return s;
    var tag = '<script data-ricorsa-bridge>' + CLIENT + '</scr' + 'ipt>';
    var m = /<head[^>]*>/i.exec(s);
    if (m) return s.slice(0, m.index + m[0].length) + tag + s.slice(m.index + m[0].length);
    var b = /<body[^>]*>/i.exec(s);
    if (b) return s.slice(0, b.index + b[0].length) + tag + s.slice(b.index + b[0].length);
    return tag + s;
  }

  /** Read a server-sent-event response, calling onEvent(name, data) for each event. */
  async function readSse(res, onEvent) {
    var reader = res.body.getReader(); var dec = new TextDecoder(); var buf = '';
    for (;;) {
      var r = await reader.read(); if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      var idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        var chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        var ev = 'message', data = '';
        chunk.split('\n').forEach(function (line) { if (line.indexOf('event:') === 0) ev = line.slice(6).trim(); else if (line.indexOf('data:') === 0) data += line.slice(5).trim(); });
        if (!data) continue;
        var parsed; try { parsed = JSON.parse(data); } catch (e) { continue; }
        onEvent(ev, parsed);
      }
    }
  }

  var installed = false; var active = 0;
  /**
   * Answer asks from the frame getFrame() returns, on behalf of the build getBuildId() names. Installed once per
   * page; both getters are called per message so the frame and the version can change underneath.
   */
  function host(getFrame, getBuildId) {
    if (installed) return; installed = true;
    window.addEventListener('message', async function (e) {
      var frame = getFrame(); if (!frame || !frame.contentWindow || e.source !== frame.contentWindow) return;
      var m = e.data; if (!m || m.ricorsa !== 1 || m.type !== 'ask' || typeof m.id !== 'string') return;
      var win = frame.contentWindow;
      var reply = function (msg) { try { win.postMessage(Object.assign({ ricorsa: 1, id: m.id }, msg), '*'); } catch (err) {} };
      var buildId = getBuildId();
      if (!buildId) { reply({ type: 'error', message: 'No finished version of this app is open yet' }); return; }
      if (active >= 3) { reply({ type: 'error', message: 'The app is already waiting on three answers; try again in a moment' }); return; }
      active++;
      var finished = false; var text = ''; var sources = [];
      try {
        var res = await fetch('/api/apps/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({
          buildId: buildId, prompt: String(m.prompt || '').slice(0, 8000), system: String(m.system || '').slice(0, 4000), search: !!m.search, personal: m.personal !== false,
          history: Array.isArray(m.history) ? m.history.slice(-12).map(function (h) { return { role: h && h.role === 'assistant' ? 'assistant' : 'user', content: String(h && h.content != null ? h.content : '').slice(0, 8000) }; }) : [],
        }) });
        if (!res.ok) { var msg = 'The answer could not be produced'; try { var j = await res.json(); msg = j.error || j.message || msg; } catch (err) {} reply({ type: 'error', message: msg }); finished = true; return; }
        await readSse(res, function (ev, data) {
          if (ev === 'delta') { text += data.text || ''; reply({ type: 'delta', text: data.text || '' }); }
          else if (ev === 'sources') { sources = data || []; reply({ type: 'sources', sources: sources }); }
          else if (ev === 'done') { finished = true; reply({ type: 'done', text: typeof data.text === 'string' ? data.text : text, sources: data.sources || sources, model: data.model || '' }); }
          else if (ev === 'error') { finished = true; reply({ type: 'error', message: data.message || 'The answer could not be produced' }); }
        });
        if (!finished) { finished = true; reply(text ? { type: 'done', text: text, sources: sources } : { type: 'error', message: 'The answer was cut off' }); }
      } catch (err) {
        if (!finished) reply({ type: 'error', message: (err && err.message) || 'The answer could not be produced' });
      } finally { active--; }
    });
  }

  window.RicorsaBridge = { wrap: wrap, host: host, CLIENT: CLIENT };
})();
