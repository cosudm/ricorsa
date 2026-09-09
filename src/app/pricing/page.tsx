import type { Metadata } from 'next';
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { PayPalSubscribe } from '@/components/PayPalSubscribe';
import { viewer } from '@/lib/viewer';
import { PLANS, paypalPlanId, type PlanKey } from '@/lib/plans';
import { currentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Pricing' };
export const dynamic = 'force-dynamic';

export default async function Pricing() {
  const v = await viewer();
  let current: PlanKey = 'free'; let status: string | null = null; let userId = '';
  if (v) { try { const u = await currentUser(); current = (u.plan as PlanKey) || 'free'; status = u.subscriptionStatus; userId = u.id; } catch {} }
  const clientId = process.env.PAYPAL_CLIENT_ID || ''; // read at request time; the id is public by nature (it renders the buttons)
  const signup = '/auth/login?screen_hint=signup&returnTo=/pricing';
  return (
    <>
      <SiteNav signedIn={!!v} />
      <main className="wrap">
        <section className="section" style={{ borderTop: 0, paddingTop: 40 }}>
          <h2>Pricing</h2>
          <p className="sub">Start free. Pay through PayPal when you want more room. Prices are per month, in US dollars, and you can cancel any time.</p>
          {current !== 'free' && <div className="notice good" style={{ marginBottom: 18 }}>You are on the {PLANS[current].name} plan{status ? ` (${status.toLowerCase()})` : ''}. Manage it on your <a href="/account">Account page</a>.</div>}
          <div className="plans">
            {Object.values(PLANS).map(p => {
              const pid = p.key === 'free' ? null : paypalPlanId(p.key);
              const isCurrent = current === p.key;
              return (
                <div key={p.key} className={'plan' + (p.key === 'pro' ? ' hot' : '')}>
                  <div className="name">{p.name}{p.key === 'pro' && <span className="tag">Most popular</span>}{isCurrent && <span className="tag" style={{ background: '#E6F3EA', color: 'var(--good)' }}>Current</span>}</div>
                  <div className="price">${p.priceUsd}<small>/ month</small></div>
                  <p className="blurb">{p.blurb}</p>
                  <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
                  <div className="buy">
                    {p.key === 'free' ? (
                      <a className="btn" href={v ? '/app' : signup}>{v ? 'Open Ricorsa' : 'Start free'}</a>
                    ) : !v ? (
                      <a className="btn primary" href={signup}>Sign up to subscribe</a>
                    ) : isCurrent ? (
                      <a className="btn" href="/account">Manage on Account</a>
                    ) : !pid || !clientId ? (
                      <div className="notice">Checkout is not configured yet. Set PAYPAL_PLAN_{p.key.toUpperCase()} and PAYPAL_CLIENT_ID (see README).</div>
                    ) : (
                      <PayPalSubscribe planId={pid} planKey={p.key} clientId={clientId} userId={userId} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="note" style={{ marginTop: 18 }}>Limits reset daily at midnight UTC and monthly on the first. Research reports and the Reasoning model cost more to run, which is why they are counted separately. Taxes may be added at checkout where PayPal collects them.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
