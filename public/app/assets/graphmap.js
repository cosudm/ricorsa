/**
 * The map view of the identity graph: every node the geocoder could place (cities, counties, sites, addresses the
 * person's work is about) drawn on a world map next to the living brain, in the same colors, with the same time
 * scrubber, cortex focus, search and node panel. Land, borders and lakes come from Natural Earth (1:110m, public
 * domain) in /app/assets/world-110m.json, fetched the first time the map is opened; place coordinates come from the
 * geocoder named on the page. Plain canvas, no library.
 *
 * window.RicorsaGraphMap.mount(container, model, options) returns a controller with the same shape as the brain's:
 * update, setTime, focus, setLabels, setQuery, highlight, select, resetView, counts, destroy.
 */
(function () {
  'use strict';
  const DATA_URL = '/app/assets/world-110m.json';
  // Closer in, the 1:110m coastline turns into a few straight segments, so six longitude bands of 1:50m detail
  // (land, lakes, land borders, US states) are fetched as the view needs them and drawn instead.
  const BAND_URL = (i) => '/app/assets/world-50m-' + i + '.json';
  const DETAIL_SCALE = 9000;   // pixels per world width; beyond this 1 degree is wider than about 25 px
  const bands = {};
  function loadBand(i, onLoad) {
    if (bands[i]) return bands[i].data || null;
    bands[i] = { data: null, p: fetch(BAND_URL(i), { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).catch(() => null).then(d => { bands[i].data = d || { land: [], lakes: [], states: [], borders: [] }; if (onLoad) onLoad(); }) };
    return null;
  }
  const FALLBACK_CORTEX = {
    identity: { label: 'Identity', hex: '#F08A3C' }, memory: { label: 'Memory', hex: '#34D4C0' }, knowledge: { label: 'Knowledge', hex: '#5AA0FF' },
    opportunity: { label: 'Opportunity', hex: '#FF6FA0' }, action: { label: 'Action', hex: '#58D68D' }, communication: { label: 'Communication', hex: '#B08CFF' },
  };
  const FALLBACK_KIND = { topic: 'knowledge', expertise: 'knowledge', entity: 'identity', goal: 'opportunity', intent: 'opportunity', build: 'action', style: 'communication', connector: 'communication', thread: 'memory', document: 'memory' };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (hex, a) => { const c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; };
  let dataPromise = null;
  function loadData() {
    if (!dataPromise) dataPromise = fetch(DATA_URL, { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
    return dataPromise;
  }
  // Web Mercator, in "world units" where the world is 1 wide at zoom 1.
  const R = 1 / (2 * Math.PI);
  const proj = (lon, lat) => { const la = clamp(lat, -84, 84) * Math.PI / 180; return [(lon + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + la / 2)) * R]; };
  const unproj = (x, y) => [x * 360 - 180, (2 * Math.atan(Math.exp((0.5 - y) / R)) - Math.PI / 2) * 180 / Math.PI];
  const USA = { lon: [-125, -66], lat: [24, 49.5] };

  function mount(container, model, opts) {
    opts = opts || {};
    const CORTEX = (window.RicorsaGraph3D && window.RicorsaGraph3D.CORTEX) || FALLBACK_CORTEX;
    const KINDMAP = window.RicorsaGraph3D && window.RicorsaGraph3D.KIND ? Object.fromEntries(Object.entries(window.RicorsaGraph3D.KIND).map(([k, v]) => [k, v.cortex])) : FALLBACK_KIND;
    const cortexOf = (n) => KINDMAP[n.kind] || 'identity';
    const canvas = document.createElement('canvas'); canvas.className = 'g3d-canvas gmap-canvas'; canvas.setAttribute('role', 'img'); canvas.tabIndex = 0; canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const base = document.createElement('canvas'); const bctx = base.getContext('2d');
    const st = { w: 0, h: 0, dpr: 1, cx: 0.5, cy: 0.5, zoom: 1, t: Date.now(), labels: opts.labels !== false, focus: null, query: '', hover: null, selected: null, highlight: null, highlightAt: 0, baseDirty: true, world: null, lastPointer: 0 };
    let nodes = [], edges = [], all = [];
    const sprites = {};
    for (const k of Object.keys(CORTEX)) { const s = document.createElement('canvas'); s.width = s.height = 48; const g = s.getContext('2d'); const gr = g.createRadialGradient(24, 24, 0, 24, 24, 24); gr.addColorStop(0, rgba(CORTEX[k].hex, 0.85)); gr.addColorStop(0.35, rgba(CORTEX[k].hex, 0.3)); gr.addColorStop(1, rgba(CORTEX[k].hex, 0)); g.fillStyle = gr; g.fillRect(0, 0, 48, 48); sprites[k] = s; }
    const listeners = []; const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push(() => el.removeEventListener(ev, fn, o)); };

    function load(m) {
      all = (m.nodes || []).map(n => Object.assign({}, n));
      nodes = all.filter(n => n.meta && n.meta.geo && n.meta.geo.type === 'Point' && Array.isArray(n.meta.geo.coordinates)).map(n => { const [lon, lat] = n.meta.geo.coordinates; const p = proj(lon, lat); return Object.assign(n, { lon, lat, wx: p[0], wy: p[1] }); });
      const ids = new Set(nodes.map(n => n.id));
      edges = (m.edges || []).filter(e => ids.has(e.a) && ids.has(e.b));
      canvas.setAttribute('aria-label', nodes.length ? 'Map of the ' + nodes.length + ' places in your graph. Drag to pan, scroll to zoom, hover a place for details, click for more.' : 'The map of your graph: no places yet.');
    }
    load(model);

    function fit(pad) {
      pad = pad || 0.18;
      let lons, lats;
      if (nodes.length) {
        lons = [Math.min.apply(null, nodes.map(n => n.lon)), Math.max.apply(null, nodes.map(n => n.lon))]; lats = [Math.min.apply(null, nodes.map(n => n.lat)), Math.max.apply(null, nodes.map(n => n.lat))];
        // One place, or places very close together: show the neighborhood, not a pin on a blank sea.
        if (lons[1] - lons[0] < 1.5) { const m = (lons[0] + lons[1]) / 2; lons = [m - 0.75, m + 0.75]; }
        if (lats[1] - lats[0] < 1.2) { const m = (lats[0] + lats[1]) / 2; lats = [m - 0.6, m + 0.6]; }
      } else { lons = USA.lon; lats = USA.lat; }
      const a = proj(lons[0], lats[1]), b = proj(lons[1], lats[0]);
      const ww = Math.max(1e-5, b[0] - a[0]), wh = Math.max(1e-5, b[1] - a[1]);
      st.cx = (a[0] + b[0]) / 2; st.cy = (a[1] + b[1]) / 2;
      st.zoom = clamp(Math.min(st.w / (ww * (1 + pad * 2)), st.h / (wh * (1 + pad * 2))), 1, 200000);
      st.baseDirty = true;
    }
    const scale = () => st.zoom;   // pixels per world unit
    const toScreen = (wx, wy) => [st.w / 2 + (wx - st.cx) * scale(), st.h / 2 + (wy - st.cy) * scale()];
    const toWorld = (x, y) => [st.cx + (x - st.w / 2) / scale(), st.cy + (y - st.h / 2) / scale()];

    function size() {
      const r = container.getBoundingClientRect(); const w = Math.max(320, Math.floor(r.width)); const h = Math.max(320, Math.floor(opts.height || Math.min(660, Math.max(400, w * 0.6))));
      const first = !st.w;
      st.dpr = Math.min(2, window.devicePixelRatio || 1); st.w = w; st.h = h;
      canvas.width = Math.floor(w * st.dpr); canvas.height = Math.floor(h * st.dpr); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      base.width = canvas.width; base.height = canvas.height;
      if (first) fit(); else st.baseDirty = true;
      draw();
    }

    /** Land, lakes, borders and state labels, drawn once per view into the base layer. */
    function drawBase() {
      const c = bctx; c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      const g = c.createRadialGradient(st.w * 0.5, st.h * 0.4, 20, st.w * 0.5, st.h * 0.5, Math.max(st.w, st.h) * 0.8);
      g.addColorStop(0, '#0F1D36'); g.addColorStop(1, '#080F1D'); c.fillStyle = g; c.fillRect(0, 0, st.w, st.h);
      const W = st.world; if (!W) { st.baseDirty = false; return; }
      const s = scale(); const ox = st.w / 2 - st.cx * s, oy = st.h / 2 - st.cy * s;
      // Detail bands for the longitudes on screen, once the view is close enough; until they arrive the 1:110m layers stand in.
      let D = null;
      if (s > DETAIL_SCALE) {
        const lonA = unproj(toWorld(0, 0)[0], 0.5)[0], lonB = unproj(toWorld(st.w, 0)[0], 0.5)[0];
        const need = []; for (let i = Math.max(0, Math.floor((lonA + 180) / 60)); i <= Math.min(5, Math.floor((lonB + 180) / 60)); i++) need.push(i);
        const got = need.map(i => loadBand(i, () => { st.baseDirty = true; kick(); }));
        if (need.length && got.every(Boolean)) {
          D = { land: [], lakes: [], states: [], borders: [] }; const seen = new Set();
          for (const b of got) for (const k of Object.keys(D)) for (const r of (b[k] || [])) { const key = k + ':' + r.length + ':' + r[0][0] + ',' + r[0][1]; if (seen.has(key)) continue; seen.add(key); D[k].push(r); }
        }
      }
      // Only rings that touch the screen are traced; coordinates are projected on the fly (cheap at 110m).
      const ring = (r) => { let started = false; for (let i = 0; i < r.length; i++) { const p = proj(r[i][0], r[i][1]); const x = ox + p[0] * s, y = oy + p[1] * s; if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y); } c.closePath(); };
      const visible = (r) => { let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9; for (let i = 0; i < r.length; i += Math.max(1, Math.floor(r.length / 40))) { const p = proj(r[i][0], r[i][1]); const x = ox + p[0] * s, y = oy + p[1] * s; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; } return maxx > -80 && minx < st.w + 80 && maxy > -80 && miny < st.h + 80; };
      const land = D ? D.land : W.land, lakes = D ? D.lakes : W.lakes, states = D ? D.states : W.states;
      c.beginPath(); for (const r of land) if (visible(r)) ring(r); c.fillStyle = '#17274A'; c.fill();
      c.beginPath(); for (const r of land) if (visible(r)) ring(r); c.strokeStyle = 'rgba(150,185,240,0.35)'; c.lineWidth = 1; c.stroke();
      c.beginPath(); for (const r of lakes) if (visible(r)) ring(r); c.fillStyle = '#0E1B33'; c.fill();
      if (D) { const line = (r) => { for (let i = 0; i < r.length; i++) { const p = proj(r[i][0], r[i][1]); const x = ox + p[0] * s, y = oy + p[1] * s; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); } }; c.beginPath(); for (const r of D.borders) if (visible(r)) line(r); c.strokeStyle = 'rgba(150,185,240,0.18)'; c.lineWidth = 0.8; c.stroke(); }
      else { c.beginPath(); for (const r of W.countries) if (visible(r)) ring(r); c.strokeStyle = 'rgba(150,185,240,0.16)'; c.lineWidth = 0.8; c.stroke(); }
      if (s > 900) { c.beginPath(); for (const r of states) if (visible(r)) ring(r); c.strokeStyle = 'rgba(150,185,240,0.13)'; c.lineWidth = 0.7; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]); }
      if (s > 1600 && st.labels) { c.font = '500 10px ' + font(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(160,185,225,0.42)'; for (const [name, lon, lat] of W.stateLabels) { const p = proj(lon, lat); const x = ox + p[0] * s, y = oy + p[1] * s; if (x > 0 && x < st.w && y > 0 && y < st.h) c.fillText(name, x, y); } }
      st.baseDirty = false;
    }
    const font = () => getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    const dimOf = (k) => st.focus ? (k === st.focus ? 1 : 0.2) : 1;
    let projected = [];

    function draw() {
      const c = ctx; if (!c) return;
      if (st.baseDirty) drawBase();
      c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(base, 0, 0); c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      const ts = performance.now(); const t = st.t;
      const shown = nodes.filter(n => n.firstSeen <= t);
      projected = shown.map(n => { const [x, y] = toScreen(n.wx, n.wy); const cortex = cortexOf(n); let dim = dimOf(cortex); if (st.query) dim = n.label.toLowerCase().includes(st.query) ? 1 : 0.12; const r = 4 + 7 * (n.weight || 0.3); return { n, x, y, r, cortex, hex: (CORTEX[cortex] || FALLBACK_CORTEX.identity).hex, dim }; });
      const pi = {}; projected.forEach(p => { pi[p.n.id] = p; });
      // Bounding boxes for places that are areas (a county, a state, a district), faint in the cortex color; a city or a site is just its marker.
      const AREA = /county|state|region|administrative|district|province|parish|borough|territory|island|bay|basin|watershed|forest|park/i;
      for (const p of projected) {
        const b = p.n.meta.geoBox; if (!b || !AREA.test(String(p.n.meta.geoKind || ''))) continue;
        const a1 = proj(b[0][0], b[1][1]), a2 = proj(b[1][0], b[0][1]); const [x1, y1] = toScreen(a1[0], a1[1]), [x2, y2] = toScreen(a2[0], a2[1]);
        if (x2 - x1 < 14 || y2 - y1 < 14) continue;
        c.strokeStyle = rgba(p.hex, 0.35 * p.dim); c.lineWidth = 1; c.setLineDash([4, 4]); c.strokeRect(x1, y1, x2 - x1, y2 - y1); c.setLineDash([]);
        c.fillStyle = rgba(p.hex, 0.05 * p.dim); c.fillRect(x1, y1, x2 - x1, y2 - y1);
      }
      // Pathways between places learned together.
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (const e of edges) {
        const a = pi[e.a], b = pi[e.b]; if (!a || !b || (e.at && e.at > t)) continue;
        const dim = Math.min(a.dim, b.dim); const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.12;
        c.strokeStyle = rgba(a.hex, (0.18 + 0.4 * (e.weight || 0.3)) * dim); c.lineWidth = 0.8 + 1.6 * (e.weight || 0.3);
        c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(mx, my, b.x, b.y); c.stroke();
      }
      // Places: glow, dot, ring for the highlighted or selected one.
      for (const p of projected) {
        const hot = st.hover === p.n.id || st.selected === p.n.id || st.highlight === p.n.id;
        const glow = p.r * (hot ? 4.2 : 2.6);
        c.globalAlpha = (hot ? 0.95 : 0.6) * p.dim; c.drawImage(sprites[p.cortex] || sprites.identity, p.x - glow, p.y - glow, glow * 2, glow * 2);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      const boxes = [];
      for (const p of projected.slice().sort((a, b) => b.n.weight - a.n.weight)) {
        const hot = st.hover === p.n.id || st.selected === p.n.id || st.highlight === p.n.id;
        c.fillStyle = rgba('#FFFFFF', 0.9 * p.dim); c.beginPath(); c.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2); c.fill();
        c.strokeStyle = rgba(p.hex, 0.95 * p.dim); c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.stroke();
        if (st.highlight === p.n.id) { const k = ((ts - st.highlightAt) % 1400) / 1400; c.strokeStyle = rgba(p.hex, 0.9 * (1 - k)); c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, p.r + 4 + 22 * k, 0, Math.PI * 2); c.stroke(); }
        if (st.selected === p.n.id) { c.strokeStyle = 'rgba(255,236,190,0.9)'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2); c.stroke(); }
        const wantLabel = st.labels && p.dim > 0.5 && (hot || p.n.weight > 0.25 || projected.length <= 12);
        if (wantLabel) {
          c.font = (hot ? '600 ' : '500 ') + '12px ' + font(); c.textAlign = 'left'; c.textBaseline = 'middle';
          const label = p.n.label.length > 30 ? p.n.label.slice(0, 29) + '…' : p.n.label; const tw = c.measureText(label).width; const lx = p.x + p.r + 6, ly = p.y;
          const box = [lx - 2, ly - 8, lx + tw + 2, ly + 8];
          if (hot || !boxes.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) {
            boxes.push(box);
            c.lineWidth = 3; c.strokeStyle = 'rgba(8,15,29,0.85)'; c.lineJoin = 'round'; c.strokeText(label, lx, ly);
            c.fillStyle = 'rgba(236,241,250,' + (0.7 + 0.3 * p.dim).toFixed(2) + ')'; c.fillText(label, lx, ly);
          }
        }
      }
      // Corner notes: the count, the date, the attribution the data asks for.
      c.font = '600 10.5px ' + font(); c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = 'rgba(200,214,235,0.85)';
      c.fillText(shown.length ? shown.length + ' place' + (shown.length === 1 ? '' : 's') + ' on the map' : 'No places on the map yet', 14, 14);
      if (!shown.length) { c.font = '500 12px ' + font(); c.fillStyle = 'rgba(190,205,230,0.85)'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(nodes.length ? 'Nothing had been placed by this date.' : 'Ask about a city, a county, a site or an address and Ricorsa will place it here.', st.w / 2, st.h / 2 - 4); }
      if (st.t < Date.now() - 60000) { c.font = '600 11px ' + font(); c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = 'rgba(236,241,250,0.9)'; c.fillText('As of ' + new Date(st.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 14, 30); }
      c.font = '500 9.5px ' + font(); c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillStyle = 'rgba(160,178,205,0.7)';
      c.fillText((opts.attribution || 'Place data © OpenStreetMap contributors') + ' · Natural Earth', st.w - 12, st.h - 10);
    }

    // Animation only while something moves: a highlight ring, the pointer, or a pan.
    let raf = 0, onScreen = true;
    function frame() { raf = 0; draw(); if (onScreen && !document.hidden && (st.highlight || st.hover)) raf = requestAnimationFrame(frame); }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const io = window.IntersectionObserver ? new IntersectionObserver((en) => { onScreen = en.some(e => e.isIntersecting); if (onScreen) kick(); }, { threshold: 0.05 }) : null; if (io) io.observe(canvas);

    // Pointer: drag pans, wheel zooms around the cursor, hover picks, click selects.
    let drag = null;
    const pick = (x, y) => { let best = null, bd = 1e9; for (const p of projected) { const d = Math.hypot(p.x - x, p.y - y); if (d < p.r + 8 && d < bd && p.dim > 0.3) { bd = d; best = p.n; } } return best; };
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    on(canvas, 'pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
    on(canvas, 'pointermove', (e) => {
      if (drag && drag.id === e.pointerId) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; st.cx -= dx / scale(); st.cy -= dy / scale(); drag.x = e.clientX; drag.y = e.clientY; st.baseDirty = true; kick(); return; }
      const [x, y] = local(e); const n = pick(x, y);
      if ((n && n.id) !== st.hover) { st.hover = n ? n.id : null; canvas.style.cursor = n ? 'pointer' : 'grab'; kick(); }
      if (opts.onHover) opts.onHover(n, x, y);
    });
    const endDrag = (e) => { if (!drag) return; const moved = drag.moved; drag = null; canvas.style.cursor = 'grab'; if (!moved) { const [x, y] = local(e); const n = pick(x, y); st.selected = n ? n.id : null; kick(); if (n && opts.onSelect) opts.onSelect(n); } };
    on(canvas, 'pointerup', endDrag); on(canvas, 'pointercancel', () => { drag = null; });
    on(canvas, 'pointerleave', () => { if (st.hover) { st.hover = null; kick(); } if (opts.onHover) opts.onHover(null); });
    on(canvas, 'wheel', (e) => { e.preventDefault(); const [x, y] = local(e); const before = toWorld(x, y); st.zoom = clamp(st.zoom * (e.deltaY > 0 ? 0.85 : 1.18), 0.8, 400000); const after = toWorld(x, y); st.cx += before[0] - after[0]; st.cy += before[1] - after[1]; st.baseDirty = true; kick(); }, { passive: false });
    on(canvas, 'dblclick', (e) => { const [x, y] = local(e); const before = toWorld(x, y); st.zoom = clamp(st.zoom * 2, 0.8, 400000); const after = toWorld(x, y); st.cx += before[0] - after[0]; st.cy += before[1] - after[1]; st.baseDirty = true; kick(); });
    on(canvas, 'keydown', (e) => { const step = 40 / scale(); if (e.key === 'ArrowLeft') st.cx -= step; else if (e.key === 'ArrowRight') st.cx += step; else if (e.key === 'ArrowUp') st.cy -= step; else if (e.key === 'ArrowDown') st.cy += step; else if (e.key === '+' || e.key === '=') st.zoom = clamp(st.zoom * 1.25, 0.8, 400000); else if (e.key === '-') st.zoom = clamp(st.zoom / 1.25, 0.8, 400000); else return; e.preventDefault(); st.baseDirty = true; kick(); });
    on(document, 'visibilitychange', () => { if (!document.hidden) kick(); });
    const ro = window.ResizeObserver ? new ResizeObserver(() => size()) : null; if (ro) ro.observe(container); else on(window, 'resize', size);
    size();
    loadData().then(w => { st.world = w; st.baseDirty = true; kick(); });

    const api = {
      update: (m) => { load(m); kick(); },
      setTime: (t) => { st.t = t; kick(); },
      focus: (k) => { st.focus = k && CORTEX[k] ? k : null; kick(); },
      setLabels: (b) => { st.labels = !!b; st.baseDirty = true; kick(); },
      setQuery: (q) => { st.query = String(q || '').trim().toLowerCase(); kick(); },
      /** Pulse one place; null clears. Pans to it when it is off screen. */
      highlight: (id) => { st.highlight = id || null; st.highlightAt = performance.now(); const n = id ? nodes.find(x => x.id === id) : null; if (n) { const [x, y] = toScreen(n.wx, n.wy); if (x < 20 || x > st.w - 20 || y < 20 || y > st.h - 20) { st.cx = n.wx; st.cy = n.wy; st.baseDirty = true; } } kick(); return !!n; },
      select: (id) => { st.selected = id || null; kick(); },
      resetView: () => { fit(); kick(); },
      /** Fit the view around every place on the map. */
      fit: () => { fit(); kick(); },
      counts: () => ({ anchored: nodes.length, places: all.filter(n => n.meta && n.meta.place).length }),
      has: (id) => nodes.some(n => n.id === id),
      highlighted: () => st.highlight,
      selectedId: () => st.selected,
      nodes: () => nodes,
      destroy: () => { listeners.forEach(f => f()); if (ro) ro.disconnect(); if (io) io.disconnect(); onScreen = false; if (raf) cancelAnimationFrame(raf); canvas.remove(); },
    };
    return api;
  }
  window.RicorsaGraphMap = { mount, loadData };
})();
