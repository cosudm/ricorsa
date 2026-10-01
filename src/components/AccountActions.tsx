'use client';
import { useState } from 'react';

export function CancelButton({ hasSubscription, provider }: { hasSubscription: boolean; provider?: 'paypal' | 'finix' | null }) {
  const [busy, setBusy] = useState(false); const [armed, setArmed] = useState(false); const [msg, setMsg] = useState('');
  if (!hasSubscription) return null;
  const go = async () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    setBusy(true);
    const res = await fetch('/api/billing/cancel', { method: 'POST' }); const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setMsg('Subscription canceled. You are on the Free plan.'); setTimeout(() => location.reload(), 1200); }
    else setMsg(body.error || (provider === 'paypal' ? 'Could not cancel. Try from your PayPal account.' : 'Could not cancel right now. Please try again in a few minutes.'));
  };
  return (<div><button className="btn danger" disabled={busy} onClick={go}>{busy ? 'Canceling' : armed ? 'Click again to confirm' : 'Cancel subscription'}</button>{msg && <div className="notice info" style={{ marginTop: 8 }}>{msg}</div>}</div>);
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

/** The sites Ricorsa's browser stays signed in to for this account, each with a Sign out that deletes the kept sign-in. */
export function SignedInSites({ sites }: { sites: Array<{ id: string; host: string; label: string | null; savedAt: number; lastUsedAt: number | null }> }) {
  const [list, setList] = useState(sites); const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState('');
  const out = async (id: string) => {
    setBusy(id); setMsg('');
    const res = await fetch('/api/browse/sites/' + encodeURIComponent(id), { method: 'DELETE' });
    setBusy(null);
    if (res.ok) setList(l => l.filter(s => s.id !== id)); else setMsg('Could not sign out of that site right now.');
  };
  if (!list.length) return <p>None yet. When you take over Ricorsa&apos;s browser and sign in to a site, Ricorsa asks whether to keep that sign-in for next time; the sites you say yes to are listed here.</p>;
  const when = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {list.map(s => (
          <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}><b>{s.host}</b><div className="sub" style={{ fontSize: 12.5 }}>Kept {when(s.savedAt)}{s.lastUsedAt ? `, last used ${when(s.lastUsedAt)}` : ''}</div></div>
            <button className="btn" disabled={busy === s.id} onClick={() => out(s.id)}>{busy === s.id ? 'Signing out' : 'Sign out'}</button>
          </li>
        ))}
      </ul>
      {msg && <div className="notice" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
