'use client';
import { useState } from 'react';

export function CancelButton({ hasSubscription }: { hasSubscription: boolean }) {
  const [busy, setBusy] = useState(false); const [armed, setArmed] = useState(false); const [msg, setMsg] = useState('');
  if (!hasSubscription) return null;
  const go = async () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    setBusy(true);
    const res = await fetch('/api/billing/paypal/cancel', { method: 'POST' }); const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setMsg('Subscription cancelled. You are on the Free plan.'); setTimeout(() => location.reload(), 1200); } else setMsg(body.error || 'Could not cancel. Try from your PayPal account.');
  };
  return (<div><button className="btn danger" disabled={busy} onClick={go}>{busy ? 'Cancelling' : armed ? 'Click again to confirm' : 'Cancel subscription'}</button>{msg && <div className="notice info" style={{ marginTop: 8 }}>{msg}</div>}</div>);
}

export function DeleteAccountButton() {
  const [busy, setBusy] = useState(false); const [armed, setArmed] = useState(false); const [msg, setMsg] = useState('');
  const go = async () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    setBusy(true);
    const res = await fetch('/api/account/delete', { method: 'POST' }); const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { location.href = body.next || '/auth/logout'; } else setMsg(body.error || 'Could not delete the account right now.');
  };
  return (<div><button className="btn danger" disabled={busy} onClick={go}>{busy ? 'Deleting' : armed ? 'Click again to delete everything' : 'Delete my account'}</button>{msg && <div className="notice" style={{ marginTop: 8 }}>{msg}</div>}</div>);
}
