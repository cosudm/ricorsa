/**
 * The living brain: Ricorsa's identity graph as a 4D interface.
 *
 * Everything the account holds is drawn inside one luminous, brain-shaped body (the organization, the governed
 * boundary), in six cortices that are product layers, not neuroscience labels:
 *   Identity        the people, organizations, tools and places Ricorsa has learned
 *   Memory          conversations and their documents; each Space is a governed sub-boundary around its threads
 *   Knowledge       topics and expertise
 *   Opportunity     goals and the patterns Ricorsa inferred about what the person is trying to do
 *   Action          the apps, agents and tools that were built
 *   Communication   how the person likes things said, and the channels connected
 * The body is anatomical: two cerebral hemispheres with the fissure between them, the temporal lobes under the
 * lateral sulcus, the cerebellum tucked under the occipital lobes, the brainstem. Its surface is drawn as gyri, the
 * folds of the cortex, traced as evenly spaced flow lines that light up by the cortex they lie in, with signals
 * running along them; motes glow under the surface; the identity core sits at the center; footprints (recent
 * conversations, documents, built apps, channels) stream in from the edge into Memory. Connections are pathways:
 * node to node, and node to the conversation that taught it. A thing Ricorsa learns is born beside that conversation
 * and settles into its cortex as it recurs over weeks. Time is the fourth dimension: the scrubber shows the brain as
 * it was, Replay shows it forming, Emerging lights what is strengthening now, and learning that happens while the
 * brain is open is drawn as it happens. Identity Governed Logic is not a region: the boundary and the Space rings
 * are where it shows.
 *
 * Plain canvas, no library, additive light. window.RicorsaGraph3D.mount(container, model, options) returns a
 * controller; the model is assembled by the app from the graph, the threads, the builds and the connectors.
 */
(function () {
  'use strict';
  const DAY = 86400000;
  // Front faces -x, up is +y, the hemispheres sit at +z and -z. Directions are from the center of the body; a cortex
  // shows on both hemispheres. The regions follow the anatomy loosely: planning at the frontal pole, doing along the
  // motor strip, knowing across the parietal lobe, remembering in the temporal lobe, recognizing at the back, and
  // language on the lateral surface.
  const CORTEX = {
    identity: { label: 'Identity', hex: '#F08A3C', dir: [0.72, -0.28, 0.6], spread: 0.42, depth: 0.16, sub: 'People, organizations, tools and places', what: 'Who and what is in your world' },
    memory: { label: 'Memory', hex: '#34D4C0', dir: [-0.18, -0.5, 0.84], spread: 0.5, depth: 0.32, sub: 'Conversations and documents, by Space', what: 'What happened, and where' },
    knowledge: { label: 'Knowledge', hex: '#5AA0FF', dir: [0.5, 0.7, 0.4], spread: 0.56, depth: 0.18, sub: 'Topics and expertise', what: 'What you know' },
    opportunity: { label: 'Opportunity', hex: '#FF6FA0', dir: [-0.9, 0.22, 0.36], spread: 0.4, depth: 0.2, sub: 'Goals, targets and what you are working toward', what: 'What could come next' },
    action: { label: 'Action', hex: '#58D68D', dir: [-0.28, 0.86, 0.36], spread: 0.44, depth: 0.18, sub: 'What you built and ran', what: 'What gets done' },
    communication: { label: 'Communication', hex: '#B08CFF', dir: [0.12, 0.08, 0.98], spread: 0.38, depth: 0.12, sub: 'Style and connected channels', what: 'How you say it, where it flows' },
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
  const mixHex = (h1, h2, t) => { const a = hexRgb(h1), b = hexRgb(h2); return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))]; };

  // ---------- The body: cerebral hemispheres, temporal lobes, cerebellum, brainstem ----------
  // A signed field, negative inside, built from smooth unions of the parts. The unit is half the brain's length.
  const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
  function ell(x, y, z, rx, ry, rz) { const qx = x / rx, qy = y / ry, qz = z / rz; const k0 = Math.sqrt(qx * qx + qy * qy + qz * qz); const ax = qx / rx, ay = qy / ry, az = qz / rz; const k1 = Math.sqrt(ax * ax + ay * ay + az * az) || 1e-6; return k0 * (k0 - 1) / k1; }
  function capsule(x, y, z, a, b, r0, r1) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]; const apx = x - a[0], apy = y - a[1], apz = z - a[2];
    const h = clamp((apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz), 0, 1);
    const dx = apx - abx * h, dy = apy - aby * h, dz = apz - abz * h; return Math.sqrt(dx * dx + dy * dy + dz * dz) - lerp(r0, r1, h);
  }
  const PART = { cerebrum: 0, temporal: 1, cerebellum: 2, stem: 3 };
  function body(x, y, z, want) {
    const az = Math.abs(z);
    const back = clamp(x, 0, 1), front = clamp(-x, 0, 1);
    // Cerebrum: one hemisphere, mirrored. Lower and narrower toward the occipital pole, a little narrower at the frontal pole.
    const hy = (y - 0.10 + 0.05 * back * back) / (1 - 0.16 * back * back);
    const hz = (az - 0.19) / (1 - 0.12 * front * front);
    const cer = ell(x + 0.02, hy, hz, 1.0, 0.60, 0.55);
    // Temporal lobe: reaches forward under the lateral sulcus, its pole a little lower than its back.
    const ty = (y + 0.35) - 0.14 * (x + 0.22);
    const tem = ell(x + 0.22, ty, az - 0.40, 0.62, 0.22, 0.24);
    // Cerebellum, tucked under the occipital lobe, wider than tall.
    const cb = ell(x - 0.55, y + 0.50, z, 0.40, 0.25, 0.46);
    // Brainstem, angled back as it descends, the pons a fuller ring near the top.
    const stm = Math.min(capsule(x, y, z, [0.14, -0.30, 0], [0.30, -0.98, 0], 0.15, 0.10), ell(x - 0.20, y + 0.58, z, 0.17, 0.16, 0.17));
    let f = smin(cer, tem, 0.07); f = smin(f, cb, 0.10); f = smin(f, stm, 0.09);
    if (want) { const m = Math.min(cer, tem, cb, stm); want.part = m === cer ? PART.cerebrum : m === tem ? PART.temporal : m === cb ? PART.cerebellum : PART.stem; }
    return f;
  }
  const CENTER = [-0.02, -0.02, 0];
  /** Surface grooves as a factor on the radius: the fissure between the hemispheres, the lateral sulcus on each side, the groove over the cerebellum. */
  function grooves(p, part) {
    let g = 0;
    if (part === PART.cerebrum && p[1] > -0.15) g += 0.055 * Math.exp(-Math.pow(p[2] / 0.05, 2)) * clamp((p[1] + 0.1) / 0.4, 0, 1);
    if (part === PART.cerebrum || part === PART.temporal) { const sy = -0.12 + 0.22 * (p[0] + 0.25); const lat = clamp((Math.abs(p[2]) - 0.35) / 0.25, 0, 1); g += 0.05 * lat * Math.exp(-Math.pow((p[1] - sy) / 0.045, 2)) * clamp((p[0] + 0.85) / 0.2, 0, 1) * clamp((0.35 - p[0]) / 0.3, 0, 1); }
    if (part === PART.cerebellum) g += 0.03 * Math.exp(-Math.pow(p[2] / 0.05, 2));
    return 1 - g;
  }
  // Direction to radius: from the center, march inward along each direction to the outer surface and bisect the crossing.
  // The body is symmetric, so half the directions are computed and mirrored. Built once, when the module loads.
  const LAT = 128, LON = 256; const RAD = new Float32Array(LAT * LON); const PARTS = new Uint8Array(LAT * LON);
  (function buildLookup() {
    const w = {}; const f = (d, r) => body(CENTER[0] + d[0] * r, CENTER[1] + d[1] * r, CENTER[2] + d[2] * r);
    let prev = 1.0; const step = 0.04;
    for (let la = 0; la < LAT; la++) for (let lo = 0; lo < LON / 2; lo++) {
      const phi = ((la + 0.5) / LAT - 0.5) * Math.PI, th = ((lo + 0.5) / LON - 0.5) * Math.PI * 2;
      const d = [Math.cos(phi) * Math.cos(th), Math.sin(phi), Math.cos(phi) * Math.sin(th)];
      let out = Math.min(1.6, prev + 0.12); while (out < 1.6 && f(d, out) < 0) out += step;
      while (out > 0.05 && f(d, out) > 0) out -= step;
      let a = out, b = out + step; for (let i = 0; i < 9; i++) { const m = (a + b) / 2; if (f(d, m) > 0) b = m; else a = m; }
      const r = (a + b) / 2; const p = [CENTER[0] + d[0] * r, CENTER[1] + d[1] * r, CENTER[2] + d[2] * r]; body(p[0], p[1], p[2], w); prev = r;
      const rr = r * grooves(p, w.part); const i1 = la * LON + lo, i2 = la * LON + (LON - 1 - lo);
      RAD[i1] = rr; PARTS[i1] = w.part; RAD[i2] = rr; PARTS[i2] = w.part;
    }
    const src = Float32Array.from(RAD);
    for (let la = 0; la < LAT; la++) for (let lo = 0; lo < LON; lo++) { let s = 0, n = 0; for (let dl = -1; dl <= 1; dl++) { const l2 = la + dl; if (l2 < 0 || l2 >= LAT) continue; for (let dg = -1; dg <= 1; dg++) { s += src[l2 * LON + ((lo + dg + LON) % LON)]; n++; } } RAD[la * LON + lo] = s / n; }
  })();
  /** Radius of the surface in a unit direction from the center. */
  function radius(d) {
    const laf = (Math.asin(clamp(d[1], -1, 1)) / Math.PI + 0.5) * LAT - 0.5, lof = (Math.atan2(d[2], d[0]) / (Math.PI * 2) + 0.5) * LON - 0.5;
    const la0 = clamp(Math.floor(laf), 0, LAT - 1), la1 = clamp(la0 + 1, 0, LAT - 1), lo0 = ((Math.floor(lof) % LON) + LON) % LON, lo1 = (lo0 + 1) % LON;
    const fa = clamp(laf - Math.floor(laf), 0, 1), fo = lof - Math.floor(lof);
    return (RAD[la0 * LON + lo0] * (1 - fo) + RAD[la0 * LON + lo1] * fo) * (1 - fa) + (RAD[la1 * LON + lo0] * (1 - fo) + RAD[la1 * LON + lo1] * fo) * fa;
  }
  function partOf(d) { const la = clamp(Math.round((Math.asin(clamp(d[1], -1, 1)) / Math.PI + 0.5) * LAT - 0.5), 0, LAT - 1), lo = ((Math.round((Math.atan2(d[2], d[0]) / (Math.PI * 2) + 0.5) * LON - 0.5) % LON) + LON) % LON; return PARTS[la * LON + lo]; }
  const shell = (d) => { const r = radius(d); return [CENTER[0] + d[0] * r, CENTER[1] + d[1] * r, CENTER[2] + d[2] * r]; };
  const inside = (d, k) => { const r = radius(d) * k; return [CENTER[0] + d[0] * r, CENTER[1] + d[1] * r, CENTER[2] + d[2] * r]; };
  const dirOf = (p) => norm([p[0] - CENTER[0], p[1] - CENTER[1], p[2] - CENTER[2]]);
  /** The surface normal, from the radius field. */
  function normalAt(d) {
    const e = 0.01; const p = shell(d);
    const u = norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(d, u);
    const pu = shell(norm([d[0] + u[0] * e, d[1] + u[1] * e, d[2] + u[2] * e])), pv = shell(norm([d[0] + v[0] * e, d[1] + v[1] * e, d[2] + v[2] * e]));
    const n = norm(cross([pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]], [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]]));
    return dot(n, d) < 0 ? [-n[0], -n[1], -n[2]] : n;
  }
  /** The outline of the body as seen along a view direction: for each screen angle, the surface point that reaches farthest. */
  function silhouette(right, up, view, count) {
    const out = [];
    for (let k = 0; k < count; k++) {
      const a = Math.PI * 2 * k / count; const ca = Math.cos(a), sa = Math.sin(a);
      const u = [right[0] * ca + up[0] * sa, right[1] * ca + up[1] * sa, right[2] * ca + up[2] * sa];
      const at = (t) => { const ct = Math.cos(t), s = Math.sin(t); const p = shell([u[0] * ct + view[0] * s, u[1] * ct + view[1] * s, u[2] * ct + view[2] * s]); return { p, e: (p[0] - CENTER[0]) * u[0] + (p[1] - CENTER[1]) * u[1] + (p[2] - CENTER[2]) * u[2] }; };
      let best = at(0), bt = 0;
      for (let ti = -8; ti <= 8; ti++) { if (!ti) continue; const t = ti * 0.1; const r = at(t); if (r.e > best.e) { best = r; bt = t; } }
      for (let ti = -4; ti <= 4; ti++) { if (!ti) continue; const t = bt + ti * 0.02; const r = at(t); if (r.e > best.e) best = r; }   // refine around the coarse best
      out.push(best.p);
    }
    return out;
  }
  /** Which cortex a direction belongs to; the same on both hemispheres. */
  function cortexAt(d) {
    const m = [d[0], d[1], Math.abs(d[2])]; let best = null, bd = -2;
    for (const k of Object.keys(CORTEX)) { const s = dot(m, norm(CORTEX[k].dir)); if (s > bd) { bd = s; best = k; } }
    return best;
  }

  // ---------- Gyri: the folds of the cortex, as evenly spaced flow lines over the surface ----------
  function noise3(x, y, z) { return Math.sin(2.1 * x + 1.3 * y - 0.7 * z + 0.4) + 0.7 * Math.sin(-1.4 * x + 2.6 * y + 1.9 * z + 2.1) + 0.5 * Math.sin(3.3 * x - 1.1 * y + 2.4 * z + 4.0) + 0.35 * Math.sin(1.7 * x + 3.9 * y - 3.1 * z + 1.1); }
  /** The fold direction at a surface point: front to back along the sides, turned by a smooth field; the cerebellum's folia run across; the stem runs down. */
  function fold(p, d, part) {
    const n = normalAt(d);
    const base = part === PART.cerebellum ? [0, 0, 1] : part === PART.stem ? [0, 1, 0] : [1, 0, 0];
    let t = [base[0] - n[0] * dot(base, n), base[1] - n[1] * dot(base, n), base[2] - n[2] * dot(base, n)];
    if (Math.hypot(t[0], t[1], t[2]) < 0.05) t = cross(n, [0, 0, 1]);
    t = norm(t); const b = cross(n, t);
    const ang = (part === PART.cerebellum ? 0.25 : 1.15) * noise3(p[0] * 2.4, p[1] * 2.4, p[2] * 2.4);
    const c = Math.cos(ang), s = Math.sin(ang);
    return [t[0] * c + b[0] * s, t[1] * c + b[1] * s, t[2] * c + b[2] * s];
  }
  /**
   * Evenly spaced flow lines over the surface (Jobard and Lefer): each gyrus is traced until it comes within half a
   * spacing of another; new gyri are seeded one spacing beside finished ones. The big fissures are blockers, so gyri
   * stop at them instead of crossing. Cerebellar folia are finer. Returns short chunks, each with its own normal,
   * so a long fold that wraps around the body can fade with the side it is on.
   */
  function gyri(dsep) {
    const step = dsep / 3, maxLen = 80, minLen = 4; const r = rand(9001);
    const cell = dsep; const grid = new Map(); const key = (p) => Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell) + ',' + Math.floor(p[2] / cell);
    const put = (p, id) => { const k = key(p); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push([p, id]); };
    const near = (p, dist, skipId) => {
      const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell); const d2 = dist * dist;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const a = grid.get((cx + i) + ',' + (cy + j) + ',' + (cz + k)); if (!a) continue; for (const [q, id] of a) { if (id === skipId) continue; const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2]; if (dx * dx + dy * dy + dz * dz < d2) return true; } }
      return false;
    };
    for (let x = -0.98; x <= 0.98; x += step) put(shell(norm([x - CENTER[0], 1.2, 0])), -1);
    for (const s of [-1, 1]) for (let x = -0.85; x <= 0.35; x += step) { const y = -0.12 + 0.22 * (x + 0.25); put(shell(norm([x - CENTER[0], y - CENTER[1], s * 1.4])), -1); }
    const partAt = (p) => partOf(dirOf(p));
    const spacing = (part) => part === PART.cerebellum ? 0.55 : part === PART.stem ? 1.4 : 1;
    const curves = []; let nextId = 0;
    const trace = (p0, sign) => {
      const pts = []; let p = p0; const id = nextId; const part0 = partAt(p0); const sep = dsep * spacing(part0);
      for (let i = 0; i < maxLen; i++) {
        const d = dirOf(p); const part = partAt(p); if (part !== part0 && i > 0) break;
        const f = fold(p, d, part); const on = shell(dirOf([p[0] + f[0] * step * sign, p[1] + f[1] * step * sign, p[2] + f[2] * step * sign]));
        if (i > 0 && near(on, sep * 0.5, id)) break;
        if (pts.length > 6) { const back = pts[pts.length - 6]; if (Math.hypot(on[0] - back[0], on[1] - back[1], on[2] - back[2]) < sep * 0.5) break; }
        pts.push(on); p = on;
      }
      return pts;
    };
    const seeds = []; const randDir = () => { const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [s * Math.cos(t), u, s * Math.sin(t)]; };
    for (let i = 0; i < 40; i++) seeds.push(shell(randDir()));
    let guard = 0;
    while (seeds.length && guard++ < 20000) {
      const s = seeds.shift(); const part = partAt(s); const sep = dsep * spacing(part);
      if (near(s, sep * 0.9, -2)) continue;
      const id = nextId; const fwd = trace(s, 1); const bwd = trace(s, -1);
      const pts = bwd.reverse().concat([s], fwd);
      if (pts.length < minLen) { put(s, -1); continue; }
      nextId++;
      for (const p of pts) put(p, id);
      curves.push({ pts, part });
      for (let i = 1; i < pts.length - 1; i += 2) { const p = pts[i]; const d = dirOf(p); const n = normalAt(d); const t = norm([pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1], pts[i + 1][2] - pts[i - 1][2]]); const b = cross(n, t); for (const sg of [-1, 1]) seeds.push(shell(dirOf([p[0] + b[0] * sep * sg, p[1] + b[1] * sep * sg, p[2] + b[2] * sep * sg]))); }
    }
    // Chunks of at most 12 points, each with the normal and cortex at its middle.
    const chunks = [];
    for (const c of curves) for (let i = 0; i < c.pts.length - 1; i += 11) {
      const pts = c.pts.slice(i, Math.min(c.pts.length, i + 12)); if (pts.length < 2) continue;
      const mid = pts[Math.floor(pts.length / 2)]; const d = dirOf(mid);
      chunks.push({ pts, part: c.part, n: normalAt(d), cortex: cortexAt(d), phase: r() * Math.PI * 2, w: 0.85 + r() * 0.3 });
    }
    return chunks;
  }
  /** The tissue: gyri over the surface and motes just under it, generated once and colored by cortex. */
  function tissue(dsep, moteCount) {
    const r = rand(1234567);
    const randDir = () => { const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [s * Math.cos(t), u, s * Math.sin(t)]; };
    const motes = [];
    for (let i = 0; i < moteCount; i++) { const d = randDir(); const k = 0.7 + Math.pow(r(), 0.5) * 0.28; motes.push({ p: inside(d, k), cortex: cortexAt(d), a: 0.25 + r() * 0.75, s: 0.6 + r() * 1.6, phase: r() * Math.PI * 2, tw: 0.4 + r() * 1.2 }); }
    return { gyri: gyri(dsep), motes };
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

  const VIEW = { yaw: 0.38, pitch: 0.16 };   // the resting view: from the front left, a little above, so the lobes read at a glance

  function mount(container, model, opts) {
    opts = opts || {};
    let nodes = [], edges = [], byId = {}, homes = {}, spaceCenter = {}, spaces = [], org = { name: '' };
    let first = Date.now(); const born = {};
    const canvas = document.createElement('canvas'); canvas.className = 'g3d-canvas'; canvas.setAttribute('role', 'img');
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const now = () => Date.now();
    const small = (container.getBoundingClientRect().width || 800) < 640;
    const T = tissue(small ? 0.095 : 0.078, small ? 350 : 800);
    let lod = 1;   // 1 draws everything, 2 every second mote and no glow pass, 3 every third: chosen from the measured frame time
    const st = { lattice: opts.lattice !== false, density: opts.density || 'std', route: null, yaw: VIEW.yaw, pitch: VIEW.pitch, zoom: 1, sway: 0, t: now(), playing: false, labels: opts.labels !== false, cortices: new Set(Object.keys(CORTEX)), query: '', hover: null, selected: null, highlight: null, highlightAt: 0, focus: null, emerging: false, idle: !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches), lastPointer: 0, w: 0, h: 0, dpr: 1, stars: null, signals: [], nextSignal: 0 };
    let adj = {};   // node id -> Set of neighbor ids, for the highlight (the lit node keeps its neighbors bright)
    const listeners = []; const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push(() => el.removeEventListener(ev, fn, o)); };
    // The tissue is drawn at half resolution on its own layer (soft light does not need every pixel), then composited.
    const layer = document.createElement('canvas'); const lctx = layer.getContext('2d'); const HALF = 0.5;
    // Glow sprites, one per cortex color, drawn with additive blending.
    const sprites = {};
    for (const k of Object.keys(CORTEX)) { const s = document.createElement('canvas'); s.width = s.height = 32; const g = s.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, rgba(CORTEX[k].hex, 0.9)); gr.addColorStop(0.35, rgba(CORTEX[k].hex, 0.35)); gr.addColorStop(1, rgba(CORTEX[k].hex, 0)); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); sprites[k] = s; }
    const white = (() => { const s = document.createElement('canvas'); s.width = s.height = 32; const g = s.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.4, 'rgba(210,225,255,0.35)'); gr.addColorStop(1, 'rgba(200,220,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return s; })();
    // Gyrus colors: the cortex hue lifted toward pale light, so the whole body reads as one tissue with tinted regions.
    const GYRUS = {}; for (const k of Object.keys(CORTEX)) GYRUS[k] = mixHex(CORTEX[k].hex, '#DCE8FF', 0.42);

    function load(m, announce) {
      const prev = new Set(nodes.map(n => n.id));
      nodes = (m.nodes || []).filter(n => KIND[n.kind]).map(n => Object.assign({}, n, { weight: clamp(Number(n.weight) || 0.2, 0.05, 1), count: n.count || 1, firstSeen: n.firstSeen || now(), lastSeen: n.lastSeen || n.firstSeen || now() }));
      byId = {}; nodes.forEach(n => { byId[n.id] = n; });
      edges = (m.edges || []).filter(e => byId[e.a] && byId[e.b] && e.a !== e.b);
      adj = {}; for (const e of edges) { (adj[e.a] = adj[e.a] || new Set()).add(e.b); (adj[e.b] = adj[e.b] || new Set()).add(e.a); }
      if (st.highlight && !byId[st.highlight]) st.highlight = null;
      if (st.selected && !byId[st.selected]) st.selected = null;
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
    /** The camera basis for the current yaw and pitch: screen right, screen up, and the direction toward the viewer. */
    function basis() {
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      return { right: [cy, 0, sy], up: [sy * sp, cp, -cy * sp], view: [-sy * cp, sp, cy * cp] };
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
    /** Signals: points of light that run along front-facing gyri, a few at a time, so the surface is visibly working. */
    function stepSignals(ts, view) {
      st.signals = st.signals.filter(s => ts - s.t0 < s.dur);
      const want = st.density === 'min' ? 3 : st.density === 'max' ? 14 : 8;
      if (st.signals.length < want && ts > st.nextSignal) {
        for (let tries = 0; tries < 12; tries++) { const g = T.gyri[Math.floor(Math.random() * T.gyri.length)]; if (dot(g.n, view) > 0.35 && g.pts.length >= 6 && dimOf(g.cortex) === 1) { st.signals.push({ g, t0: ts, dur: 1100 + Math.random() * 1600, dir: Math.random() < 0.5 ? 1 : -1 }); break; } }
        st.nextSignal = ts + 140 + Math.random() * 260;
      }
    }
    /** The tissue, in additive light: the body, cortex fields, gyri, signals, motes under the surface, the core, the rim. */
    function drawTissue(ts) {
      const B = basis(); const sil = silhouette(B.right, B.up, B.view, 200).map(project);
      // The body: a dark, faintly lit volume the light sits in, so the brain reads as a solid against the stage.
      const core = project(CENTER);
      ctx.beginPath(); sil.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath();
      const bodyGrad = ctx.createRadialGradient(core.x - core.base * 0.15, core.y - core.base * 0.2, core.base * 0.1, core.x, core.y, core.base * 1.05);
      bodyGrad.addColorStop(0, 'rgba(34,58,104,0.92)'); bodyGrad.addColorStop(0.7, 'rgba(22,40,76,0.9)'); bodyGrad.addColorStop(1, 'rgba(16,30,60,0.86)');
      ctx.fillStyle = bodyGrad; ctx.fill();
      const c = lctx; c.setTransform(HALF, 0, 0, HALF, 0, 0); c.clearRect(0, 0, st.w, st.h); c.globalCompositeOperation = 'lighter';
      // Cortex fields: soft light where each layer lives.
      for (const key of Object.keys(CORTEX)) {
        const C = CORTEX[key]; const d = norm(C.dir); const a = project(inside(d, 1 - C.depth * 0.5));
        const facing = clamp((a.z + 0.7) / 1.3, 0.2, 1);
        const rad = C.spread * 1.7 * a.base * a.s * 0.62;
        const gr = c.createRadialGradient(a.x, a.y, 0, a.x, a.y, rad); gr.addColorStop(0, rgba(C.hex, 0.16 * facing * dimOf(key))); gr.addColorStop(0.5, rgba(C.hex, 0.05 * facing * dimOf(key))); gr.addColorStop(1, rgba(C.hex, 0));
        c.fillStyle = gr; c.beginPath(); c.arc(a.x, a.y, rad, 0, Math.PI * 2); c.fill();
      }
      // Gyri: two passes, a soft glow under a fine bright line, faded by how much each fold faces the viewer.
      c.lineCap = 'round'; c.lineJoin = 'round';
      const px = core.base * core.s; const glowPass = lod < 2 && st.density !== 'min';
      const G = T.gyri; const proj = new Array(G.length);
      for (let i = 0; i < G.length; i++) {
        const g = G[i]; const facing = dot(g.n, B.view); if (facing < -0.3) { proj[i] = null; continue; }
        proj[i] = { pts: g.pts.map(project), vis: facing < 0 ? 0.05 * (1 + facing / 0.3) : 0.16 + 0.84 * Math.min(1, facing * 1.25) };
      }
      const strokeAll = (width, alphaScale) => {
        for (let i = 0; i < G.length; i++) {
          const g = G[i], P = proj[i]; if (!P) continue;
          const col = GYRUS[g.cortex]; const pulse = 0.86 + 0.14 * Math.sin(ts / 1700 + g.phase);
          c.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (P.vis * pulse * alphaScale * dimOf(g.cortex)).toFixed(3) + ')';
          c.lineWidth = width * g.w * (g.part === PART.cerebellum ? 0.6 : 1);
          c.beginPath(); c.moveTo(P.pts[0].x, P.pts[0].y); for (let k = 1; k < P.pts.length; k++) c.lineTo(P.pts[k].x, P.pts[k].y); c.stroke();
        }
      };
      if (glowPass) strokeAll(px * 0.046, 0.12);
      strokeAll(Math.max(1.1, px * 0.0075), 0.7);
      // Signals along the gyri.
      stepSignals(ts, B.view);
      for (const s of st.signals) {
        const P = proj[G.indexOf(s.g)]; if (!P) continue;
        const u = clamp((ts - s.t0) / s.dur, 0, 1); const f = (s.dir > 0 ? u : 1 - u) * (P.pts.length - 1); const i0 = Math.floor(f), i1 = Math.min(P.pts.length - 1, i0 + 1), k = f - i0;
        const x = lerp(P.pts[i0].x, P.pts[i1].x, k), y = lerp(P.pts[i0].y, P.pts[i1].y, k); const fade = Math.sin(u * Math.PI);
        const col = GYRUS[s.g.cortex]; c.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (0.9 * fade).toFixed(3) + ')'; c.lineWidth = Math.max(1.6, px * 0.012);
        const last = P.pts.length - 1; const tail = clamp(s.dir > 0 ? i0 - 4 : i1 + 4, 0, last), head = s.dir > 0 ? i0 : i1;   // the trail runs from the tail to the head, then to the light
        c.beginPath(); c.moveTo(P.pts[tail].x, P.pts[tail].y); for (let j = tail; j !== head; j += s.dir) c.lineTo(P.pts[j].x, P.pts[j].y); c.lineTo(P.pts[head].x, P.pts[head].y); c.lineTo(x, y); c.stroke();
        const sz = 5 + 3 * fade; c.globalAlpha = fade; c.drawImage(white, x - sz, y - sz, sz * 2, sz * 2); c.globalAlpha = 1;
      }
      // Motes.
      for (let i = 0; i < T.motes.length; i++) {
        const m = T.motes[i]; if (i % (st.density === 'min' ? Math.max(2, lod) : lod)) continue;
        const p = project(m.p); const depth = clamp((p.z + 1.1) / 2.1, 0.05, 1);
        const tw = 0.7 + 0.3 * Math.sin(ts / (900 * m.tw) + m.phase);
        const sz = (2.2 + 5.5 * m.s) * (0.5 + 0.7 * depth) * p.s * Math.min(1.3, st.zoom);
        c.globalAlpha = m.a * depth * depth * tw * dimOf(m.cortex) * 0.8;
        c.drawImage(sprites[m.cortex], p.x - sz, p.y - sz, sz * 2, sz * 2);
      }
      c.globalAlpha = 1;
      // The identity core: the organization at the center of everything it governs.
      const cr = 0.14 * core.base * core.s;
      const gr = c.createRadialGradient(core.x, core.y, 0, core.x, core.y, cr * 2.4); gr.addColorStop(0, 'rgba(255,236,190,0.55)'); gr.addColorStop(0.25, 'rgba(255,200,120,0.22)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(core.x, core.y, cr * 2.4, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true; ctx.drawImage(layer, 0, 0, layer.width, layer.height, 0, 0, st.w, st.h);
      // The rim: the body's outline from this angle, a soft glow under a fine line.
      ctx.beginPath(); sil.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(120,170,255,0.11)'; ctx.lineWidth = 12; ctx.stroke(); ctx.strokeStyle = 'rgba(205,225,255,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
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
      for (let i = 0; i <= Math.min(pts.length - 1, hop); i++) { const q = pts[i]; c.globalAlpha = 0.7 * fade; c.drawImage(white, q.p.x - q.r * 2.2, q.p.y - q.r * 2.2, q.r * 4.4, q.r * 4.4); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      if (st.labels) {
        c.font = '600 10.5px ' + font(); c.textAlign = 'left'; c.textBaseline = 'top';
        const head = 'DISCOVER · ' + (el >= total ? 'route complete' : 'traversing') + ' · IGL ' + (el >= total ? 'allowed' : 'checking hop ' + (hop + 1) + ' of ' + (pts.length - 1));
        c.fillStyle = 'rgba(255,236,190,' + (0.95 * fade).toFixed(2) + ')'; c.fillText(head, 14, st.h - 40);
        if (R.label) { c.font = '500 11px ' + font(); c.fillStyle = 'rgba(236,241,250,' + (0.9 * fade).toFixed(2) + ')'; c.fillText(R.label.length > 90 ? R.label.slice(0, 89) + '…' : R.label, 14, st.h - 24); }
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
        // A node lit from the lists keeps itself and its neighbors bright and softens everything else.
        if (st.highlight && st.highlight !== n.id) dim *= adj[st.highlight] && adj[st.highlight].has(n.id) ? 0.85 : 0.35;
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
        const hot = st.hover === a.n.id || st.hover === b.n.id || st.selected === a.n.id || st.selected === b.n.id || st.highlight === a.n.id || st.highlight === b.n.id;
        const w = clamp(e.weight || 0.3, 0.05, 1);
        const young = born[e.b] || born[e.a]; const grow = young ? clamp((ts - young) / 1400, 0, 1) : 1;
        c.strokeStyle = hot ? rgba(a.hex, 0.95 * dim) : mixA(a.hex, b.hex, 0.5, (0.16 + 0.42 * w) * depth * dim);
        c.lineWidth = (0.6 + 1.9 * w) * (hot ? 1.5 : 1);
        c.beginPath(); c.moveTo(a.p.x, a.p.y); c.lineTo(lerp(a.p.x, b.p.x, grow), lerp(a.p.y, b.p.y, grow)); c.stroke();
      }
      // Nodes, back to front: glow in light, body solid.
      P.sort((a, b) => a.p.z - b.p.z);
      for (const x of P) {
        const lit = st.highlight === x.n.id; const hot = lit || st.hover === x.n.id || st.selected === x.n.id; const em = st.emerging && emerging(x.n, t);
        const age = born[x.n.id] ? (ts - born[x.n.id]) / 3000 : 2;
        const glow = x.r * (hot ? 4 : em ? 3.2 : 2.4) * (age < 1 ? 1 + (1 - age) * 1.6 : 1);
        c.globalAlpha = (hot ? 0.95 : em ? 0.8 : 0.55) * x.dim * (0.5 + 0.5 * x.depth);
        c.drawImage(sprites[x.cortex], x.p.x - glow, x.p.y - glow, glow * 2, glow * 2);
        if (age < 1) { c.globalAlpha = 1; c.strokeStyle = rgba(x.hex, (1 - age) * 0.9); c.lineWidth = 1.5; c.beginPath(); c.arc(x.p.x, x.p.y, x.r + 4 + age * 28, 0, Math.PI * 2); c.stroke(); }
        if (em) { const pulse = 0.5 + 0.5 * Math.sin(ts / 600 + hash(x.n.id) % 7); c.globalAlpha = 0.4 * pulse * x.dim; c.strokeStyle = rgba(x.hex, 1); c.lineWidth = 1; c.beginPath(); c.arc(x.p.x, x.p.y, x.r + 3 + 5 * pulse, 0, Math.PI * 2); c.stroke(); }
        // The lit node: a ring that leaves it every 1.4 s, so the eye finds it from the list beside the brain.
        if (lit) { const k = ((ts - st.highlightAt) % 1400) / 1400; c.globalAlpha = 1; c.strokeStyle = rgba(x.hex, 0.95 * (1 - k)); c.lineWidth = 2; c.beginPath(); c.arc(x.p.x, x.p.y, x.r + 4 + 26 * k, 0, Math.PI * 2); c.stroke(); c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x.p.x, x.p.y, x.r + 4, 0, Math.PI * 2); c.stroke(); }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      const boxes = [];
      for (const x of P) {
        const hot = st.hover === x.n.id || st.selected === x.n.id || st.highlight === x.n.id; const em = st.emerging && emerging(x.n, t);
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
      if (st.idle && !st.highlight && Date.now() - st.lastPointer > 2500) { st.sway += 0.00020 * dt; st.yaw = VIEW.yaw + 0.24 * Math.sin(st.sway); st.pitch = VIEW.pitch + 0.05 * Math.sin(st.sway * 0.7); }
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
      select: (id) => { st.selected = id && byId[id] ? id : null; kick(); },
      /** Light one node from outside (a chip in the lists, a Discover idea): it pulses, its neighbors stay bright, the rest softens. null clears. */
      highlight: (id) => { const next = id && byId[id] ? id : null; if (next !== st.highlight) st.highlightAt = performance.now(); st.highlight = next; kick(); return !!next; },
      has: (id) => !!byId[id],
      node: (id) => byId[id] || null,
      hovered: () => st.hover,
      selectedId: () => st.selected,
      highlighted: () => st.highlight,
      /** The node's screen position, for anything the page wants to draw beside it. */
      screenPosition: (id) => { const x = projected.find(p => p.n.id === id); return x ? { x: x.p.x, y: x.p.y, r: x.r, visible: x.dim > 0.3 } : null; },
      resetView: () => { st.yaw = VIEW.yaw; st.pitch = VIEW.pitch; st.zoom = 1; st.sway = 0; st.idle = true; st.lastPointer = 0; kick(); },
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
