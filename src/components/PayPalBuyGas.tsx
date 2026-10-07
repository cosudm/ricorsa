'use client';
import { useEffect, useRef, useState } from 'react';

type Buttons = (opts: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; close?: () => void };
declare global { interface Window { paypalOrders?: { Buttons: Buttons } } }

// The SDK is loaded with intent=capture under its own namespace (the older subscription buttons wanted intent=subscription; PayPal's supported way to run both on one page).
let sdkPromise: Promise<void> | null = null;
function loadSdk(clientId: string) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    if (window.paypalOrders) return resolve();
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&intent=capture&currency=USD&components=buttons&disable-funding=paylater`;
    s.setAttribute('data-namespace', 'paypalOrders');
    s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export type BuyGasProps = {
  clientId: string;
  /** The recharge amount in whole US dollars, and the gas it buys. */
  amountUsd: number; gas: number;
  /** The person agreed to the Recharge Agreement (recorded with the order). */
  agree?: boolean;
  /** Where to send the person afterwards. */
  afterHref?: string;
};

const money = (n: number) => '$' + n.toLocaleString('en-US');
const gasWord = (n: number) => `${n.toLocaleString('en-US')} gas`;

/**
 * A recharge through PayPal: approve in PayPal and the gas is on the account the moment PayPal confirms the capture.
 * The order is created and captured on our server, so the amount and the account it credits are never the browser's word.
 */
export function PayPalBuyGas({ clientId, amountUsd, gas, agree = true, afterHref = '/app' }: BuyGasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const amountRef = useRef(amountUsd); amountRef.current = amountUsd;
  const agreeRef = useRef(agree); agreeRef.current = agree;
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'approving' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!ref.current) return;
    let closed = false; let instance: { render: (el: HTMLElement) => Promise<void>; close?: () => void } | null = null;
    setState('loading');
    loadSdk(clientId).then(() => {
      if (closed || !window.paypalOrders || !ref.current) return;
      instance = window.paypalOrders.Buttons({
        style: { shape: 'pill', color: 'blue', layout: 'vertical', label: 'pay', height: 44 },
        createOrder: async () => {
          const res = await fetch('/api/billing/paypal/gas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'create', amountUsd: amountRef.current, agree: agreeRef.current ? true : undefined }) });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.orderId) throw new Error(body.error || 'Could not start the payment');
          return body.orderId as string;
        },
        onApprove: async (data: { orderID: string }) => {
          setState('approving'); setMsg('Confirming with PayPal');
          const res = await fetch('/api/billing/paypal/gas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'capture', orderId: data.orderID }) });
          const body = await res.json().catch(() => ({}));
          if (res.ok) {
            setState('done');
            setMsg(`${gasWord(body.gas || gas)} added to your account${typeof body.remaining === 'number' ? `: ${gasWord(body.remaining)} to spend` : ''}. Opening Ricorsa.`);
            setTimeout(() => { location.href = afterHref; }, 1400);
          } else { setState('error'); setMsg(body.error || 'PayPal approved the payment but we could not confirm it. If you were charged, the gas is credited within a few minutes; contact support if it is not.'); }
        },
        onError: (err: unknown) => { console.error(err); setState('error'); setMsg('PayPal could not complete that. Try again or use a different funding source.'); },
        onCancel: () => { setState('ready'); setMsg(''); },
      });
      instance.render(ref.current).then(() => { if (!closed) setState('ready'); }).catch(() => setState('error'));
    }).catch(() => { setState('error'); setMsg('PayPal did not load. Disable ad blockers for this page and reload.'); });
    return () => { closed = true; try { instance?.close?.(); } catch {} };
  }, [clientId, afterHref, gas]);

  return (
    <div className="buy-gas">
      <div ref={ref} className="paypal-slot" aria-busy={state === 'loading' || state === 'approving'} />
      {state === 'loading' && <div className="note">Loading PayPal</div>}
      {msg && <div className={'notice ' + (state === 'error' ? '' : state === 'done' ? 'good' : 'info')} style={{ marginTop: 8 }}>{msg}</div>}
      <div className="note" style={{ marginTop: 8 }}>One payment of {money(amountUsd)} for {gasWord(gas)} by PayPal, nothing recurring. The gas is on your account as soon as PayPal confirms it. Auto-recharge needs a card, so it is not offered with PayPal.</div>
    </div>
  );
}
