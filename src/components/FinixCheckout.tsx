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

/** What the card pays for: a plan (with its trial) or a block of Pay-As-You-Go gas. */
export type CardPurpose =
  | { kind: 'subscribe'; planKey: string; planName: string; priceUsd: number; trialDays: number; replaces?: string | null }
  | { kind: 'gas'; blocks: number; usd: number; gas: number };

export type FinixCheckoutProps = {
  env: 'live' | 'sandbox'; applicationId: string;
  purpose: CardPurpose;
  /** Where to send the person afterwards. */
  afterHref?: string;
  /** The label on the button that opens the card form. */
  openLabel?: string;
  /** Open with the card fields showing, no button in front. */
  openAtStart?: boolean;
};

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const gasWord = (n: number) => `${n.toLocaleString('en-US')} gas`;

/**
 * Card checkout on the page itself. The card fields are Finix's own (served from js.finix.com inside iframes), so the
 * number never touches ricorsa.com; what comes back is a one-use token that our server turns into a saved card and a
 * subscription or a one-time gas payment. The form opens behind one button so a pricing card stays a pricing card.
 */
export function FinixCheckout({ env, applicationId, purpose, afterHref = '/app', openLabel, openAtStart = false }: FinixCheckoutProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const holder = `finix-form-${id}`;
  const formRef = useRef<FinixForm | null>(null);
  const purposeRef = useRef(purpose); purposeRef.current = purpose;
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
        submitLabel: submitLabelFor(purposeRef.current),
        styles: { default: { fontFamily: 'inherit', fontSize: '15px', borderRadius: '10px', padding: '10px 12px' } },
        onLoad: () => { if (!gone) setState('ready'); },
        onSubmit: async (err: unknown, res: { data?: { id?: string } } | undefined) => {
          if (gone) return;
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
    setState('paying'); setMsg(p.kind === 'subscribe' ? 'Checking your card' : 'Charging your card');
    const url = p.kind === 'subscribe' ? '/api/billing/finix/subscribe' : '/api/billing/finix/gas';
    const body = p.kind === 'subscribe' ? { token, plan: p.planKey } : { token, blocks: p.blocks };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.ok) {
      setState('done');
      if (p.kind === 'subscribe') {
        const name = String(out.planName || p.planName);
        const days = Number(out.trialDays || 0);
        setMsg(out.trial && days > 0 ? `Your ${name} trial has started; nothing is charged for ${days} days. Opening Ricorsa.` : `Your ${name} plan is active. Opening Ricorsa.`);
      } else if (out.pending) {
        setMsg(String(out.message || 'The payment is being confirmed; the gas lands on your account as soon as it clears.'));
      } else {
        setMsg(`${gasWord(Number(out.gas) || p.gas)} added to your account${typeof out.remaining === 'number' ? `: ${gasWord(out.remaining as number)} to spend` : ''}. Opening Ricorsa.`);
      }
      if (!out.pending) setTimeout(() => { location.href = afterHref; }, 1400);
    } else {
      setState('ready');
      setMsg(String(out.error || 'The card was not accepted. Check the details or try another card.'));
    }
  };

  const label = openLabel || (purpose.kind === 'subscribe' ? (purpose.trialDays > 0 ? 'Start free trial with a card' : 'Subscribe with a card') : `Pay ${money(purpose.usd)} by card`);
  return (
    <div className="card-checkout">
      {!open && <button type="button" className="btn primary" onClick={() => setOpen(true)}>{label}</button>}
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

function submitLabelFor(p: CardPurpose): string {
  // The gas amount can change after the form is up (the picker beside it), so its button stays generic and the line under the form carries the figure.
  if (p.kind === 'gas') return 'Pay by card';
  return p.trialDays > 0 ? `Start ${p.trialDays}-day free trial` : `Subscribe for ${money(p.priceUsd)} a month`;
}
function terms(p: CardPurpose): string {
  if (p.kind === 'gas') return `One payment of ${money(p.usd)} for ${gasWord(p.gas)}, nothing recurring. The gas is on your account as soon as the payment clears, usually at once. Your card details go to our card processor and never touch Ricorsa.`;
  const bill = p.trialDays > 0
    ? `Your card is checked now and nothing is charged for ${p.trialDays} days; then ${p.planName} is billed ${money(p.priceUsd)} a month.`
    : `${p.planName} is billed ${money(p.priceUsd)} a month, starting today.`;
  return `${bill} Cancel any time from your Account page.${p.replaces ? ` Your current ${p.replaces} subscription is canceled when this one starts; the unused part of its period is not refunded.` : ''} Your card details go to our card processor and never touch Ricorsa.`;
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
