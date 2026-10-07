'use client';
import { useMemo, useState } from 'react';
import { FinixCheckout, type RechargeResult } from './FinixCheckout';
import { PayPalBuyGas } from './PayPalBuyGas';

export type RechargeTile = { usd: number; label: string; recommended?: boolean };
export type CardCheckout = { env: 'live' | 'sandbox'; applicationId: string } | null;

export type RechargeBlockProps = {
  signedIn: boolean; admin: boolean;
  tiles: RechargeTile[]; gasPerUsd: number; minUsd: number; maxUsd: number;
  /** The card processor, when card payments are set up. */
  finix: CardCheckout;
  /** PayPal's client id, empty when PayPal is not set up. */
  clientId: string;
  /** The card already on file, if any: a recharge is then one click. */
  card: { brand: string | null; lastFour: string | null } | null;
  /** Whether the person agreed to the Recharge Agreement before, and whether auto-recharge is on. */
  agreed: boolean; autoOn: boolean; thresholdGas: number;
  signupHref: string;
};

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const gasWord = (n: number) => `${n.toLocaleString('en-US')} gas`;

/**
 * The Recharge page's working part: pick an amount (a tile or a custom figure), agree to the Recharge Agreement, say
 * whether the card should refill the balance by itself, see the order summary, and pay by card on the page (one
 * click with the card on file, or the card fields for a new one) or through PayPal behind a link. The amount and the
 * account it credits are decided on our server from the token; the browser's word is never trusted for them.
 */
export function RechargeBlock({ signedIn, admin, tiles, gasPerUsd, minUsd, maxUsd, finix, clientId, card, agreed, autoOn, thresholdGas, signupHref }: RechargeBlockProps) {
  const recommended = tiles.find(t => t.recommended) || tiles[0];
  const [picked, setPicked] = useState<number | 'custom'>(recommended?.usd ?? minUsd);
  const [custom, setCustom] = useState<string>('');
  const [agree, setAgree] = useState(agreed);
  const [auto, setAuto] = useState(autoOn);
  const [useNewCard, setUseNewCard] = useState(!card);
  const [paypal, setPaypal] = useState(!finix);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'good' | 'info' | 'bad'; text: string } | null>(null);

  const customUsd = Number(custom.replace(/[^0-9]/g, '')) || 0;
  const usd = picked === 'custom' ? customUsd : picked;
  const valid = Number.isInteger(usd) && usd >= minUsd && usd <= maxUsd;
  const gas = useMemo(() => Math.round(usd * gasPerUsd), [usd, gasPerUsd]);
  const cardReady = !!finix; const paypalReady = !!clientId;
  const reason = !signedIn ? null : !valid ? `Choose an amount between ${money(minUsd)} and ${money(maxUsd)}.` : !agree ? 'Please read and agree to the Recharge Agreement first.' : null;

  const payWithCardOnFile = async () => {
    if (reason) { setMsg({ kind: 'info', text: reason }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/billing/finix/recharge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUsd: usd, agree: true, autoRecharge: auto }) });
      const out = await res.json().catch(() => ({})) as RechargeResult;
      if (res.ok) {
        setMsg({ kind: 'good', text: out.pending ? String(out.message || 'The payment is being confirmed; the gas lands on your account as soon as it clears.') : `${gasWord(Number(out.gas) || gas)} added to your account${typeof out.remaining === 'number' ? `: ${gasWord(out.remaining)} to spend` : ''}. Opening Ricorsa.` });
        if (!out.pending) setTimeout(() => { location.href = '/app'; }, 1400);
      } else setMsg({ kind: 'bad', text: String(out.error || 'The card was not accepted. Try another card.') });
    } catch { setMsg({ kind: 'bad', text: 'Something went wrong on our side. Nothing was charged; please try again.' }); }
    setBusy(false);
  };

  return (
    <div className="recharge">
      <div className="recharge-pick card">
        <h3>Select amount</h3>
        <div className="tiles-grid" role="radiogroup" aria-label="Amount">
          {tiles.map(t => (
            <button key={t.usd} type="button" role="radio" aria-checked={picked === t.usd} className={'tile-amt' + (picked === t.usd ? ' on' : '')} onClick={() => { setPicked(t.usd); setMsg(null); }}>
              {t.recommended && <span className="tile-tag">Recommended</span>}
              <b>{money(t.usd)}</b><span>{t.label}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={picked === 'custom'} className={'tile-amt' + (picked === 'custom' ? ' on' : '')} onClick={() => { setPicked('custom'); setMsg(null); }}>
            <b>Custom</b><span>{money(minUsd)} to {money(maxUsd)}</span>
          </button>
        </div>
        {picked === 'custom' && (
          <label className="custom-amt"><span>Amount in US dollars</span>
            <div className="custom-in"><em>$</em><input id="rechargeCustom" inputMode="numeric" pattern="[0-9]*" placeholder={String(minUsd)} value={custom} onChange={e => setCustom(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} aria-invalid={!!custom && !valid} /></div>
            <small>{valid ? `${gasWord(gas)} at ${gasPerUsd} gas per dollar` : `Whole dollars between ${money(minUsd)} and ${money(maxUsd)}`}</small>
          </label>
        )}
        <label className="check"><input id="rechargeAgree" type="checkbox" checked={agree} onChange={e => { setAgree(e.target.checked); setMsg(null); }} /><span>I have read and agree to the <a href="/recharge-agreement" target="_blank" rel="noopener">Recharge Agreement</a></span></label>
        <label className="check"><input id="rechargeAuto" type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /><span>Enable auto-recharge when my balance falls below {gasWord(thresholdGas)}<small>Your card is charged {valid ? money(usd) : 'the amount you choose'} again, at most once a day. Change the threshold, the amount, or turn it off any time on your Account page.</small></span></label>
        <div className="pay">
          {!signedIn ? (
            <a className="btn primary" href={signupHref}>Sign in to recharge</a>
          ) : admin ? (
            <div className="notice info">Admin accounts are not metered, so there is nothing to recharge here.</div>
          ) : !cardReady && !paypalReady ? (
            <div className="notice">Checkout is being set up. Please check back in a moment.</div>
          ) : (
            <>
              {cardReady && finix && card && !useNewCard && (
                <div className="card-checkout">
                  <button type="button" className="btn primary" disabled={busy} onClick={payWithCardOnFile}>{busy ? 'Charging your card' : `Pay ${valid ? money(usd) : ''} with the ${card.brand || 'card'} ending ${card.lastFour || ''}`}</button>
                  <button type="button" className="linkish" onClick={() => setUseNewCard(true)}>Use a different card</button>
                </div>
              )}
              {cardReady && finix && (useNewCard || !card) && (
                <FinixCheckout key={`${usd}-${auto ? 1 : 0}`} env={finix.env} applicationId={finix.applicationId} purpose={{ kind: 'recharge', usd: valid ? usd : minUsd, gas: valid ? gas : Math.round(minUsd * gasPerUsd), autoRecharge: auto }} openLabel={`Pay ${valid ? money(usd) : ''} by card`} disabledReason={reason} />
              )}
              {paypalReady && (
                paypal ? (
                  <div className="alt-pay">
                    {cardReady && <div className="or">or with PayPal</div>}
                    {reason ? <div className="note">{reason}</div> : <PayPalBuyGas clientId={clientId} amountUsd={usd} gas={gas} agree={agree} />}
                  </div>
                ) : (
                  <button type="button" className="linkish" onClick={() => setPaypal(true)}>Pay with PayPal instead</button>
                )
              )}
            </>
          )}
          {msg && <div className={'notice ' + (msg.kind === 'good' ? 'good' : msg.kind === 'info' ? 'info' : '')} role="status" style={{ marginTop: 8 }}>{msg.text}</div>}
        </div>
      </div>
      <aside className="recharge-sum card">
        <h3>Order summary</h3>
        <dl>
          <div><dt>Subtotal</dt><dd>{valid ? money(usd) : '—'}</dd></div>
          <div><dt>Tax</dt><dd>None</dd></div>
          <div className="total"><dt>Total</dt><dd>{valid ? money(usd) : '—'}</dd></div>
          <div className="gets"><dt>You get</dt><dd>{valid ? gasWord(gas) : '—'}</dd></div>
        </dl>
        <p className="note">Gas you buy never expires and is spent after any monthly allowance on the account. Your card details go to our card processor and never touch Ricorsa.</p>
        <p className="note secure">Secure card payment</p>
      </aside>
    </div>
  );
}
