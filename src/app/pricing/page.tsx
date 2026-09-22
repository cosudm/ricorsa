import '../globals.css'; // site styles load only on these pages; the app under /app has its own
import type { Metadata } from 'next';
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { PayPalSubscribe } from '@/components/PayPalSubscribe';
import { viewer } from '@/lib/viewer';
import { PLANS, OFFERED_PLANS, TRIAL_DAYS, paypalPlanId, normalizePlanKey, type PlanKey } from '@/lib/plans';
import { paypalProvisioned } from '@/lib/paypal-setup';
import { currentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Pricing' };
export const dynamic = 'force-dynamic';

/**
 * Three plans, each starting with a free trial through PayPal: the person approves the subscription, nothing is
 * charged until the trial ends, then the plan bills monthly. An account with no subscription is not a plan on
 * offer, so it is not a card here; it simply has the limits of the free state until a trial starts.
 */
export default async function Pricing() {
  const v = await viewer();
  let current: PlanKey = 'free'; let status: string | null = null; let userId = '';
  if (v) { try { const u = await currentUser(); current = normalizePlanKey(u.plan); status = u.subscriptionStatus; userId = u.id; } catch {} }
  const clientId = process.env.PAYPAL_CLIENT_ID || ''; // read at request time; the id is public by nature (it renders the buttons)
  let provisioned: Awaited<ReturnType<typeof paypalProvisioned>> = null;
  if (clientId && v) { try { provisioned = await paypalProvisioned(); } catch (e) { console.error('PayPal provisioning failed', e); } }
  const signup = '/auth/login?screen_hint=signup&returnTo=/pricing';
  return (
    <>
      <SiteNav signedIn={!!v} />
      <main className="wrap">
        <section className="section" style={{ borderTop: 0, paddingTop: 40 }}>
          <h2>Pricing</h2>
          <p className="sub">Every plan starts with a {TRIAL_DAYS}-day free trial. Pick one, approve it in PayPal, and nothing is charged until the trial ends; cancel any time before then and you pay nothing. Prices are per month, in US dollars. Need a deployment on your own data and geography? <a href="mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise">Talk to us</a>.</p>
          {current !== 'free' && <div className="notice good" style={{ marginBottom: 18 }}>You are on the {PLANS[current].name} plan{status ? ` (${status.toLowerCase()})` : ''}. Manage it on your <a href="/account">Account page</a>.</div>}
          <div className="plans">
            {OFFERED_PLANS.map(key => PLANS[key]).map(p => {
              const pid = paypalPlanId(p.key, provisioned);
              const isCurrent = current === p.key;
              return (
                <div key={p.key} className={'plan' + (p.key === 'professional' ? ' hot' : '')}>
                  <div className="name">{p.name}{p.key === 'professional' && <span className="tag">Most popular</span>}{isCurrent && <span className="tag" style={{ background: '#E6F3EA', color: 'var(--good)' }}>Current</span>}</div>
                  <div className="price">${p.priceUsd}<small>/ month</small>{p.priceMarker && <sup className="mark" title={p.licensing}>{p.priceMarker}</sup>}</div>
                  <div className="trial">{TRIAL_DAYS}-day free trial, then ${p.priceUsd} a month</div>
                  <p className="blurb">{p.blurb}</p>
                  <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
                  <div className="buy">
                    {!v ? (
                      <a className="btn primary" href={signup}>Start free trial</a>
                    ) : isCurrent ? (
                      <a className="btn" href="/account">Manage on Account</a>
                    ) : !pid || !clientId ? (
                      <div className="notice">Checkout is being set up. Please check back in a moment.</div>
                    ) : (
                      <PayPalSubscribe planId={pid} planKey={p.key} planName={p.name} clientId={clientId} userId={userId} trialDays={TRIAL_DAYS} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {OFFERED_PLANS.map(key => PLANS[key]).filter(p => p.priceMarker && p.licensing).map(p => (
            <p key={p.key} className="note licensing" style={{ marginTop: 18 }}><b>{p.priceMarker}</b> {(p.licensing || '').replace(/\s*Call for pricing\.?$/, '')} <a href="mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise%20licensing">Call for pricing</a>.</p>
          ))}
          <p className="note" style={{ marginTop: 10 }}>Limits reset daily at midnight UTC and monthly on the first. Research reports and the Reasoning model cost more to run, which is why they are counted separately. Taxes may be added at checkout where PayPal collects them.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
