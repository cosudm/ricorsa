/**
 * The living brain: Ricorsa's identity graph as a 4D interface.
 *
 * Everything the account holds is drawn inside one luminous, brain-shaped body (the organization, the governed
 * boundary), in six cortices that are product layers, not neuroscience labels:
 *   Identity        the people, organizations, tools and places Ricorsa has learned
 *   Memory          conversations and their documents; each Space is a governed sub-boundary around its threads
 *   Knowledge       topics and expertise
 *   Discovery       the patterns Ricorsa inferred about what the person is trying to do
 *   Action          goals, and the apps, agents and tools that were built
 *   Communication   how the person likes things said, and the channels connected
 * The tissue of the brain is drawn as thousands of fibers and motes that follow the folds of a brain-shaped surface,
 * colored by the cortex they lie in; the identity core sits at the center; footprints (recent conversations,
 * documents, built apps, channels) stream in from the edge into Memory. Connections are pathways: node to node,
 * and node to the conversation that taught it. A thing Ricorsa learns is born beside that conversation and settles
 * into its cortex as it recurs over weeks. Time is the fourth dimension: the scrubber shows the brain as it was,
 * Replay shows it forming, Emerging lights what is strengthening now, and learning that happens while the brain is
 * open is drawn as it happens. Identity Governed Logic is not a region: the boundary and the Space rings are where it shows.
 *
 * Plain canvas, no library, additive light. window.RicorsaGraph3D.mount(container, model, options) returns a
 * controller; the model is assembled by the app from the graph, the threads, the builds and the connectors.
 */
(function () {
  'use strict';
  const DAY = 86400000;
  const CORTEX = {
    identity: { label: 'Identity', hex: '#F08A3C', dir: [0.5, -0.28, 0.72], spread: 0.44, depth: 0.16, sub: 'People, organizations, tools and places', what: 'Who and what is in your world' },
    memory: { label: 'Memory', hex: '#34D4C0', dir: [-0.72, -0.3, 0.32], spread: 0.56, depth: 0.34, sub: 'Conversations and documents, by Space', what: 'What happened, and where' },
    knowledge: { label: 'Knowledge', hex: '#5AA0FF', dir: [-0.26, 0.76, 0.26], spread: 0.6, depth: 0.18, sub: 'Topics and expertise', what: 'What you know' },
    opportunity: { label: 'Opportunity', hex: '#FF6FA0', dir: [0.5, -0.74, 0.12], spread: 0.42, depth: 0.2, sub: 'Goals, targets and what you are working toward', what: 'What could come next' },
    action: { label: 'Action', hex: '#58D68D', dir: [0.74, 0.5, 0.3], spread: 0.46, depth: 0.18, sub: 'What you built and ran', what: 'What gets done' },
    communication: { label: 'Communication', hex: '#B08CFF', dir: [-0.15, 0.08, 0.92], spread: 0.4, depth: 0.12, sub: 'Style and connected channels', what: 'How you say it, where it flows' },
  };
  const KIND = {
    topic: { cortex: 'knowledge', shape: 'circle' }, expertise: { cortex: 'knowledge', shape: 'hex' },
    entity: { cortex: 'identity', shape: 'square' },
    goal: { cortex: 'opportunity', shape: 'diamond' }, build: { cortex: 'action', shape: 'tri' },
    style: { cortex: 'communication', shape: 'ring' }, connector: { cortex: 'communication', shape: 'plug' },
    thread: { cortex: 'memory', shape: 'circle' }, document: { cortex: 'memory', shape: 'doc' },
    intent: { cortex: 'opportunity', shape: 'star' },
  };

  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rand = (seed) => { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (hex, a) => { const c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; };
  const mix = (h1, h2, t) => { const a = hexRgb(h1), b = hexRgb(h2); return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')'; };
  const mixA = (h1, h2, t, al) => { const a = hexRgb(h1), b = hexRgb(h2); return 'rgba(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ',' + clamp(al, 0, 1).toFixed(3) + ')'; };

  // ---------- The shape: a brain seen from the side, front toward +x, the viewer's side toward +z ----------
  const gauss = (d, c, k) => Math.exp(-k * (1 - dot(d, c)));
  const LOBES = [[norm([0.85, 0.35, 0.35]), 0.09, 4], [norm([0.85, 0.35, -0.35]), 0.09, 4], [norm([-0.3, 0.9, 0.3]), 0.07, 4], [norm([-0.3, 0.9, -0.3]), 0.07, 4], [norm([0.35, -0.6, 0.75]), 0.14, 5], [norm([0.35, -0.6, -0.75]), 0.14, 5], [norm([-0.95, 0.1, 0.25]), 0.06, 5], [norm([-0.95, 0.1, -0.25]), 0.06, 5]];
  /** Radius of the surface in a unit direction: ellipsoid, lobes, a flatter underside, a midline groove and folds. */
  function radius(d) {
    let r = 1 / Math.sqrt((d[0] * d[0]) / 1.0 + (d[1] * d[1]) / (0.74 * 0.74) + (d[2] * d[2]) / (0.8 * 0.8));
    let bump = 0; for (const L of LOBES) bump += L[1] * gauss(d, L[0], L[2]);
    r *= 1 + bump;
    if (d[1] < -0.35) r *= 1 - 0.14 * ((-d[1] - 0.35) / 0.65);              // the flatter underside
    if (d[1] > 0.2) r *= 1 - 0.06 * Math.exp(-(d[2] * d[2]) / 0.012);        // the groove between the hemispheres
    r *= 1 + 0.028 * Math.sin(9.5 * d[0] + 2.1 * Math.sin(5.3 * d[1])) * Math.cos(7.7 * d[2] + 1.7 * d[0]);   // folds
    return r;
  }
  const shell = (d) => { const r = radius(d); return [d[0] * r, d[1] * r, d[2] * r]; };
  const inside = (d, k) => { const p = shell(d); return [p[0] * k, p[1] * k, p[2] * k]; };
  /** A smooth tangent field on the surface, so fibers follow fold-like flow lines. */
  function flow(d) {
    const g = [Math.cos(3.1 * d[1] + 1.2) + 0.6 * Math.sin(2.2 * d[2]), Math.sin(2.7 * d[0]) * 0.8 + 0.5 * Math.cos(3.5 * d[2] + 0.4), Math.cos(2.9 * d[0] + 2.3 * d[1])];
    return norm(cross(d, g));
  }
  function cortexAt(d) {
    let best = null, bd = -2;
    for (const k of Object.keys(CORTEX)) { const s = dot(d, norm(CORTEX[k].dir)); if (s > bd) { bd = s; best = k; } }
    return best;
  }
  /** The tissue: fibers along the surface and motes just under it, generated once and colored by cortex. */
  function tissue(fiberCount, moteCount) {
    const r = rand(1234567);
    const randDir = () => { const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [s * Math.cos(t), u, s * Math.sin(t)]; };
    const fibers = [];
    for (let i = 0; i < fiberCount; i++) {
      let d = randDir(); const depth = 0.9 + r() * 0.1; const pts = []; const steps = 10 + Math.floor(r() * 10); const sign = r() < 0.5 ? -1 : 1;
      for (let k = 0; k < steps; k++) { pts.push(inside(d, depth)); const f = flow(d); d = norm([d[0] + f[0] * 0.075 * sign, d[1] + f[1] * 0.075 * sign, d[2] + f[2] * 0.075 * sign]); }
      fibers.push({ pts, cortex: cortexAt(pts[Math.floor(pts.length / 2)].map((v, j) => v)), a: 0.35 + r() * 0.5, w: 0.6 + r() * 0.9, phase: r() * Math.PI * 2 });
    }
    const motes = [];
    for (let i = 0; i < moteCount; i++) { const d = randDir(); const k = 0.72 + Math.pow(r(), 0.5) * 0.28; motes.push({ p: inside(d, k), cortex: cortexAt(d), a: 0.25 + r() * 0.75, s: 0.6 + r() * 1.6, phase: r() * Math.PI * 2, tw: 0.4 + r() * 1.2 }); }
    return { fibers, motes };
  }

  /** How settled a learned node is at time t: recurrence and age both move it from the conversation that taught it into its cortex. */
  function settledAt(n, t) {
    if (n.kind === 'thread' || n.kind === 'build' || n.kind === 'connector' || n.kind === 'intent') return 1;
    const age = clamp((t - n.firstSeen) / (21 * DAY), 0, 1);
    const span = Math.max(1, n.lastSeen - n.firstSeen);
    const seen = 1 + ((n.count || 1) - 1) * clamp((t - n.firstSeen) / span, 0, 1);
    return clamp(0.45 + 0.3 * clamp((seen - 1) / 4, 0, 1) + 0.25 * age, 0, 1);
  }
  function weightAt(n, t) { const span = Math.max(1, n.lastSeen - n.firstSeen); return n.weight * clamp(0.3 + 0.7 * (t - n.firstSeen) / span, 0.3, 1); }
  const emerging = (n, t) => (t - n.lastSeen) < 14 * DAY && ((n.count || 1) >= 2 || n.kind === 'thread' || n.kind === 'build' || t - n.firstSeen < 14 * DAY);

  function homesFor(nodes, spaces) {
    const homes = {}; const spaceCenter = {};
    for (const s of spaces || []) { const r = rand(hash('space:' + s.id)); const C = CORTEX.memory; const d = norm(C.dir); const u = norm([d[0] + (r() - 0.5) * 0.9, d[1] + (r() - 0.5) * 0.7, d[2] + (r() - 0.5) * 0.9]); spaceCenter[s.id] = inside(u, 1 - C.depth * (0.5 + 0.4 * r())); }
    const pop = {}; for (const n of nodes) { const k = (KIND[n.kind] || KIND.topic).cortex; pop[k] = (pop[k] || 0) + 1; }
    for (const n of nodes) {
      const K = KIND[n.kind] || KIND.topic; const C = CORTEX[K.cortex]; const r = rand(hash(n.id)); const d = norm(C.dir);
      const off = norm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]);
      const sf = 1 + 0.14 * Math.log2(1 + (pop[K.cortex] || 1));
      const k = C.spread * sf * (0.25 + 0.75 * Math.sqrt(r())) * (1 - 0.35 * (n.weight || 0));
      const dir = norm([d[0] + off[0] * k, d[1] + off[1] * k, d[2] + off[2] * k]);
      const inward = 1 - C.depth * (0.15 + 0.85 * r()) - 0.05 * (n.weight || 0);
      let p = inside(dir, inward);
      if (n.kind === 'thread' && n.spaceId && spaceCenter[n.spaceId]) { const c = spaceCenter[n.spaceId]; const sp = 0.3 + 0.06 * Math.log2(1 + (pop.memory || 1)); p = [c[0] + (r() - 0.5) * sp, c[1] + (r() - 0.5) * sp * 0.8, c[2] + (r() - 0.5) * sp]; }
      homes[n.id] = p;
    }
    return { homes, spaceCenter };
  }

  function mount(container, model, opts) {
    opts = opts || {};
    let nodes = [], edges = [], byId = {}, homes = {}, spaceCenter = {}, spaces = [], org = { name: '' };
    let first = Date.now(); const born = {};
    const canvas = document.createElement('canvas'); canvas.className = 'g3d-canvas'; canvas.setAttribute('role', 'img');
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const now = () => Date.now();
    const small = (container.getBoundingClientRect().width || 800) < 640;
    const T = tissue(small ? 220 : 420, small ? 900 : 1900);
    let lod = 1;   // 1 draws everything, 2 every second mote, 3 every third: chosen from the measured frame time
    const st = { lattice: opts.lattice !== false, density: opts.density || 'std', route: null, yaw: -0.62, pitch: 0.16, zoom: 1, t: now(), playing: false, labels: opts.labels !== false, cortices: new Set(Object.keys(CORTEX)), query: '', hover: null, selected: null, focus: null, emerging: false, idle: !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches), lastPointer: 0, w: 0, h: 0, dpr: 1, stars: null };
    const listeners = []; const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push(() => el.removeEventListener(ev, fn, o)); };
    // The tissue is drawn at half resolution on its own layer (soft light does not need every pixel), then composited.
    const layer = document.createElement('canvas'); const lctx = layer.getContext('2d'); const HALF = 0.5;
    // Glow sprites, one per cortex color, drawn with additive blending.
    const sprites = {};
    for (const k of Object.keys(CORTEX)) { const s = document.createElement('canvas'); s.width = s.height = 32; const g = s.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, rgba(CORTEX[k].hex, 0.9)); gr.addColorStop(0.35, rgba(CORTEX[k].hex, 0.35)); gr.addColorStop(1, rgba(CORTEX[k].hex, 0)); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); sprites[k] = s; }
    const white = (() => { const s = document.createElement('canvas'); s.width = s.height = 32; const g = s.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.4, 'rgba(210,225,255,0.35)'); gr.addColorStop(1, 'rgba(200,220,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return s; })();

    function load(m, announce) {
      const prev = new Set(nodes.map(n => n.id));
      nodes = (m.nodes || []).filter(n => KIND[n.kind]).map(n => Object.assign({}, n, { weight: clamp(Number(n.weight) || 0.2, 0.05, 1), count: n.count || 1, firstSeen: n.firstSeen || now(), lastSeen: n.lastSeen || n.firstSeen || now() }));
      byId = {}; nodes.forEach(n => { byId[n.id] = n; });
      edges = (m.edges || []).filter(e => byId[e.a] && byId[e.b] && e.a !== e.b);
      spaces = m.spaces || []; org = m.org || org;
      const h = homesFor(nodes, spaces); homes = h.homes; spaceCenter = h.spaceCenter;
      first = nodes.length ? Math.min.apply(null, nodes.map(n => n.firstSeen)) : now();
      if (announce) for (const n of nodes) if (!prev.has(n.id)) born[n.id] = performance.now();
      canvas.setAttribute('aria-label', 'Your living brain: ' + nodes.length + ' nodes in six cortices inside ' + (org.name || 'your organization') + '. Drag to orbit, scroll to zoom, hover a node for details, click for more.');
    }
    load(model, false);

    function size() {
      const r = container.getBoundingClientRect(); const w = Math.max(320, Math.floor(r.width)); const h = Math.max(320, Math.floor(opts.height || Math.min(660, Math.max(400, w * 0.6))));
      st.dpr = Math.min(2, window.devicePixelRatio || 1); st.w = w; st.h = h;
      canvas.width = Math.floor(w * st.dpr); canvas.height = Math.floor(h * st.dpr); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      layer.width = Math.max(1, Math.floor(w * HALF)); layer.height = Math.max(1, Math.floor(h * HALF));
      const r2 = rand(7); st.stars = Array.from({ length: 160 }, () => [r2() * w, r2() * h, 0.4 + r2() * 1.1, 0.12 + r2() * 0.45]);
      draw();
    }
    function project(p) {
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
      const y2 = p[1] * cp - z1 * sp, z2 = p[1] * sp + z1 * cp;
      const f = 3.4; const s = f / (f - z2); const base = Math.min(st.w * 0.42, st.h * 0.5) * 0.9 * st.zoom;
      return { x: st.w / 2 + x1 * s * base, y: st.h / 2 + 8 - y2 * s * base, z: z2, s, base };
    }
    function positionAt(n, t) {
      const k = settledAt(n, t); const home = homes[n.id];
      if (k >= 1) return home;
      const teacher = n.origin && byId['thread:' + n.origin] ? homes['thread:' + n.origin] : null;
      const start = teacher || inside(norm(CORTEX.memory.dir), 1 - CORTEX.memory.depth);
      return lerp3(start, home, k);
    }
    const visible = (n, t) => n.firstSeen <= t && st.cortices.has(KIND[n.kind].cortex);
    const font = () => getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    const dimOf = (k) => st.focus ? (k === st.focus ? 1 : 0.22) : 1;
    let projected = [];

    function drawStage() {
      const c = ctx; const g = c.createRadialGradient(st.w * 0.5, st.h * 0.45, 20, st.w * 0.5, st.h * 0.5, Math.max(st.w, st.h) * 0.75);
      g.addColorStop(0, '#152540'); g.addColorStop(0.55, '#0E192D'); g.addColorStop(1, '#080F1D');
      c.fillStyle = g; c.fillRect(0, 0, st.w, st.h);
      for (const s of st.stars) { c.fillStyle = 'rgba(200,215,240,' + s[3].toFixed(2) + ')'; c.beginPath(); c.arc(s[0], s[1], s[2], 0, Math.PI * 2); c.fill(); }
    }
    /** The tissue, in additive light: cortex fields, fibers along the folds, motes under the surface, the core. */
    function drawTissue(ts) {
      const c = lctx; c.setTransform(HALF, 0, 0, HALF, 0, 0); c.clearRect(0, 0, st.w, st.h); c.globalCompositeOperation = 'lighter';
      // Cortex fields: soft light where each layer lives.
      for (const key of Object.keys(CORTEX)) {
        const C = CORTEX[key]; const d = norm(C.dir); const a = project(inside(d, 1 - C.depth * 0.5));
        const facing = clamp((a.z + 0.7) / 1.3, 0.2, 1);
        const rad = C.spread * 1.7 * a.base * a.s * 0.62;
        const gr = c.createRadialGradient(a.x, a.y, 0, a.x, a.y, rad); gr.addColorStop(0, rgba(C.hex, 0.22 * facing * dimOf(key))); gr.addColorStop(0.5, rgba(C.hex, 0.07 * facing * dimOf(key))); gr.addColorStop(1, rgba(C.hex, 0));
        c.fillStyle = gr; c.beginPath(); c.arc(a.x, a.y, rad, 0, Math.PI * 2); c.fill();
      }
      // Fibers.
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (let i = 0; i < T.fibers.length; i++) {
        const f = T.fibers[i]; if ((lod > 2 || st.density === 'min') && i % 2) continue;
        const pts = f.pts.map(project); const zm = pts.reduce((s, p) => s + p.z, 0) / pts.length; const depth = clamp((zm + 1.1) / 2.1, 0.08, 1);
        const pulse = 0.75 + 0.25 * Math.sin(ts / 1400 + f.phase);
        c.strokeStyle = rgba(CORTEX[f.cortex].hex, f.a * 0.5 * depth * depth * pulse * dimOf(f.cortex)); c.lineWidth = f.w * (0.6 + 0.6 * depth);
        c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let k = 1; k < pts.length; k++) c.lineTo(pts[k].x, pts[k].y); c.stroke();
      }
      // Motes.
      for (let i = 0; i < T.motes.length; i++) {
        const m = T.motes[i]; if (i % (st.density === 'min' ? Math.max(2, lod) : lod)) continue;
        const p = project(m.p); const depth = clamp((p.z + 1.1) / 2.1, 0.05, 1);
        const tw = 0.7 + 0.3 * Math.sin(ts / (900 * m.tw) + m.phase);
        const sz = (2.2 + 5.5 * m.s) * (0.5 + 0.7 * depth) * p.s * Math.min(1.3, st.zoom);
        c.globalAlpha = m.a * depth * depth * tw * dimOf(m.cortex);
        c.drawImage(sprites[m.cortex], p.x - sz, p.y - sz, sz * 2, sz * 2);
      }
      c.globalAlpha = 1;
      // The identity core: the organization at the center of everything it governs.
      const core = project([0.02, -0.02, 0]); const cr = 0.14 * core.base * core.s;
      const gr = c.createRadialGradient(core.x, core.y, 0, core.x, core.y, cr * 2.4); gr.addColorStop(0, 'rgba(255,236,190,0.55)'); gr.addColorStop(0.25, 'rgba(255,200,120,0.22)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(core.x, core.y, cr * 2.4, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true; ctx.drawImage(layer, 0, 0, layer.width, layer.height, 0, 0, st.w, st.h); ctx.globalCompositeOperation = 'source-over';
      return core;
    }
    /** Footprints: what came in lately, streaming from the edge into Memory. */
    function drawStreams(ts) {
      const c = ctx; const t = st.t;
      const recent = nodes.filter(n => (n.kind === 'thread' || n.kind === 'build' || n.kind === 'connector') && n.lastSeen <= t && t - n.lastSeen < 21 * DAY).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 5);
      if (!recent.length) return;
      c.globalCompositeOperation = 'lighter';
      recent.forEach((n, i) => {
        const to = project(positionAt(n, t)); const y0 = st.h * (0.3 + 0.1 * i); const x0 = -10; const cx = st.w * 0.18, cy = (y0 + to.y) / 2 + (i % 2 ? 20 : -20);
        const K = KIND[n.kind]; const hex = CORTEX[K.cortex].hex;
        c.strokeStyle = rgba(hex, 0.16 * dimOf(K.cortex)); c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, to.x, to.y); c.stroke();
        for (let k = 0; k < 3; k++) { const u = ((ts / 2600 + k / 3 + i * 0.17) % 1); const x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * to.x, y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * to.y; const sz = 4 + 3 * (1 - u); c.globalAlpha = (0.35 + 0.5 * (1 - u)) * dimOf(K.cortex); c.drawImage(sprites[K.cortex], x - sz, y - sz, sz * 2, sz * 2); }
        c.globalAlpha = 1;
        if (st.labels) { c.globalCompositeOperation = 'source-over'; c.font = '500 10.5px ' + font(); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(210,222,240,0.8)'; c.fillText((n.kind === 'thread' ? 'Conversation' : n.kind === 'build' ? 'Built app' : 'Channel') + ' · ' + (n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label), 14, y0 - 9); c.globalCompositeOperation = 'lighter'; }
      });
      c.globalCompositeOperation = 'source-over';
      if (st.labels) { c.font = '600 10px ' + font(); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(160,178,205,0.75)'; c.fillText('NEW FOOTPRINTS', 14, st.h * 0.3 - 26); }
    }
    /** IGL, the nervous system: a faint governance lattice over the whole body, brighter where a route is being checked. */
    function drawLattice() {
      const c = ctx; c.globalCompositeOperation = 'lighter'; c.lineWidth = 0.8;
      const al = st.route ? 0.16 : 0.09;
      for (let i = 1; i < 6; i++) { const phi = -Math.PI / 2 + Math.PI * i / 6; c.beginPath(); for (let k = 0; k <= 64; k++) { const th = Math.PI * 2 * k / 64; const p = project(shell([Math.cos(phi) * Math.cos(th), Math.sin(phi), Math.cos(phi) * Math.sin(th)])); if (k === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); } c.strokeStyle = 'rgba(120,170,255,' + al + ')'; c.stroke(); }
      for (let j = 0; j < 8; j++) { const th = Math.PI * j / 8; c.beginPath(); for (let k = 0; k <= 64; k++) { const phi = -Math.PI / 2 + Math.PI * k / 64; const p = project(shell([Math.cos(phi) * Math.cos(th), Math.sin(phi), Math.cos(phi) * Math.sin(th)])); if (k === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); } c.strokeStyle = 'rgba(120,170,255,' + al + ')'; c.stroke(); }
      c.globalCompositeOperation = 'source-over';
    }
    /**
     * Discover on the move: a pulse travels the route node by node, lighting each pathway as it passes, with the
     * governance check shown at each hop. The route stays lit for a moment, then fades.
     */
    function drawRoute(ts, pi) {
      const R = st.route; if (!R) return;
      const per = 750; const total = per * Math.max(1, R.ids.length - 1); const el = ts - R.start;
      if (el > total + 2600) { st.route = null; if (opts.onRouteDone) opts.onRouteDone(R); return; }
      const c = ctx; c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      const pts = R.ids.map(id => pi[id]).filter(Boolean); if (pts.length < 1) { st.route = null; return; }
      const fade = el > total ? clamp(1 - (el - total - 1200) / 1400, 0, 1) : 1;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]; const seg = clamp((el - i * per) / per, 0, 1); if (seg <= 0) break;
        c.strokeStyle = 'rgba(255,236,190,' + (0.85 * fade).toFixed(2) + ')'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(a.p.x, a.p.y); c.lineTo(lerp(a.p.x, b.p.x, seg), lerp(a.p.y, b.p.y, seg)); c.stroke();
        c.strokeStyle = 'rgba(120,170,255,' + (0.35 * fade).toFixed(2) + ')'; c.lineWidth = 6; c.stroke();
      }
      const hop = Math.min(pts.length - 1, Math.floor(el / per)); const seg = clamp((el - hop * per) / per, 0, 1);
      const a = pts[hop], b = pts[Math.min(pts.length - 1, hop + 1)]; const x = el >= total ? pts[pts.length - 1].p.x : lerp(a.p.x, b.p.x, seg), y = el >= total ? pts[pts.length - 1].p.y : lerp(a.p.y, b.p.y, seg);
      const sz = 14 + 4 * Math.sin(ts / 120); c.globalAlpha = fade; c.drawImage(white, x - sz, y - sz, sz * 2, sz * 2); c.globalAlpha = 1;
      for (let i = 0; i <= Math.min(pts.length - 1, hop + (el >= total ? 0 : 0)); i++) { const q = pts[i]; c.globalAlpha = 0.7 * fade; c.drawImage(white, q.p.x - q.r * 2.2, q.p.y - q.r * 2.2, q.r * 4.4, q.r * 4.4); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      if (st.labels) {
        c.font = '600 10.5px ' + font(); c.textAlign = 'left'; c.textBaseline = 'top';
        const head = 'DISCOVER \u00b7 ' + (el >= total ? 'route complete' : 'traversing') + ' \u00b7 IGL ' + (el >= total ? 'allowed' : 'checking hop ' + (hop + 1) + ' of ' + (pts.length - 1));
        c.fillStyle = 'rgba(255,236,190,' + (0.95 * fade).toFixed(2) + ')'; c.fillText(head, 14, st.h - 40);
        if (R.label) { c.font = '500 11px ' + font(); c.fillStyle = 'rgba(236,241,250,' + (0.9 * fade).toFixed(2) + ')'; c.fillText(R.label.length > 90 ? R.label.slice(0, 89) + '\u2026' : R.label, 14, st.h - 24); }
      }
    }
    function drawCortexLabels(core) {
      if (!st.labels) return;
      const c = ctx;
      for (const key of Object.keys(CORTEX)) {
        const C = CORTEX[key]; const d = norm(C.dir); const a = project(inside(d, 1.08));
        const facing = clamp((a.z + 0.55) / 1.05, 0.2, 1);
        if (facing < 0.3) continue;
        c.font = '600 11px ' + font(); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 3; c.strokeStyle = 'rgba(8,15,29,0.7)'; c.strokeText(C.label.toUpperCase(), a.x, a.y);
        c.fillStyle = rgba(C.hex, 0.95 * facing); c.fillText(C.label.toUpperCase(), a.x, a.y);
        if (st.focus === key) { c.font = '500 10px ' + font(); c.fillStyle = 'rgba(210,222,240,' + (0.85 * facing).toFixed(2) + ')'; c.fillText(C.what, a.x, a.y + 13); }
      }
      // The core's label and the boundary label.
      c.font = '600 10.5px ' + font(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(8,15,29,0.75)';
      const name = (org.name || 'Your organization'); c.strokeText(name, core.x, core.y - 6); c.fillStyle = 'rgba(255,240,210,0.95)'; c.fillText(name, core.x, core.y - 6);
      c.font = '500 9.5px ' + font(); c.strokeText('identity core', core.x, core.y + 7); c.fillStyle = 'rgba(255,225,180,0.85)'; c.fillText('identity core', core.x, core.y + 7);
      c.textAlign = 'right'; c.textBaseline = 'top'; c.font = '600 10.5px ' + font(); c.fillStyle = 'rgba(200,214,235,0.8)'; c.fillText(name.toUpperCase(), st.w - 14, 14);
      c.font = '500 10px ' + font(); c.fillStyle = 'rgba(160,178,205,0.75)'; c.fillText('governed boundary · IGL', st.w - 14, 28);
    }
    function shapePath(c, kind, x, y, r) {
      c.beginPath();
      switch (KIND[kind].shape) {
        case 'square': c.rect(x - r, y - r, r * 2, r * 2); break;
        case 'diamond': c.moveTo(x, y - r * 1.25); c.lineTo(x + r * 1.25, y); c.lineTo(x, y + r * 1.25); c.lineTo(x - r * 1.25, y); c.closePath(); break;
        case 'hex': for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; const px = x + r * 1.12 * Math.cos(a), py = y + r * 1.12 * Math.sin(a); if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); } c.closePath(); break;
        case 'tri': c.moveTo(x, y - r * 1.25); c.lineTo(x + r * 1.15, y + r * 0.9); c.lineTo(x - r * 1.15, y + r * 0.9); c.closePath(); break;
        case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.5 : r * 1.25; const px = x + rr * Math.cos(a), py = y + rr * Math.sin(a); if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); } c.closePath(); break;
        case 'doc': c.rect(x - r * 0.8, y - r, r * 1.6, r * 2); break;
        case 'plug': { const k = r * 0.9; c.moveTo(x - k, y - k * 0.6); c.lineTo(x + k, y - k * 0.6); c.lineTo(x + k, y + k * 0.6); c.lineTo(x - k, y + k * 0.6); c.closePath(); break; }
        default: c.arc(x, y, r, 0, Math.PI * 2);
      }
    }

    function draw() {
      const c = ctx; if (!c) return;
      const t0 = performance.now();
      c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      drawStage();
      const ts = t0; const t = st.t;
      const core = drawTissue(ts);
      if (st.lattice) drawLattice();
      drawStreams(ts);
      const shown = nodes.filter(n => visible(n, t));
      const P = shown.map(n => {
        const K = KIND[n.kind]; const C = CORTEX[K.cortex]; const p = project(positionAt(n, t)); const w = weightAt(n, t);
        let dim = 1;
        if (st.query) dim = n.label.toLowerCase().includes(st.query) ? 1 : 0.1;
        else if (st.focus) dim = K.cortex === st.focus ? 1 : 0.18;
        else if (st.emerging) dim = emerging(n, t) ? 1 : 0.14;
        const depth = clamp((p.z + 1) / 2, 0.15, 1);
        const r = (2.6 + 8.5 * w) * (0.72 + 0.28 * p.s) * Math.min(1.35, st.zoom) * (n.kind === 'intent' ? 0.7 : 1);
        return { n, p, w, dim, r, depth, hex: C.hex, cortex: K.cortex };
      });
      const pi = {}; P.forEach(x => { pi[x.n.id] = x; });
      // Space boundaries in Memory: a governed ring around each Space's threads.
      for (const s of spaces) {
        const members = P.filter(x => x.n.kind === 'thread' && x.n.spaceId === s.id); if (!members.length) continue;
        const cx = members.reduce((a, x) => a + x.p.x, 0) / members.length, cy = members.reduce((a, x) => a + x.p.y, 0) / members.length;
        const rr = Math.max(22, members.reduce((a, x) => Math.max(a, Math.hypot(x.p.x - cx, x.p.y - cy)), 0) + 16);
        const hue = s.color || CORTEX.memory.hex; const dim = dimOf('memory');
        c.strokeStyle = rgba(hue, 0.4 * dim); c.lineWidth = 1; c.setLineDash([3, 4]); c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
        c.fillStyle = rgba(hue, 0.05 * dim); c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.fill();
        if (st.labels) { c.font = '600 9.5px ' + font(); c.textAlign = 'center'; c.textBaseline = 'bottom'; c.lineWidth = 3; c.strokeStyle = 'rgba(8,15,29,0.7)'; const lab = String(s.name || 'Space').toUpperCase().slice(0, 24); c.strokeText(lab, cx, cy - rr - 3); c.fillStyle = rgba(hue, 0.95 * dim); c.fillText(lab, cx, cy - rr - 3); }
      }
      // Pathways, in light.
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (const e of edges) {
        const a = pi[e.a], b = pi[e.b]; if (!a || !b) continue;
        if (e.at && e.at > t) continue;
        const depth = clamp(((a.p.z + b.p.z) / 2 + 1) / 2, 0.15, 1); const dim = Math.min(a.dim, b.dim);
        const hot = st.hover === a.n.id || st.hover === b.n.id || st.selected === a.n.id || st.selected === b.n.id;
        const w = clamp(e.weight || 0.3, 0.05, 1);
        const young = born[e.b] || born[e.a]; const grow = young ? clamp((ts - young) / 1400, 0, 1) : 1;
        c.strokeStyle = hot ? rgba(a.hex, 0.95 * dim) : mixA(a.hex, b.hex, 0.5, (0.16 + 0.42 * w) * depth * dim);
        c.lineWidth = (0.6 + 1.9 * w) * (hot ? 1.5 : 1);
        c.beginPath(); c.moveTo(a.p.x, a.p.y); c.lineTo(lerp(a.p.x, b.p.x, grow), lerp(a.p.y, b.p.y, grow)); c.stroke();
      }
      // Nodes, back to front: glow in light, body solid.
      P.sort((a, b) => a.p.z - b.p.z);
      for (const x of P) {
        const hot = st.hover === x.n.id || st.selected === x.n.id; const em = st.emerging && emerging(x.n, t);
        const age = born[x.n.id] ? (ts - born[x.n.id]) / 3000 : 2;
        const glow = x.r * (hot ? 4 : em ? 3.2 : 2.4) * (age < 1 ? 1 + (1 - age) * 1.6 : 1);
        c.globalAlpha = (hot ? 0.95 : em ? 0.8 : 0.55) * x.dim * (0.5 + 0.5 * x.depth);
        c.drawImage(sprites[x.cortex], x.p.x - glow, x.p.y - glow, glow * 2, glow * 2);
        if (age < 1) { c.globalAlpha = 1; c.strokeStyle = rgba(x.hex, (1 - age) * 0.9); c.lineWidth = 1.5; c.beginPath(); c.arc(x.p.x, x.p.y, x.r + 4 + age * 28, 0, Math.PI * 2); c.stroke(); }
        if (em) { const pulse = 0.5 + 0.5 * Math.sin(ts / 600 + hash(x.n.id) % 7); c.globalAlpha = 0.4 * pulse * x.dim; c.strokeStyle = rgba(x.hex, 1); c.lineWidth = 1; c.beginPath(); c.arc(x.p.x, x.p.y, x.r + 3 + 5 * pulse, 0, Math.PI * 2); c.stroke(); }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      const boxes = [];
      for (const x of P) {
        const hot = st.hover === x.n.id || st.selected === x.n.id; const em = st.emerging && emerging(x.n, t);
        const al = (0.7 + 0.3 * x.depth) * x.dim;
        shapePath(c, x.n.kind, x.p.x, x.p.y, x.r);
        if (KIND[x.n.kind].shape === 'ring') { c.lineWidth = 2; c.strokeStyle = rgba(x.hex, al); c.stroke(); }
        else { c.fillStyle = mix(x.hex, '#FFFFFF', hot ? 0.5 : 0.22 + 0.2 * x.depth); c.globalAlpha = al; c.fill(); c.globalAlpha = 1; }
        const onRoute = st.route && st.route.ids.includes(x.n.id);
        const thr = st.density === 'max' ? 0.12 : st.density === 'min' ? 0.7 : (x.n.kind === 'thread' ? 0.55 : 0.3);
        const wantLabel = st.labels && x.dim > 0.5 && (hot || onRoute || x.w > thr || st.query || (st.emerging && em)) && x.p.z > -0.6 && (x.n.kind !== 'intent' || onRoute || st.density === 'max');
        if (wantLabel) {
          c.font = (hot ? '600 ' : '500 ') + Math.round(11 + 2 * x.depth) + 'px ' + font(); c.textAlign = 'left'; c.textBaseline = 'middle';
          const max = x.n.kind === 'thread' || x.n.kind === 'build' ? 24 : 28; const label = x.n.label.length > max ? x.n.label.slice(0, max - 1) + '…' : x.n.label; const tw = c.measureText(label).width; const lx = x.p.x + x.r + 6, ly = x.p.y;
          const box = [lx - 2, ly - 8, lx + tw + 2, ly + 8];
          if (hot || !boxes.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) {
            boxes.push(box);
            c.lineWidth = 3; c.strokeStyle = 'rgba(8,15,29,0.85)'; c.lineJoin = 'round'; c.strokeText(label, lx, ly);
            c.fillStyle = 'rgba(236,241,250,' + (0.75 + 0.25 * x.depth).toFixed(2) + ')'; c.fillText(label, lx, ly);
          }
        }
      }
      projected = P;
      drawCortexLabels(core);
      if (st.t < now() - 60000) { c.font = '600 11px ' + font(); c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = 'rgba(236,241,250,0.9)'; c.fillText('As of ' + new Date(st.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 14, 14); }
      if (st.emerging) { c.font = '600 11px ' + font(); c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = rgba(CORTEX.opportunity.hex, 0.95); c.fillText('EMERGING: what is strengthening now', 14, st.t < now() - 60000 ? 30 : 14); }
      drawRoute(ts, pi);
      // Level of detail from the measured cost of this frame.
      const cost = performance.now() - t0; if (cost > 34 && lod < 3) lod++; else if (cost < 12 && lod > 1) lod--;
    }

    // Animation: the tissue breathes, so the loop runs while the brain is on screen; it rests when scrolled away or hidden.
    let raf = 0, lastFrame = 0, playStart = 0, onScreen = true;
    function frame(ts) {
      raf = 0; const dt = lastFrame ? Math.min(50, ts - lastFrame) : 16; lastFrame = ts;
      if (st.idle && Date.now() - st.lastPointer > 2500) st.yaw += 0.00009 * dt;
      if (st.playing) { const span = Math.max(1, now() - first); const k = clamp((ts - playStart) / 16000, 0, 1); st.t = first + span * k; if (k >= 1) { st.playing = false; st.t = now(); if (opts.onTime) opts.onTime(st.t, false); } else if (opts.onTime) opts.onTime(st.t, true); }
      draw();
      if (onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const io = window.IntersectionObserver ? new IntersectionObserver((en) => { onScreen = en.some(e => e.isIntersecting); if (onScreen) kick(); }, { threshold: 0.05 }) : null; if (io) io.observe(canvas);
    on(document, 'visibilitychange', () => { if (!document.hidden) kick(); });

    // Pointer: drag orbits, wheel zooms, hover picks, click selects. Touch: one finger orbits, two pinch.
    let drag = null, pinch = null;
    const pick = (x, y) => { let best = null, bd = 1e9; for (const p of projected) { const d = Math.hypot(p.p.x - x, p.p.y - y); if (d < p.r + 7 && d < bd && p.dim > 0.3) { bd = d; best = p.n; } } return best; };
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    on(canvas, 'pointerdown', (e) => { st.lastPointer = Date.now(); if (e.pointerType === 'touch' && pinch) return; drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
    on(canvas, 'pointermove', (e) => {
      st.lastPointer = Date.now();
      if (drag && drag.id === e.pointerId) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; st.yaw += dx * 0.006; st.pitch = clamp(st.pitch + dy * 0.005, -1.2, 1.2); drag.x = e.clientX; drag.y = e.clientY; return; }
      const [x, y] = local(e); const n = pick(x, y);
      if ((n && n.id) !== st.hover) { st.hover = n ? n.id : null; canvas.style.cursor = n ? 'pointer' : 'grab'; }
      if (opts.onHover) opts.onHover(n, x, y);
    });
    const endDrag = (e) => { if (!drag) return; const moved = drag.moved; drag = null; canvas.style.cursor = 'grab'; if (!moved) { const [x, y] = local(e); const n = pick(x, y); st.selected = n ? n.id : null; if (n && opts.onSelect) opts.onSelect(n); } };
    on(canvas, 'pointerup', endDrag); on(canvas, 'pointercancel', () => { drag = null; });
    on(canvas, 'pointerleave', () => { if (st.hover) st.hover = null; if (opts.onHover) opts.onHover(null); });
    on(canvas, 'wheel', (e) => { e.preventDefault(); st.lastPointer = Date.now(); st.zoom = clamp(st.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.55, 2.8); }, { passive: false });
    on(canvas, 'touchstart', (e) => { if (e.touches.length === 2) { drag = null; pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), z: st.zoom }; } }, { passive: true });
    on(canvas, 'touchmove', (e) => { if (pinch && e.touches.length === 2) { e.preventDefault(); const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); st.zoom = clamp(pinch.z * d / pinch.d, 0.55, 2.8); } }, { passive: false });
    on(canvas, 'touchend', () => { pinch = null; }, { passive: true });
    on(canvas, 'keydown', (e) => { const step = 0.12; if (e.key === 'ArrowLeft') st.yaw -= step; else if (e.key === 'ArrowRight') st.yaw += step; else if (e.key === 'ArrowUp') st.pitch = clamp(st.pitch - step, -1.2, 1.2); else if (e.key === 'ArrowDown') st.pitch = clamp(st.pitch + step, -1.2, 1.2); else if (e.key === '+' || e.key === '=') st.zoom = clamp(st.zoom * 1.1, 0.55, 2.8); else if (e.key === '-') st.zoom = clamp(st.zoom / 1.1, 0.55, 2.8); else return; e.preventDefault(); st.lastPointer = Date.now(); });
    canvas.tabIndex = 0; canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none';
    const ro = window.ResizeObserver ? new ResizeObserver(() => size()) : null; if (ro) ro.observe(container); else on(window, 'resize', size);
    size(); kick();

    const api = {
      update: (m) => { const prev = new Set(nodes.map(n => n.id)); load(m, true); const fresh = nodes.filter(n => !prev.has(n.id) && n.origin && byId['thread:' + n.origin]); if (fresh.length) api.traverse(['thread:' + fresh[0].origin].concat(fresh.slice(0, 6).map(n => n.id)), { label: 'Learned from a conversation: ' + fresh.slice(0, 3).map(n => n.label).join(', ') }); kick(); },
      setTime: (t) => { st.playing = false; st.t = clamp(t, first, now()); kick(); },
      play: () => { st.playing = true; playStart = performance.now(); st.t = first; kick(); },
      stop: () => { st.playing = false; st.t = now(); if (opts.onTime) opts.onTime(st.t, false); kick(); },
      playing: () => st.playing,
      range: () => ({ first, now: now() }),
      setQuery: (q) => { st.query = String(q || '').trim().toLowerCase(); kick(); },
      toggleCortex: (k) => { if (st.cortices.has(k)) st.cortices.delete(k); else st.cortices.add(k); kick(); return st.cortices.has(k); },
      setLabels: (b) => { st.labels = !!b; kick(); },
      setEmerging: (b) => { st.emerging = !!b; kick(); return st.emerging; },
      focus: (k) => { st.focus = k && CORTEX[k] ? k : null; kick(); },
      setLattice: (b) => { st.lattice = !!b; kick(); return st.lattice; },
      setDensity: (d) => { st.density = d === 'min' || d === 'max' ? d : 'std'; kick(); },
      /** Light a route through the brain, node id by node id, as Discover would walk it. */
      traverse: (ids, o) => { const list = (ids || []).filter(id => byId[id]); if (list.length < 1) return false; st.route = { ids: list, start: performance.now(), label: (o && o.label) || '' }; st.selected = null; kick(); return true; },
      /** The route a conversation taught: the thread, then every node it added, heaviest first. */
      traceThread: (threadId, o) => { const id = 'thread:' + threadId; if (!byId[id]) return false; const taught = nodes.filter(n => n.origin === threadId && n.kind !== 'intent').sort((a, b) => b.weight - a.weight).slice(0, 7).map(n => n.id); return api.traverse([id].concat(taught), o); },
      select: (id) => { st.selected = id || null; kick(); },
      resetView: () => { st.yaw = -0.62; st.pitch = 0.16; st.zoom = 1; st.idle = true; st.lastPointer = 0; kick(); },
      cortexOf: (n) => KIND[n.kind] ? KIND[n.kind].cortex : null,
      settled: (n) => settledAt(n, st.t),
      emerging: (n) => emerging(n, st.t),
      counts: () => { const out = {}; for (const n of nodes) { const k = KIND[n.kind].cortex; out[k] = (out[k] || 0) + 1; } return out; },
      nodes: () => nodes,
      CORTEX, KIND,
      destroy: () => { listeners.forEach(f => f()); if (ro) ro.disconnect(); if (io) io.disconnect(); onScreen = false; if (raf) cancelAnimationFrame(raf); canvas.remove(); },
    };
    return api;
  }
  window.RicorsaGraph3D = { mount, CORTEX, KIND };
})();
