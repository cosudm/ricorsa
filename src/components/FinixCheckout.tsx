'use client';
import { useEffect, useId, useRef, useState } from 'react';

type FinixForm = { submit: (cb: (err: unknown, res: { data?: { id?: string } } | undefined) => void) => void };
type FinixGlobal = { PaymentForm: (el: string | HTMLElement, env: 'sandbox' | 'prod', applicationId: string, options: Record<string, unknown>) => FinixForm };
declare global { interface Window { Finix?: FinixGlobal } }

// Finix.js is loaded from js.finix.com and never bundled (its card fields live in iframes it serves, which is what keeps the card number off this site).
const FINIX_JS = 'https://js.finix.com/v/2/finix.js';
let finixPromise: Promise<void> | null = null;
function loadFinix() {
  if (finixPromise) return finixPromise;
  finixPromise = new Promise<void>((resolve, reject) => {
    if (window.Finix) return resolve();
    const s = document.createElement('script');
    s.src = FINIX_JS; s.async = true; s.onload = () => resolve(); s.onerror = () => { finixPromise = null; reject(new Error('card form failed to load')); };
    document.head.appendChild(s);
  });
  return finixPromise;
}

/** What the card is for: a recharge (the amount chosen, with the agreement and the auto-recharge choice) or only saving a new card. */
export type CardPurpose =
  | { kind: 'recharge'; usd: number; gas: number; autoRecharge: boolean }
  | { kind: 'card' };

export type RechargeResult = { ok: boolean; pending?: boolean; gas?: number; usd?: number; balance?: number; remaining?: number | null; card?: { brand: string | null; lastFour: string | null }; message?: string; error?: string };

export type FinixCheckoutProps = {
  env: 'live' | 'sandbox'; applicationId: string;
  purpose: CardPurpose;
  /** Where to send the person afterwards (a recharge); omit to stay on the page and call `onDone`. */
  afterHref?: string | null;
  /** Told when the server has answered (the recharge or the new card). */
  onDone?: (r: RechargeResult) => void;
  /** The label on the button that opens the card form. */
  openLabel?: string;
  /** Open with the card fields showing, no button in front. */
  openAtStart?: boolean;
  /** Whether the person may pay yet (the agreement box); the button explains when not. */
  disabledReason?: string | null;
};

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const gasWord = (n: number) => `${n.toLocaleString('en-US')} gas`;

/**
 * Card fields on the page itself. The fields are Finix's own (served from js.finix.com inside iframes), so the number
 * never touches ricorsa.com; what comes back is a one-use token that our server turns into the card on file and, for
 * a recharge, the payment. The form opens behind one button so the page stays readable until the person is ready.
 */
export function FinixCheckout({ env, applicationId, purpose, afterHref = '/app', onDone, openLabel, openAtStart = false, disabledReason = null }: FinixCheckoutProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const holder = `finix-form-${id}`;
  const formRef = useRef<FinixForm | null>(null);
  const purposeRef = useRef(purpose); purposeRef.current = purpose;
  const disabledRef = useRef(disabledReason); disabledRef.current = disabledReason;
  const [open, setOpen] = useState(openAtStart);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'paying' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    let gone = false;
    setState('loading'); setMsg('');
    loadFinix().then(() => {
      if (gone || !window.Finix || !document.getElementById(holder)) return;
      formRef.current = window.Finix.PaymentForm(holder, env === 'sandbox' ? 'sandbox' : 'prod', applicationId, {
        paymentMethods: ['card'],
        showAddress: false,
        showLabels: true,
        showPlaceholders: true,
        hidePotentialIssueMessages: true,
        submitLabel: purposeRef.current.kind === 'card' ? 'Save card' : 'Pay by card',
        styles: { default: { fontFamily: 'inherit', fontSize: '15px', borderRadius: '10px', padding: '10px 12px' } },
        onLoad: () => { if (!gone) setState('ready'); },
        onSubmit: async (err: unknown, res: { data?: { id?: string } } | undefined) => {
          if (gone) return;
          if (disabledRef.current) { setState('ready'); setMsg(disabledRef.current); return; }
          if (err || !res?.data?.id) { setState('ready'); setMsg(cardMessage(err)); return; }
          await pay(res.data.id);
        },
      });
      // Finix calls onLoad when the fields are up; if it never does, the form still shows, so do not stay on "loading" forever.
      setTimeout(() => { if (!gone) setState(s => (s === 'loading' ? 'ready' : s)); }, 4000);
    }).catch(() => { if (!gone) { setState('error'); setMsg('The card form did not load. Disable ad blockers for this page and reload.'); } });
    return () => { gone = true; formRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, env, applicationId, holder]);

  const pay = async (token: string) => {
    const p = purposeRef.current;
    setState('paying'); setMsg(p.kind === 'card' ? 'Saving your card' : 'Charging your card');
    const url = p.kind === 'card' ? '/api/billing/finix/card' : '/api/billing/finix/recharge';
    const body = p.kind === 'card' ? { token } : { token, amountUsd: p.usd, agree: true, autoRecharge: p.autoRecharge };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({})) as RechargeResult;
    if (res.ok) {
      setState('done');
      if (p.kind === 'card') setMsg(`Card saved${out.card?.lastFour ? `: ${out.card.brand || 'card'} ending ${out.card.lastFour}` : ''}.`);
      else if (out.pending) setMsg(String(out.message || 'The payment is being confirmed; the gas lands on your account as soon as it clears.'));
      else setMsg(`${gasWord(Number(out.gas) || p.gas)} added to your account${typeof out.remaining === 'number' ? `: ${gasWord(out.remaining)} to spend` : ''}.${afterHref ? ' Opening Ricorsa.' : ''}`);
      onDone?.({ ...out, ok: true });
      if (p.kind === 'recharge' && !out.pending && afterHref) setTimeout(() => { location.href = afterHref; }, 1400);
    } else {
      setState('ready');
      setMsg(String(out.error || 'The card was not accepted. Check the details or try another card.'));
      onDone?.({ ...out, ok: false });
    }
  };

  const label = openLabel || (purpose.kind === 'card' ? 'Add a card' : `Pay ${money(purpose.usd)} by card`);
  return (
    <div className="card-checkout">
      {!open && <button type="button" className="btn primary" onClick={() => { if (disabledReason) { setMsg(disabledReason); return; } setOpen(true); }}>{label}</button>}
      {open && (
        <div className="card-form-wrap" aria-busy={state === 'loading' || state === 'paying'}>
          <div id={holder} className="card-form" />
          {state === 'loading' && <div className="note">Loading the card form</div>}
          {state === 'paying' && <div className="note">{msg}</div>}
        </div>
      )}
      {msg && state !== 'paying' && <div className={'notice ' + (state === 'done' ? 'good' : state === 'error' ? '' : 'info')} style={{ marginTop: 8 }} role="status">{msg}</div>}
      {open && state !== 'done' && <div className="note" style={{ marginTop: 8 }}>{terms(purpose)}</div>}
    </div>
  );
}

function terms(p: CardPurpose): string {
  if (p.kind === 'card') return 'The card is saved for your next recharge and, if you turn it on, for auto-recharge. Nothing is charged now. Your card details go to our card processor and never touch Ricorsa.';
  return `One payment of ${money(p.usd)} for ${gasWord(p.gas)}. The gas is on your account as soon as the payment clears, usually at once, and never expires.${p.autoRecharge ? ` Auto-recharge is turned on: this card is charged ${money(p.usd)} again whenever your balance falls below the threshold on your Account page.` : ' Nothing recurring.'} Your card details go to our card processor and never touch Ricorsa.`;
}
/** A plain sentence for a card Finix.js would not tokenize, from its error without its words. */
function cardMessage(err: unknown): string {
  const text = String((err as { message?: string })?.message || (typeof err === 'string' ? err : '') || JSON.stringify(err || '')).toLowerCase();
  if (/number/.test(text)) return 'Check the card number.';
  if (/expir/.test(text)) return 'Check the expiration date.';
  if (/security|cvv|cvc/.test(text)) return 'Check the security code.';
  if (/name/.test(text)) return 'Enter the name as it appears on the card.';
  return 'Check the card details and try again.';
}
