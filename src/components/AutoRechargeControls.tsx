'use client';
import { useState } from 'react';
import { FinixCheckout, type RechargeResult } from './FinixCheckout';

export type CardCheckout = { env: 'live' | 'sandbox'; applicationId: string } | null;
type Card = { brand: string | null; lastFour: string | null } | null;
export type AutoProps = {
  finix: CardCheckout;
  card: Card;
  on: boolean; thresholdGas: number; usd: number; failures: number; off: boolean; agreed: boolean;
  tiles: Array<{ usd: number; label: string }>;
  minUsd: number; maxUsd: number;
};

const money = (n: number) => '$' + n.toLocaleString('en-US');
const gasWord = (n: number) => `${n.toLocaleString('en-US')} gas`;

/**
 * The Account page's billing controls: the card on file (replace it with the card fields), and auto-recharge with its
 * switch, threshold and amount. Every change goes to /api/billing/auto-recharge and is confirmed on the page.
 */
export function AutoRechargeControls({ finix, card: initialCard, on: initialOn, thresholdGas: initialThreshold, usd: initialUsd, failures, off: initialOff, agreed: initialAgreed, tiles, minUsd, maxUsd }: AutoProps) {
  const [card, setCard] = useState<Card>(initialCard);
  const [on, setOn] = useState(initialOn);
  const [off, setOff] = useState(initialOff);
  const [threshold, setThreshold] = useState(initialThreshold);
  const [usd, setUsd] = useState(initialUsd);
  const [agreed, setAgreed] = useState(initialAgreed);
  const [agreeBox, setAgreeBox] = useState(false);
  const [changingCard, setChangingCard] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (patch: { on?: boolean; thresholdGas?: number; usd?: number }) => {
    setBusy(true); setMsg(null);
    try {
      const body: Record<string, unknown> = { ...patch };
      if (patch.on && !agreed) { if (!agreeBox) { setMsg({ kind: 'info', text: 'Tick the Recharge Agreement box to turn auto-recharge on.' }); setBusy(false); return; } body.agree = true; }
      const res = await fetch('/api/billing/auto-recharge', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({})) as { error?: string; on?: boolean; thresholdGas?: number; usd?: number; off?: boolean; agreed?: boolean };
      if (!res.ok) { setMsg({ kind: 'bad', text: out.error || 'Could not save that right now.' }); }
      else { setOn(!!out.on); setOff(!!out.off); if (out.thresholdGas) setThreshold(out.thresholdGas); if (out.usd) setUsd(out.usd); if (out.agreed) setAgreed(true); setMsg({ kind: 'good', text: out.on ? `Auto-recharge is on: ${money(out.usd || usd)} whenever your balance falls below ${gasWord(out.thresholdGas || threshold)}.` : 'Auto-recharge is off.' }); }
    } catch { setMsg({ kind: 'bad', text: 'Could not save that right now.' }); }
    setBusy(false);
  };
  const onCardSaved = (r: RechargeResult) => { if (r.ok && r.card) { setCard(r.card); setChangingCard(false); setOff(false); setMsg({ kind: 'good', text: `Card saved: ${r.card.brand || 'card'} ending ${r.card.lastFour || ''}.${off ? ' You can turn auto-recharge back on.' : ''}` }); } };
  const amounts = tiles.map(t => t.usd).filter(u => u >= minUsd && u <= maxUsd);
  if (!amounts.includes(usd)) amounts.push(usd);
  amounts.sort((a, b) => a - b);

  return (
    <div className="auto-recharge">
      <div className="row">
        <div className="l"><b>Card on file</b><small>{card ? `${card.brand || 'Card'} ending ${card.lastFour || ''}` : 'None yet. Your first recharge keeps its card here.'}</small></div>
        {finix && !changingCard && <button type="button" className="btn sm" onClick={() => setChangingCard(true)}>{card ? 'Update card' : 'Add a card'}</button>}
      </div>
      {finix && changingCard && (
        <div style={{ margin: '8px 0 4px' }}>
          <FinixCheckout env={finix.env} applicationId={finix.applicationId} purpose={{ kind: 'card' }} openAtStart afterHref={null} onDone={onCardSaved} />
          <button type="button" className="linkish" onClick={() => setChangingCard(false)}>Keep the current card</button>
        </div>
      )}
      <div className="row">
        <div className="l"><b>Auto-recharge</b><small>{on ? `On: ${money(usd)} whenever your balance falls below ${gasWord(threshold)}, at most once a day.` : off ? `Off after ${failures} failed charges. Update the card above, then turn it back on.` : 'Off. When it is on, your card tops the balance up by itself so a build is never interrupted.'}</small></div>
        <button type="button" className={'btn sm' + (on ? '' : ' primary')} disabled={busy || (!card && !on)} onClick={() => save({ on: !on })} title={!card && !on ? 'Add a card first' : ''}>{on ? 'Turn off' : 'Turn on'}</button>
      </div>
      {!agreed && !on && card && (
        <label className="check" style={{ margin: '4px 0 8px' }}><input type="checkbox" checked={agreeBox} onChange={e => setAgreeBox(e.target.checked)} /><span>I have read and agree to the <a href="/recharge-agreement" target="_blank" rel="noopener">Recharge Agreement</a></span></label>
      )}
      <div className="row two">
        <label className="field"><span>Recharge when below</span>
          <select value={threshold} onChange={e => save({ thresholdGas: Number(e.target.value) })} disabled={busy}>
            {[100, 200, 500, 1000, 2000].map(t => <option key={t} value={t}>{gasWord(t)}</option>)}
            {![100, 200, 500, 1000, 2000].includes(threshold) && <option value={threshold}>{gasWord(threshold)}</option>}
          </select>
        </label>
        <label className="field"><span>Amount to add</span>
          <select value={usd} onChange={e => save({ usd: Number(e.target.value) })} disabled={busy}>
            {amounts.map(a => <option key={a} value={a}>{money(a)}</option>)}
          </select>
        </label>
      </div>
      {msg && <div className={'notice ' + (msg.kind === 'good' ? 'good' : msg.kind === 'info' ? 'info' : '')} role="status" style={{ marginTop: 8 }}>{msg.text}</div>}
    </div>
  );
}
