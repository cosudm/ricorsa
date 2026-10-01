'use client';
import { useEffect, useRef, useState } from 'react';

type Buttons = (opts: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; close?: () => void };
declare global { interface Window { paypalOrders?: { Buttons: Buttons } } }

// The subscription buttons load PayPal's SDK with intent=subscription; a one-time payment needs intent=capture, so this
// component loads the SDK a second time under its own namespace (PayPal's supported way to run both on one page).
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
  /** Dollars per block and gas per block. */
  blockUsd: number; blockGas: number;
  /** How many blocks at most in one purchase. */
  maxBlocks?: number;
  /** Where to send the person afterwards. */
  afterHref?: string;
};

const money = (n: number) => '$' + n.toLocaleString('en-US');
const gasWord = (n: number) => `${n.toLocaleString('en-US')} gas`;

/**
 * Pay-As-You-Go gas: pick how many blocks, approve in PayPal, and the gas is on the account the moment PayPal confirms the
 * capture. The order is created and captured on our server, so the amount and the account it credits are never the browser's word.
 */
export function PayPalBuyGas({ clientId, blockUsd, blockGas, maxBlocks = 10, afterHref = '/app' }: BuyGasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [blocks, setBlocks] = useState(1);
  const blocksRef = useRef(1);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'approving' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  useEffect(() => {
    if (!ref.current) return;
    let closed = false; let instance: { render: (el: HTMLElement) => Promise<void>; close?: () => void } | null = null;
    setState('loading');
    loadSdk(clientId).then(() => {
      if (closed || !window.paypalOrders || !ref.current) return;
      instance = window.paypalOrders.Buttons({
        style: { shape: 'pill', color: 'blue', layout: 'vertical', label: 'pay', height: 44 },
        createOrder: async () => {
          const res = await fetch('/api/billing/paypal/gas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'create', blocks: blocksRef.current }) });
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
            setMsg(`${gasWord(body.gas || blockGas * blocksRef.current)} added to your account${typeof body.remaining === 'number' ? `: ${gasWord(body.remaining)} to spend` : ''}. Opening Ricorsa.`);
            setTimeout(() => { location.href = afterHref; }, 1400);
          } else { setState('error'); setMsg(body.error || 'PayPal approved the payment but we could not confirm it. If you were charged, the gas is credited within a few minutes; contact support if it is not.'); }
        },
        onError: (err: unknown) => { console.error(err); setState('error'); setMsg('PayPal could not complete that. Try again or use a different funding source.'); },
        onCancel: () => { setState('ready'); setMsg(''); },
      });
      instance.render(ref.current).then(() => { if (!closed) setState('ready'); }).catch(() => setState('error'));
    }).catch(() => { setState('error'); setMsg('PayPal did not load. Disable ad blockers for this page and reload.'); });
    return () => { closed = true; try { instance?.close?.(); } catch {} };
  }, [clientId, afterHref, blockGas]);

  const total = blockUsd * blocks;
  return (
    <div className="buy-gas">
      <div className="blocks" role="group" aria-label="How much gas">
        <button type="button" className="btn sm" onClick={() => setBlocks(b => Math.max(1, b - 1))} disabled={blocks <= 1 || state === 'approving'} aria-label="Less">&minus;</button>
        <div className="amount"><b>{gasWord(blockGas * blocks)}</b><span>{money(total)}</span></div>
        <button type="button" className="btn sm" onClick={() => setBlocks(b => Math.min(maxBlocks, b + 1))} disabled={blocks >= maxBlocks || state === 'approving'} aria-label="More">+</button>
      </div>
      <div ref={ref} className="paypal-slot" aria-busy={state === 'loading' || state === 'approving'} />
      {state === 'loading' && <div className="note">Loading PayPal</div>}
      {msg && <div className={'notice ' + (state === 'error' ? '' : state === 'done' ? 'good' : 'info')} style={{ marginTop: 8 }}>{msg}</div>}
      <div className="note" style={{ marginTop: 8 }}>One payment of {money(total)} by PayPal, nothing recurring. The gas is on your account as soon as PayPal confirms it.</div>
    </div>
  );
}
