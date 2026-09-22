'use client';
import { useEffect, useRef, useState } from 'react';
import type { SampleModel } from '@/lib/brain-sample';

type Controller = {
  play: () => void; stop: () => void; playing: () => boolean; setEmerging: (b: boolean) => boolean; resetView: () => void; destroy: () => void;
  range: () => { first: number; now: number }; setTime: (t: number) => void; focus: (k: string | null) => void; CORTEX: Record<string, { label: string; hex: string; sub: string }>;
};
type Graph3D = { mount: (el: HTMLElement, model: SampleModel, opts: Record<string, unknown>) => Controller };
declare global { interface Window { RicorsaGraph3D?: Graph3D } }

/**
 * The living brain on the landing page, running on example data: the same renderer the app uses (graph3d.js), so a
 * visitor watches the real thing. It replays itself once on arrival, then orbits slowly; Replay and Emerging are
 * offered, hovering names a node, and the six cortices can be focused from the legend.
 */
export function LivingBrain({ model }: { model: SampleModel }) {
  const stage = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const ctl = useRef<Controller | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [emerging, setEmerging] = useState(false);
  const [when, setWhen] = useState('Today');
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout> | null = null;
    const mount = () => {
      if (cancelled || !stage.current || !window.RicorsaGraph3D || ctl.current) return;
      const c = window.RicorsaGraph3D.mount(stage.current, model, {
        height: Math.min(560, Math.max(360, Math.round(stage.current.getBoundingClientRect().width * 0.56))),
        onHover: (n: { label: string; kind: string } | null, x: number, y: number) => {
          const t = tip.current; if (!t) return;
          if (!n) { t.style.opacity = '0'; return; }
          const kind = n.kind === 'thread' ? 'Conversation' : n.kind === 'build' ? 'Built app' : n.kind === 'connector' ? 'Connected channel' : n.kind === 'intent' ? 'Pattern' : n.kind[0].toUpperCase() + n.kind.slice(1);
          t.innerHTML = `<b>${n.label.replace(/[<>&]/g, '')}</b>${kind}`; t.style.opacity = '1';
          const w = stage.current ? stage.current.getBoundingClientRect().width : 600; t.style.left = Math.min(w - 240, Math.max(8, x + 14)) + 'px'; t.style.top = Math.max(8, y - 10) + 'px';
        },
        onTime: (t: number, isPlaying: boolean) => { const { now } = c.range(); setWhen(t >= now - 60000 ? 'Today' : new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })); setPlaying(isPlaying); },
      });
      ctl.current = c; setReady(true);
      // Arrive, then watch it form once.
      timer = setTimeout(() => { if (!cancelled && ctl.current && !ctl.current.playing()) ctl.current.play(); }, 900);
    };
    if (window.RicorsaGraph3D) mount();
    else {
      let sc = document.querySelector<HTMLScriptElement>('script[data-graph3d]');
      if (!sc) { sc = document.createElement('script'); sc.src = '/app/assets/graph3d.js'; sc.dataset.graph3d = '1'; document.head.appendChild(sc); }
      sc.addEventListener('load', mount);
    }
    return () => { cancelled = true; if (timer) clearTimeout(timer); if (ctl.current) { ctl.current.destroy(); ctl.current = null; } };
  }, [model]);

  const cortices = ctl.current ? Object.entries(ctl.current.CORTEX) : [];
  return (
    <div className="brain">
      <div className="brain-stage" ref={stage}><div className="brain-tip" ref={tip} /></div>
      <div className="brain-bar">
        <button type="button" className="btn sm" disabled={!ready} onClick={() => { const c = ctl.current; if (!c) return; if (c.playing()) c.stop(); else c.play(); }}>{playing ? 'Stop' : 'Replay'}</button>
        <button type="button" className={'btn sm' + (emerging ? ' on' : '')} disabled={!ready} aria-pressed={emerging} onClick={() => { const c = ctl.current; if (!c) return; setEmerging(c.setEmerging(!emerging)); }}>Emerging</button>
        <span className="brain-when">{when}</span>
        <span className="spacer" />
        <span className="brain-example">Example data. Drag to orbit, scroll to zoom.</span>
      </div>
      {cortices.length > 0 && (
        <div className="brain-legend" role="list">
          {cortices.map(([k, C]) => (
            <button key={k} type="button" role="listitem" className={'brain-cortex' + (focus === k ? ' on' : '')} style={{ ['--rc' as string]: C.hex }}
              onMouseEnter={() => { if (!focus) ctl.current?.focus(k); }} onMouseLeave={() => { if (!focus) ctl.current?.focus(null); }}
              onClick={() => { const next = focus === k ? null : k; setFocus(next); ctl.current?.focus(next); }}>
              <b><i />{C.label}</b><span>{C.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
