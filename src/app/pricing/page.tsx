import '../globals.css'; // site styles load only on these pages; the app under /app has its own
import type { Metadata } from 'next';
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { PricingPlans, type PlanCard, type Cycle } from '@/components/PricingPlans';
import { viewer } from '@/lib/viewer';
import { PLANS, OFFERED_PLANS, TRIAL_DAYS, ANNUAL_MONTHS_FREE, paypalPlanId, normalizePlanKey, monthlyEquivalent, annualSaving, usd, type PlanKey } from '@/lib/plans';
import { paypalProvisioned } from '@/lib/paypal-setup';
import { currentUser } from '@/lib/session';
import { trialEligible } from '@/lib/billing';

export const metadata: Metadata = { title: 'Pricing' };
export const dynamic = 'force-dynamic';

/**
 * Three plans, billed yearly (the default: ten months' price for twelve, two months free) or monthly, with the same
 * features either way. A first subscription starts with a free trial through PayPal: the person approves it, nothing
 * is charged until the trial ends, then the plan bills on its cycle. An account with no subscription is not a plan
 * on offer, so it is not a card here; it simply has the limits of the free state until a subscription starts.
 */
export default async function Pricing({ searchParams }: { searchParams: Promise<{ cycle?: string | string[] }> }) {
  const v = await viewer();
  const sp = await searchParams;
  const initialCycle: Cycle = (Array.isArray(sp.cycle) ? sp.cycle[0] : sp.cycle) === 'monthly' ? 'monthly' : 'annual';
  let current: PlanKey = 'free'; let currentCycle: Cycle | null = null; let status: string | null = null; let userId = ''; let hasSubscription = false; let trial = true;
  if (v) {
    try {
      const u = await currentUser();
      current = normalizePlanKey(u.plan); status = u.subscriptionStatus; userId = u.id; hasSubscription = !!u.paypalSubscriptionId;
      currentCycle = current !== 'free' && u.billingCycle ? u.billingCycle : null;
      trial = await trialEligible(u);
    } catch {}
  }
  const trialDays = trial ? TRIAL_DAYS : 0;
  const clientId = process.env.PAYPAL_CLIENT_ID || ''; // read at request time; the id is public by nature (it renders the buttons)
  let provisioned: Awaited<ReturnType<typeof paypalProvisioned>> = null;
  if (clientId && v) { try { provisioned = await paypalProvisioned(); } catch (e) { console.error('PayPal provisioning failed', e); } }
  const signup = '/auth/login?screen_hint=signup&returnTo=/pricing';
  const cards: PlanCard[] = OFFERED_PLANS.map(key => PLANS[key]).map(p => ({
    key: p.key, name: p.name, blurb: p.blurb, features: p.features, hot: p.key === 'professional',
    priceUsd: p.priceUsd, priceUsdYear: p.priceUsdYear ?? null, monthlyEquivalent: monthlyEquivalent(p), saving: annualSaving(p),
    priceMarker: p.priceMarker, licensing: p.licensing,
    planIds: { monthly: paypalPlanId(p.key, provisioned, 'monthly', trial), annual: paypalPlanId(p.key, provisioned, 'annual', trial) },
  }));
  const yearPrices = OFFERED_PLANS.map(k => PLANS[k].priceUsdYear).filter((n): n is number => !!n).map(usd);
  return (
    <>
      <SiteNav signedIn={!!v} />
      <main className="wrap">
        <section className="section" style={{ borderTop: 0, paddingTop: 40 }}>
          <h2>Pricing</h2>
          <p className="sub">
            {trial
              ? <>Every plan starts with a {TRIAL_DAYS}-day free trial. Pick one, approve it in PayPal, and nothing is charged until the trial ends; cancel any time before then and you pay nothing. </>
              : <>Your free trial has been used, so a new subscription bills from the day you start it. </>}
            Pay yearly and get {ANNUAL_MONTHS_FREE} months free, or pay month by month; the features are the same. Prices are in US dollars. Need a deployment on your own data and geography? <a href="mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise">Talk to us</a>.
          </p>
          {current !== 'free' && (
            <div className="notice good" style={{ marginBottom: 18 }}>
              <span>
                You are on the {PLANS[current].name} plan{status ? ` (${status.toLowerCase()})` : ''}{currentCycle ? `, billed ${currentCycle === 'annual' ? 'yearly' : 'monthly'}` : ''}. Manage it on your <a href="/account">Account page</a>.
                {currentCycle === 'monthly' && PLANS[current].priceUsdYear ? ` Switch to annual below and get ${ANNUAL_MONTHS_FREE} months free.` : ''}
              </span>
            </div>
          )}
          <PricingPlans plans={cards} signedIn={!!v} current={current} currentCycle={currentCycle} currentName={PLANS[current].name} hasSubscription={hasSubscription} clientId={clientId} userId={userId} trialDays={trialDays} initialCycle={initialCycle} signupHref={signup} />
          {OFFERED_PLANS.map(key => PLANS[key]).filter(p => p.priceMarker && p.licensing).map(p => (
            <p key={p.key} className="note licensing" style={{ marginTop: 18 }}><b>{p.priceMarker}</b> {(p.licensing || '').replace(/\s*Call for pricing\.?$/, '')} <a href="mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise%20licensing">Call for pricing</a>.</p>
          ))}
          <p className="note" style={{ marginTop: 10 }}>Annual plans are billed once a year ({yearPrices.join(', ')}): ten months&apos; price for twelve, with the same features and limits as monthly. Limits reset daily at midnight UTC and monthly on the first. Research reports and the Reasoning model cost more to run, which is why they are counted separately. Taxes may be added at checkout where PayPal collects them.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
