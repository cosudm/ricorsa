/**
 * The living brain: Ricorsa's identity graph as a 4D interface.
 *
 * Everything the account holds is drawn inside one translucent, brain-shaped membrane (the organization, the
 * governed boundary), in six cortices that are product layers, not neuroscience labels:
 *   Identity        the people, organizations, tools and places Ricorsa has learned
 *   Memory          conversations and their documents; each Space is a governed sub-boundary around its threads
 *   Knowledge       topics and expertise
 *   Discovery       the patterns Ricorsa inferred about what the person is trying to do
 *   Action          goals, and the apps, agents and tools that were built
 *   Communication   how the person likes things said, and the channels connected
 * Connections are pathways: node to node, and node to the conversation that taught it. A thing Ricorsa learns is
 * born next to the conversation it came from, in Memory, and settles into its cortex as it recurs over weeks.
 * Time is the fourth dimension: the scrubber shows the brain as it was, Replay shows it forming, Emerging lights
 * what is strengthening now, and learning that happens while the brain is open is drawn as it happens.
 * Identity Governed Logic is not a region: the membrane and the Space boundaries are where it shows.
 *
 * Plain canvas, no library. window.RicorsaGraph3D.mount(container, model, options) returns a controller; the
 * model is assembled by the app from the graph, the threads, the builds and the connectors.
 */
(function () {
  'use strict';
  const DAY = 86400000;
  const CORTEX = {
    identity: { label: 'Identity', hex: '#D0743A', dir: [0.3, -0.55, 0.7], spread: 0.46, depth: 0.16, sub: 'People, organizations, tools and places', what: 'Who and what is in your world' },
    memory: { label: 'Memory', hex: '#2BB3A3', dir: [-0.72, -0.3, 0.3], spread: 0.56, depth: 0.34, sub: 'Conversations and documents, by Space', what: 'What happened, and where' },
    knowledge: { label: 'Knowledge', hex: '#4C8FE0', dir: [-0.28, 0.74, 0.22], spread: 0.6, depth: 0.18, sub: 'Topics and expertise', what: 'What you know' },
    discovery: { label: 'Discovery', hex: '#D9557F', dir: [-0.08, 0.18, 0.0], spread: 0.3, depth: 0.92, sub: 'Patterns Ricorsa inferred', what: 'What you are trying to do' },
    action: { label: 'Action', hex: '#4FBF7E', dir: [0.72, 0.5, 0.3], spread: 0.46, depth: 0.18, sub: 'Goals, and what you built', what: 'What gets done' },
    communication: { label: 'Communication', hex: '#9B7FE0', dir: [0.5, -0.15, 0.82], spread: 0.4, depth: 0.12, sub: 'Style and connected channels', what: 'How you say it, where it flows' },
  };
  const KIND = {
    topic: { cortex: 'knowledge', shape: 'circle' }, expertise: { cortex: 'knowledge', shape: 'hex' },
    entity: { cortex: 'identity', shape: 'square' },
    goal: { cortex: 'action', shape: 'diamond' }, build: { cortex: 'action', shape: 'tri' },
    style: { cortex: 'communication', shape: 'ring' }, connector: { cortex: 'communication', shape: 'plug' },
    thread: { cortex: 'memory', shape: 'circle' }, document: { cortex: 'memory', shape: 'doc' },
    intent: { cortex: 'discovery', shape: 'star' },
  };
  const SHELL = [1.0, 0.76, 0.84];

  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rand = (seed) => { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (hex, a) => { const c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; };
  const mix = (h1, h2, t) => { const a = hexRgb(h1), b = hexRgb(h2); return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')'; };
  const mixA = (h1, h2, t, al) => { const a = hexRgb(h1), b = hexRgb(h2); return 'rgba(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ',' + clamp(al, 0, 1).toFixed(3) + ')'; };

  /** A point on the membrane for a unit direction: an ellipsoid shaped a little like a brain seen from the side. */
  function shell(d) {
    let x = d[0] * SHELL[0], y = d[1] * SHELL[1], z = d[2] * SHELL[2];
    // The midline groove along the top, the frontal taper, the flatter underside and the temporal bulge.
    if (y > 0) y *= 1 - 0.07 * Math.exp(-(z * z) / 0.02);
    if (x > 0.55) y *= 1 - 0.18 * (x - 0.55) / 0.45;
    if (y < -0.2) { y *= 0.92; if (x > -0.25 && x < 0.65) z *= 1 + 0.1 * Math.min(1, (-y - 0.2) / 0.3); }
    if (x < -0.7) y *= 1 - 0.12 * (-x - 0.7) / 0.3;
    return [x, y, z];
  }
  const inside = (d, k) => { const p = shell(d); return [p[0] * k, p[1] * k, p[2] * k]; };

  /** How settled a learned node is at time t: recurrence and age both move it from the conversation that taught it into its cortex. */
  function settledAt(n, t) {
    if (n.kind === 'thread' || n.kind === 'build' || n.kind === 'connector' || n.kind === 'intent') return 1;
    const age = clamp((t - n.firstSeen) / (21 * DAY), 0, 1);
    const span = Math.max(1, n.lastSeen - n.firstSeen);
    const seen = 1 + ((n.count || 1) - 1) * clamp((t - n.firstSeen) / span, 0, 1);
    return clamp(0.45 + 0.3 * clamp((seen - 1) / 4, 0, 1) + 0.25 * age, 0, 1);
  }
  function weightAt(n, t) { const span = Math.max(1, n.lastSeen - n.firstSeen); return n.weight * clamp(0.3 + 0.7 * (t - n.firstSeen) / span, 0.3, 1); }
  /** Whether a node is strengthening right now: touched in the last two weeks and seen more than once, or made in the last two weeks. */
  const emerging = (n, t) => (t - n.lastSeen) < 14 * DAY && ((n.count || 1) >= 2 || n.kind === 'thread' || n.kind === 'build' || t - n.firstSeen < 14 * DAY);

  function homesFor(nodes, spaces) {
    const homes = {}; const spaceCenter = {};
    for (const s of spaces || []) { const r = rand(hash('space:' + s.id)); const C = CORTEX.memory; const d = norm(C.dir); const u = norm([d[0] + (r() - 0.5) * 0.9, d[1] + (r() - 0.5) * 0.7, d[2] + (r() - 0.5) * 0.9]); spaceCenter[s.id] = inside(u, 1 - C.depth * (0.5 + 0.4 * r())); }
    const pop = {}; for (const n of nodes) { const k = (KIND[n.kind] || KIND.topic).cortex; pop[k] = (pop[k] || 0) + 1; }
    for (const n of nodes) {
      const K = KIND[n.kind] || KIND.topic; const C = CORTEX[K.cortex]; const r = rand(hash(n.id)); const d = norm(C.dir);
      const off = norm([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]);
      const sf = 1 + 0.14 * Math.log2(1 + (pop[K.cortex] || 1));
      let k = C.spread * sf * (0.25 + 0.75 * Math.sqrt(r())) * (1 - 0.35 * (n.weight || 0));
      let dir = norm([d[0] + off[0] * k, d[1] + off[1] * k, d[2] + off[2] * k]);
      let inward = 1 - C.depth * (0.15 + 0.85 * r()) - 0.05 * (n.weight || 0);
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
    const st = { yaw: -0.62, pitch: 0.2, zoom: 1, t: now(), playing: false, labels: opts.labels !== false, cortices: new Set(Object.keys(CORTEX)), query: '', hover: null, selected: null, focus: null, emerging: false, idle: !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches), lastPointer: 0, w: 0, h: 0, dpr: 1, stars: null };
    const listeners = []; const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push(() => el.removeEventListener(ev, fn, o)); };

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
      const r2 = rand(7); st.stars = Array.from({ length: 140 }, () => [r2() * w, r2() * h, 0.4 + r2() * 1.1, 0.15 + r2() * 0.45]);
      draw();
    }
    function project(p) {
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
      const y2 = p[1] * cp - z1 * sp, z2 = p[1] * sp + z1 * cp;
      const f = 3.4; const s = f / (f - z2); const base = Math.min(st.w * 0.42, st.h * 0.5) * 0.86 * st.zoom;
      return { x: st.w / 2 + x1 * s * base, y: st.h / 2 + 6 - y2 * s * base, z: z2, s, base };
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
    let projected = [];

    function drawStage() {
      const c = ctx; const g = c.createRadialGradient(st.w * 0.5, st.h * 0.45, 20, st.w * 0.5, st.h * 0.5, Math.max(st.w, st.h) * 0.75);
      g.addColorStop(0, '#182842'); g.addColorStop(0.55, '#101B30'); g.addColorStop(1, '#0A1120');
      c.fillStyle = g; c.fillRect(0, 0, st.w, st.h);
      for (const s of st.stars) { c.fillStyle = 'rgba(200,215,240,' + s[3].toFixed(2) + ')'; c.beginPath(); c.arc(s[0], s[1], s[2], 0, Math.PI * 2); c.fill(); }
    }
    function drawMembrane() {
      const c = ctx; c.lineWidth = 1;
      const line = 'rgba(170,195,235,0.14)';
      for (let i = 1; i < 7; i++) { const phi = -Math.PI / 2 + Math.PI * i / 7; c.beginPath(); for (let k = 0; k <= 56; k++) { const th = Math.PI * 2 * k / 56; const p = project(shell([Math.cos(phi) * Math.cos(th), Math.sin(phi), Math.cos(phi) * Math.sin(th)])); if (k === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); } c.strokeStyle = line; c.stroke(); }
      for (let j = 0; j < 9; j++) { const th = Math.PI * j / 9; c.beginPath(); for (let k = 0; k <= 56; k++) { const phi = -Math.PI / 2 + Math.PI * k / 56; const p = project(shell([Math.cos(phi) * Math.cos(th), Math.sin(phi), Math.cos(phi) * Math.sin(th)])); if (k === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); } c.strokeStyle = line; c.stroke(); }
      // Silhouette: the outline as seen from this angle, a little brighter, so the shape reads as a body.
      // View-facing rim: directions in the plane perpendicular to the line of sight, so the outline hugs the shape from this angle.
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const right = [cy, 0, -sy], up = [-sy * sp, cp, -cy * sp];
      c.beginPath(); for (let k = 0; k <= 96; k++) { const a = Math.PI * 2 * k / 96; const d = norm([right[0] * Math.cos(a) + up[0] * Math.sin(a), right[1] * Math.cos(a) + up[1] * Math.sin(a), right[2] * Math.cos(a) + up[2] * Math.sin(a)]); const p = project(shell(d)); if (k === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); } c.closePath();
      // The body: a translucent fill so the membrane reads as a form, then the rim.
      const ctr = project([0, 0, 0]); const body = c.createRadialGradient(ctr.x, ctr.y - 10, 10, ctr.x, ctr.y, ctr.base * 1.05); body.addColorStop(0, 'rgba(120,160,230,0.12)'); body.addColorStop(0.7, 'rgba(90,130,210,0.06)'); body.addColorStop(1, 'rgba(120,170,255,0.10)');
      c.fillStyle = body; c.fill(); c.strokeStyle = 'rgba(190,215,250,0.4)'; c.lineWidth = 1.5; c.stroke();
      // The midline.
      c.beginPath(); for (let k = 0; k <= 48; k++) { const a = Math.PI * k / 48; const p = project(shell([Math.cos(a), Math.sin(a), 0])); if (k === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y); } c.strokeStyle = 'rgba(190,210,245,0.22)'; c.lineWidth = 1; c.stroke();
      // Cortex glows: a soft field at each anchor, brighter when focused or hovered.
      for (const key of Object.keys(CORTEX)) {
        const C = CORTEX[key]; const d = norm(C.dir); const a = project(inside(d, 1 - C.depth * 0.6));
        const facing = key === 'discovery' ? 0.9 : clamp((a.z + 0.55) / 1.1, 0.25, 1);
        const rad = (C.spread * 1.9 + (key === 'discovery' ? 0.1 : 0)) * a.base * a.s * 0.6;
        const hot = st.focus === key; const dimmed = st.focus && !hot;
        const gr = c.createRadialGradient(a.x, a.y, 0, a.x, a.y, rad); gr.addColorStop(0, rgba(C.hex, (hot ? 0.42 : 0.26) * facing * (dimmed ? 0.35 : 1))); gr.addColorStop(0.55, rgba(C.hex, (hot ? 0.16 : 0.08) * facing * (dimmed ? 0.35 : 1))); gr.addColorStop(1, rgba(C.hex, 0));
        c.fillStyle = gr; c.beginPath(); c.arc(a.x, a.y, rad, 0, Math.PI * 2); c.fill();
      }
    }
    function drawLabelsForCortices() {
      if (!st.labels) return;
      const c = ctx;
      for (const key of Object.keys(CORTEX)) {
        const C = CORTEX[key]; const d = norm(C.dir); const a = project(inside(d, key === 'discovery' ? 0.1 : 1.06));
        const facing = key === 'discovery' ? 0.85 : clamp((a.z + 0.5) / 1.0, 0.2, 1);
        if (facing < 0.28) continue;
        c.font = '600 10.5px ' + font(); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = rgba(C.hex, 0.95 * facing); c.fillText(C.label.toUpperCase(), a.x, a.y);
        if (st.focus === key) { c.font = '500 10px ' + font(); c.fillStyle = 'rgba(200,214,235,' + (0.85 * facing).toFixed(2) + ')'; c.fillText(C.what, a.x, a.y + 13); }
      }
      // The membrane label: the organization, the governed boundary.
      c.font = '600 10.5px ' + font(); c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = 'rgba(200,214,235,0.75)'; c.fillText((org.name || 'Your organization').toUpperCase(), 14, 14);
      c.font = '500 10px ' + font(); c.fillStyle = 'rgba(160,178,205,0.75)'; c.fillText('governed boundary', 14, 28);
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
      c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      drawStage(); drawMembrane();
      const t = st.t; const ts = performance.now();
      const shown = nodes.filter(n => visible(n, t));
      const P = shown.map(n => {
        const K = KIND[n.kind]; const C = CORTEX[K.cortex]; const p = project(positionAt(n, t)); const w = weightAt(n, t);
        let dim = 1;
        if (st.query) dim = n.label.toLowerCase().includes(st.query) ? 1 : 0.12;
        else if (st.focus) dim = K.cortex === st.focus ? 1 : 0.22;
        else if (st.emerging) dim = emerging(n, t) ? 1 : 0.16;
        const depth = clamp((p.z + 1) / 2, 0.15, 1);
        const r = (2.6 + 8.5 * w) * (0.72 + 0.28 * p.s) * Math.min(1.35, st.zoom) * (n.kind === 'intent' ? 0.7 : 1);
        return { n, p, w, dim, r, depth, hex: C.hex };
      });
      const pi = {}; P.forEach(x => { pi[x.n.id] = x; });
      // Space boundaries in Memory: a soft ring around each Space's threads.
      for (const s of spaces) {
        const members = P.filter(x => x.n.kind === 'thread' && x.n.spaceId === s.id); if (!members.length) continue;
        const cx = members.reduce((a, x) => a + x.p.x, 0) / members.length, cy = members.reduce((a, x) => a + x.p.y, 0) / members.length;
        const rr = Math.max(22, members.reduce((a, x) => Math.max(a, Math.hypot(x.p.x - cx, x.p.y - cy)), 0) + 16);
        const hue = s.color || CORTEX.memory.hex; const dim = st.focus && st.focus !== 'memory' ? 0.3 : 1;
        c.strokeStyle = rgba(hue, 0.35 * dim); c.lineWidth = 1; c.setLineDash([3, 4]); c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
        c.fillStyle = rgba(hue, 0.06 * dim); c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.fill();
        if (st.labels) { c.font = '600 9.5px ' + font(); c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillStyle = rgba(hue, 0.9 * dim); c.fillText(String(s.name || 'Space').toUpperCase().slice(0, 24), cx, cy - rr - 3); }
      }
      // Pathways.
      c.lineCap = 'round';
      for (const e of edges) {
        const a = pi[e.a], b = pi[e.b]; if (!a || !b) continue;
        if (e.at && e.at > t) continue;
        const depth = clamp(((a.p.z + b.p.z) / 2 + 1) / 2, 0.15, 1); const dim = Math.min(a.dim, b.dim);
        const hot = st.hover === a.n.id || st.hover === b.n.id || st.selected === a.n.id || st.selected === b.n.id;
        const w = clamp(e.weight || 0.3, 0.05, 1);
        const young = born[e.b] || born[e.a]; const grow = young ? clamp((ts - young) / 1400, 0, 1) : 1;
        c.strokeStyle = hot ? rgba(a.hex, 0.9 * dim) : mixA(a.hex, b.hex, 0.5, (0.14 + 0.38 * w) * depth * dim);
        c.lineWidth = (0.5 + 1.8 * w) * (hot ? 1.4 : 1);
        c.beginPath(); c.moveTo(a.p.x, a.p.y); c.lineTo(lerp(a.p.x, b.p.x, grow), lerp(a.p.y, b.p.y, grow)); c.stroke();
      }
      // Nodes, back to front.
      P.sort((a, b) => a.p.z - b.p.z);
      const boxes = [];
      for (const x of P) {
        const hot = st.hover === x.n.id || st.selected === x.n.id;
        const em = st.emerging && emerging(x.n, t);
        const age = born[x.n.id] ? (ts - born[x.n.id]) / 3000 : 2;
        const al = (0.62 + 0.38 * x.depth) * x.dim;
        // Glow: two soft disks, wider for hot, emerging and newborn nodes.
        const glow = x.r * (hot ? 3.2 : em ? 2.6 : 2.0) * (age < 1 ? 1 + (1 - age) * 1.5 : 1);
        const gr = c.createRadialGradient(x.p.x, x.p.y, x.r * 0.5, x.p.x, x.p.y, glow); gr.addColorStop(0, rgba(x.hex, (hot ? 0.45 : em ? 0.36 : 0.22) * x.dim)); gr.addColorStop(1, rgba(x.hex, 0));
        c.fillStyle = gr; c.beginPath(); c.arc(x.p.x, x.p.y, glow, 0, Math.PI * 2); c.fill();
        if (age < 1) { c.strokeStyle = rgba(x.hex, (1 - age) * 0.9); c.lineWidth = 1.5; c.beginPath(); c.arc(x.p.x, x.p.y, x.r + 4 + age * 26, 0, Math.PI * 2); c.stroke(); }
        if (em) { const pulse = 0.5 + 0.5 * Math.sin(ts / 600 + hash(x.n.id) % 7); c.strokeStyle = rgba(x.hex, 0.35 * pulse * x.dim); c.lineWidth = 1; c.beginPath(); c.arc(x.p.x, x.p.y, x.r + 3 + 5 * pulse, 0, Math.PI * 2); c.stroke(); }
        shapePath(c, x.n.kind, x.p.x, x.p.y, x.r);
        if (KIND[x.n.kind].shape === 'ring') { c.lineWidth = 2; c.strokeStyle = rgba(x.hex, al); c.stroke(); }
        else { c.fillStyle = mix(x.hex, '#FFFFFF', hot ? 0.35 : 0.12 + 0.18 * x.depth); c.globalAlpha = al; c.fill(); c.globalAlpha = 1; }
        const wantLabel = st.labels && x.dim > 0.5 && (hot || x.w > (x.n.kind === 'thread' ? 0.55 : 0.3) || st.query || (st.emerging && em)) && x.p.z > -0.6 && x.n.kind !== 'intent';
        if (wantLabel) {
          c.font = (hot ? '600 ' : '500 ') + Math.round(11 + 2 * x.depth) + 'px ' + font(); c.textAlign = 'left'; c.textBaseline = 'middle';
          const max = x.n.kind === 'thread' || x.n.kind === 'build' ? 24 : 28; const label = x.n.label.length > max ? x.n.label.slice(0, max - 1) + '…' : x.n.label; const tw = c.measureText(label).width; const lx = x.p.x + x.r + 6, ly = x.p.y;
          const box = [lx - 2, ly - 8, lx + tw + 2, ly + 8];
          if (hot || !boxes.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) {
            boxes.push(box);
            c.lineWidth = 3; c.strokeStyle = 'rgba(10,17,32,0.85)'; c.lineJoin = 'round'; c.strokeText(label, lx, ly);
            c.fillStyle = 'rgba(232,238,248,' + (0.7 + 0.3 * x.depth).toFixed(2) + ')'; c.fillText(label, lx, ly);
          }
        }
      }
      projected = P;
      drawLabelsForCortices();
      if (st.t < now() - 60000) { c.font = '600 11px ' + font(); c.textAlign = 'right'; c.textBaseline = 'top'; c.fillStyle = 'rgba(232,238,248,0.9)'; c.fillText('As of ' + new Date(st.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), st.w - 14, 14); }
      if (st.emerging) { c.font = '600 11px ' + font(); c.textAlign = 'right'; c.textBaseline = 'top'; c.fillStyle = rgba(CORTEX.discovery.hex, 0.95); c.fillText('EMERGING: what is strengthening now', st.w - 14, st.t < now() - 60000 ? 30 : 14); }
    }

    // Animation loop: idle orbit until touched; pulses while something is emerging or newborn; replay while playing.
    let raf = 0, lastFrame = 0, playStart = 0;
    function frame(ts) {
      raf = 0; const dt = lastFrame ? Math.min(50, ts - lastFrame) : 16; lastFrame = ts; let busy = false;
      if (st.idle && Date.now() - st.lastPointer > 2500) { st.yaw += 0.00011 * dt; busy = true; }
      if (st.playing) { const span = Math.max(1, now() - first); const k = clamp((ts - playStart) / 16000, 0, 1); st.t = first + span * k; busy = true; if (k >= 1) { st.playing = false; st.t = now(); if (opts.onTime) opts.onTime(st.t, false); } else if (opts.onTime) opts.onTime(st.t, true); }
      if (st.emerging || Object.values(born).some(b => ts - b < 3200)) busy = true;
      draw();
      if (busy) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    // Pointer: drag orbits, wheel zooms, hover picks, click selects. Touch: one finger orbits, two pinch.
    let drag = null, pinch = null;
    const pick = (x, y) => { let best = null, bd = 1e9; for (const p of projected) { const d = Math.hypot(p.p.x - x, p.p.y - y); if (d < p.r + 7 && d < bd && p.dim > 0.3) { bd = d; best = p.n; } } return best; };
    const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    on(canvas, 'pointerdown', (e) => { st.lastPointer = Date.now(); if (e.pointerType === 'touch' && pinch) return; drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} });
    on(canvas, 'pointermove', (e) => {
      st.lastPointer = Date.now();
      if (drag && drag.id === e.pointerId) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; st.yaw += dx * 0.006; st.pitch = clamp(st.pitch + dy * 0.005, -1.2, 1.2); drag.x = e.clientX; drag.y = e.clientY; draw(); return; }
      const [x, y] = local(e); const n = pick(x, y);
      if ((n && n.id) !== st.hover) { st.hover = n ? n.id : null; canvas.style.cursor = n ? 'pointer' : 'grab'; draw(); }
      if (opts.onHover) opts.onHover(n, x, y);
    });
    const endDrag = (e) => { if (!drag) return; const moved = drag.moved; drag = null; canvas.style.cursor = 'grab'; if (!moved) { const [x, y] = local(e); const n = pick(x, y); st.selected = n ? n.id : null; draw(); if (n && opts.onSelect) opts.onSelect(n); } };
    on(canvas, 'pointerup', endDrag); on(canvas, 'pointercancel', () => { drag = null; });
    on(canvas, 'pointerleave', () => { if (st.hover) { st.hover = null; draw(); } if (opts.onHover) opts.onHover(null); });
    on(canvas, 'wheel', (e) => { e.preventDefault(); st.lastPointer = Date.now(); st.zoom = clamp(st.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.55, 2.8); draw(); }, { passive: false });
    on(canvas, 'touchstart', (e) => { if (e.touches.length === 2) { drag = null; pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), z: st.zoom }; } }, { passive: true });
    on(canvas, 'touchmove', (e) => { if (pinch && e.touches.length === 2) { e.preventDefault(); const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); st.zoom = clamp(pinch.z * d / pinch.d, 0.55, 2.8); draw(); } }, { passive: false });
    on(canvas, 'touchend', () => { pinch = null; }, { passive: true });
    on(canvas, 'keydown', (e) => { const step = 0.12; if (e.key === 'ArrowLeft') st.yaw -= step; else if (e.key === 'ArrowRight') st.yaw += step; else if (e.key === 'ArrowUp') st.pitch = clamp(st.pitch - step, -1.2, 1.2); else if (e.key === 'ArrowDown') st.pitch = clamp(st.pitch + step, -1.2, 1.2); else if (e.key === '+' || e.key === '=') st.zoom = clamp(st.zoom * 1.1, 0.55, 2.8); else if (e.key === '-') st.zoom = clamp(st.zoom / 1.1, 0.55, 2.8); else return; e.preventDefault(); st.lastPointer = Date.now(); draw(); });
    canvas.tabIndex = 0; canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none';
    const ro = window.ResizeObserver ? new ResizeObserver(() => size()) : null; if (ro) ro.observe(container); else on(window, 'resize', size);
    size(); kick();

    return {
      /** A fresh model (after learning): new nodes are born on screen and their pathways draw in. */
      update: (m) => { load(m, true); draw(); kick(); },
      setTime: (t) => { st.playing = false; st.t = clamp(t, first, now()); draw(); kick(); },
      play: () => { st.playing = true; playStart = performance.now(); st.t = first; kick(); },
      stop: () => { st.playing = false; st.t = now(); draw(); if (opts.onTime) opts.onTime(st.t, false); },
      playing: () => st.playing,
      range: () => ({ first, now: now() }),
      setQuery: (q) => { st.query = String(q || '').trim().toLowerCase(); draw(); },
      toggleCortex: (k) => { if (st.cortices.has(k)) st.cortices.delete(k); else st.cortices.add(k); draw(); return st.cortices.has(k); },
      setLabels: (b) => { st.labels = !!b; draw(); },
      setEmerging: (b) => { st.emerging = !!b; draw(); kick(); return st.emerging; },
      focus: (k) => { st.focus = k && CORTEX[k] ? k : null; draw(); },
      select: (id) => { st.selected = id || null; draw(); },
      resetView: () => { st.yaw = -0.62; st.pitch = 0.2; st.zoom = 1; st.idle = true; st.lastPointer = 0; draw(); kick(); },
      cortexOf: (n) => KIND[n.kind] ? KIND[n.kind].cortex : null,
      settled: (n) => settledAt(n, st.t),
      emerging: (n) => emerging(n, st.t),
      counts: () => { const out = {}; for (const n of nodes) { const k = KIND[n.kind].cortex; out[k] = (out[k] || 0) + 1; } return out; },
      nodes: () => nodes,
      CORTEX, KIND,
      destroy: () => { listeners.forEach(f => f()); if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); canvas.remove(); },
    };
  }
  window.RicorsaGraph3D = { mount, CORTEX, KIND };
})();
