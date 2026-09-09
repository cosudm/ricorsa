'use client';
import { useEffect, useRef, useState } from 'react';

declare global { interface Window { paypal?: { Buttons: (opts: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; close?: () => void } } } }

let sdkPromise: Promise<void> | null = null;
function loadSdk(clientId: string) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    if (window.paypal) return resolve();
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription&components=buttons`;
    s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

/**
 * Renders PayPal's subscription button for one plan. On approval the subscription id goes to
 * our server, which verifies it with PayPal before changing the account.
 */
export function PayPalSubscribe({ planId, planKey, clientId, userId, disabled }: { planId: string; planKey: string; clientId: string; userId: string; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'approving' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (disabled || !ref.current) return;
    let closed = false; let instance: { render: (el: HTMLElement) => Promise<void>; close?: () => void } | null = null;
    setState('loading');
    loadSdk(clientId).then(() => {
      if (closed || !window.paypal || !ref.current) return;
      instance = window.paypal.Buttons({
        style: { shape: 'pill', color: 'blue', layout: 'vertical', label: 'subscribe', height: 44 },
        createSubscription: (_data: unknown, actions: { subscription: { create: (o: Record<string, unknown>) => Promise<string> } }) =>
          actions.subscription.create({ plan_id: planId, custom_id: userId, application_context: { shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW' } }),
        onApprove: async (data: { subscriptionID: string }) => {
          setState('approving'); setMsg('Confirming with PayPal');
          const res = await fetch('/api/billing/paypal/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriptionId: data.subscriptionID }) });
          const body = await res.json().catch(() => ({}));
          if (res.ok) { setState('done'); setMsg(`You are on ${body.plan === 'team' ? 'Team' : 'Pro'}. Opening Ricorsa.`); setTimeout(() => { location.href = '/app'; }, 1200); }
          else { setState('error'); setMsg(body.error || 'PayPal approved the subscription but we could not confirm it. It will be applied automatically within a few minutes.'); }
        },
        onError: (err: unknown) => { console.error(err); setState('error'); setMsg('PayPal could not complete that. Try again or use a different funding source.'); },
        onCancel: () => { setState('ready'); setMsg(''); },
      });
      instance.render(ref.current).then(() => { if (!closed) setState('ready'); }).catch(() => setState('error'));
    }).catch(() => { setState('error'); setMsg('PayPal did not load. Disable ad blockers for this page and reload.'); });
    return () => { closed = true; try { instance?.close?.(); } catch {} };
  }, [planId, clientId, userId, disabled]);

  if (disabled) return null;
  return (
    <div>
      <div ref={ref} className="paypal-slot" aria-busy={state === 'loading' || state === 'approving'} />
      {state === 'loading' && <div className="note">Loading PayPal</div>}
      {msg && <div className={'notice ' + (state === 'error' ? '' : state === 'done' ? 'good' : 'info')} style={{ marginTop: 8 }}>{msg}</div>}
      <div className="note" style={{ marginTop: 8 }}>Billed monthly by PayPal ({planKey === 'team' ? 'Team' : 'Pro'}). Cancel any time from your Account page or your PayPal account.</div>
    </div>
  );
}
