import '../globals.css'; // site styles load only on these pages; the app under /app has its own
import type { Metadata } from 'next';
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { PricingPlans, type PlanCard, type Cycle, type CardCheckout } from '@/components/PricingPlans';
import { BuyGas } from '@/components/BuyGas';
import { viewer } from '@/lib/viewer';
import { PLANS, OFFERED_PLANS, GAS, PAYG, paypalPlanId, normalizePlanKey, trialDaysFor, gas as gasWord, usd, type PlanKey } from '@/lib/plans';
import { paypalProvisioned } from '@/lib/paypal-setup';
import { finixProvisioned, finixPublic } from '@/lib/finix-setup';
import { currentUser } from '@/lib/session';
import { trialEligible } from '@/lib/billing';
import { gasState, capabilityPlan } from '@/lib/usage';

export const metadata: Metadata = { title: 'Pricing' };
export const dynamic = 'force-dynamic';

/** The price list as the page prints it: each metered thing and what it costs in gas. */
const COST_ROWS: Array<[string, number]> = [
  ['A question (Fast or Best model)', GAS.question],
  ['A question on the Reasoning model', GAS.reasoning],
  ['A Research report', GAS.research],
  ['A Discover idea set (a set you have seen is free)', GAS.ideaSet],
  ['An app version in the Build studio, checked and repaired', GAS.build],
  ['A browser action: an open, a click, a typed field, a scroll', GAS.browserAction],
  ['A minute in control of the browser after a take-over', GAS.takeoverMinute],
  ['A question one of your built apps asks', GAS.appQuestion],
];

/**
 * Essentials and Professional bill monthly, by card on the page itself (Finix) or through PayPal, with a free trial on a
 * first subscription (Essentials 14 days, Professional 30); Enterprise is priced per organization; Pay-As-You-Go gas is
 * bought outright in $100 blocks. Everything a plan includes is counted in one unit, gas, and the price list below the
 * plans says what each thing costs. An account with no subscription is not a plan on offer, so it is not a card here;
 * it has the Free allowance until a subscription starts.
 */
export default async function Pricing() {
  const v = await viewer();
  let current: PlanKey = 'free'; let currentCycle: Cycle | null = null; let status: string | null = null; let userId = ''; let hasSubscription = false; let trial = true;
  let balance = 0; let remaining: number | null = null; let capKey: PlanKey = 'free'; let admin = false;
  if (v) {
    try {
      const u = await currentUser();
      current = normalizePlanKey(u.plan); status = u.subscriptionStatus; userId = u.id; hasSubscription = !!u.paypalSubscriptionId; admin = !!u.admin;
      currentCycle = current !== 'free' && u.billingCycle ? u.billingCycle : null;
      trial = await trialEligible(u);
      const st = await gasState(u); balance = st.balance; remaining = st.unlimited ? null : st.remaining; capKey = capabilityPlan(u).key;
    } catch {}
  }
  const clientId = process.env.PAYPAL_CLIENT_ID || ''; // read at request time; the id is public by nature (it renders the buttons)
  let provisioned: Awaited<ReturnType<typeof paypalProvisioned>> = null;
  let finix: CardCheckout = null; let finixPlans: Partial<Record<PlanKey, { trialDays: number }>> = {};
  if (v) {
    const [pp, fx] = await Promise.all([
      clientId ? paypalProvisioned().catch(e => { console.error('PayPal provisioning failed', e); return null; }) : Promise.resolve(null),
      finixProvisioned().catch(e => { console.error('[finix] provisioning failed', e); return null; }),
    ]);
    provisioned = pp;
    const pub = finixPublic(fx);
    if (pub && pub.merchant) { finix = { env: pub.env, applicationId: pub.applicationId }; finixPlans = pub.plans; }
  }
  // The trial each plan starts with: as the card processor's plan carries it (the two agree with plans.ts), none once the account's trial is used.
  const trialFor = (key: PlanKey) => (trial ? finixPlans[key]?.trialDays ?? trialDaysFor(PLANS[key]) : 0);
  const trialLine = OFFERED_PLANS.filter(k => !PLANS[k].contactSales).map(k => `${PLANS[k].name} ${trialFor(k)}`).join(' days, ') + ' days';
  const signup = '/auth/login?screen_hint=signup&returnTo=/pricing';
  const contact = 'mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise';
  const cards: PlanCard[] = OFFERED_PLANS.map(key => PLANS[key]).map(p => ({
    key: p.key, name: p.name, blurb: p.blurb, features: p.features, hot: p.key === 'professional',
    priceUsd: p.priceUsd, gasPerMonth: p.gasPerMonth, contactSales: !!p.contactSales, licensing: p.licensing,
    trialDays: p.contactSales ? 0 : trialFor(p.key),
    planId: p.contactSales ? null : paypalPlanId(p.key, provisioned, 'monthly', trial),
    // A card subscription uses the processor's plan while a trial applies and a direct price afterwards, so the card is ready either way once the processor is.
    card: !p.contactSales && !!finix && (!trial || !!finixPlans[p.key]),
  }));
  return (
    <>
      <SiteNav signedIn={!!v} />
      <main className="wrap">
        <section className="section" style={{ borderTop: 0, paddingTop: 40 }}>
          <h2>Pricing</h2>
          <p className="sub">
            {trial
              ? <>Essentials and Professional start with a free trial ({trialLine}). Pick one, enter a card or approve it in PayPal, and nothing is charged until the trial ends; cancel any time before then and you pay nothing. </>
              : <>Your free trial has been used, so a new subscription bills from the day you start it. </>}
            Plans bill monthly, in US dollars. Everything you do in Ricorsa is counted in one unit, gas, and every plan includes a monthly allowance of it; <a href="#costs">the price list</a> says what each thing costs. Need more in a given month? <a href="#gas">Pay-As-You-Go gas</a> never expires. Need a deployment on your own data and geography? <a href={contact}>Talk to us</a>.
          </p>
          {current !== 'free' && (
            <div className="notice good" style={{ marginBottom: 18 }}>
              <span>
                You are on the {PLANS[current].name} plan{status ? ` (${status.toLowerCase()})` : ''}{currentCycle === 'annual' ? ', billed yearly at the price you subscribed at' : currentCycle ? ', billed monthly' : ''}. Manage it on your <a href="/account">Account page</a>.
              </span>
            </div>
          )}
          <PricingPlans plans={cards} signedIn={!!v} current={current} currentCycle={currentCycle} currentName={PLANS[current].name} hasSubscription={hasSubscription} clientId={clientId} userId={userId} finix={finix} signupHref={signup} contactHref={contact} />
          <p className="note" style={{ marginTop: 14 }}>Monthly gas refills on the first of each month and does not carry over. Annual plans are no longer sold; anyone who has one keeps it at the price they subscribed at. Cards are processed by our card processor and never touch Ricorsa; taxes may be added at checkout where they apply.</p>
        </section>

        <section className="section" id="gas">
          <h2>Pay-As-You-Go</h2>
          <p className="sub">Gas you buy outright: <b>{gasWord(PAYG.gas)} for {usd(PAYG.usd)}</b>, in blocks of {usd(PAYG.usd)}. It never expires, it is spent only after your plan&apos;s monthly gas is gone, and while you have any it comes with the Professional features: Discover, the Build studio and the Ricorsa Browser, whatever plan you are on.</p>
          <div className="payg">
            <div className="payg-card">
              <div className="price">{usd(PAYG.usd)}<small>per block</small></div>
              <div className="gas-line"><b>{gasWord(PAYG.gas)}</b> a block, never expires</div>
              <ul>
                <li>About {PAYG.gas.toLocaleString('en-US')} questions, or {Math.floor(PAYG.gas / GAS.research)} Research reports, or {Math.floor(PAYG.gas / GAS.build)} app versions, or any mix</li>
                <li>Professional features while it lasts, on any plan</li>
                <li>Used after your plan&apos;s monthly allowance, so nothing you paid for goes to waste</li>
                <li>Buy more any time; a purchase is one card or PayPal payment, nothing recurring</li>
              </ul>
              {!v ? (
                <a className="btn primary" href={signup}>Sign in to buy gas</a>
              ) : admin ? (
                <div className="notice info">Admin accounts are not metered, so there is nothing to buy here.</div>
              ) : (
                <BuyGas finix={finix} clientId={clientId} blockUsd={PAYG.usd} blockGas={PAYG.gas} />
              )}
            </div>
            <div className="payg-side">
              {v && !admin && (
                <div className="card">
                  <h3>Your gas</h3>
                  <p className="big">{remaining === null ? 'Unlimited' : gasWord(remaining)}</p>
                  <p className="note">{balance > 0 ? `${gasWord(balance)} of it is gas you bought.` : 'All of it is this month’s allowance from your plan.'} {capKey !== current && balance > 0 ? `Your bought gas gives you the ${PLANS[capKey].name} features while it lasts.` : ''} See the <a href="/account">Account page</a> for the month in detail.</p>
                </div>
              )}
              <div className="card">
                <h3>When it makes sense</h3>
                <p className="note">A heavy month on Essentials, a Build studio weekend on the Free plan, or a team that would rather pay for what it uses than commit to Professional. The plan is still the better deal for steady use: Essentials&apos; {gasWord(PLANS.essentials.gasPerMonth)} cost {usd(PLANS.essentials.priceUsd)} a month, and Professional&apos;s {gasWord(PLANS.professional.gasPerMonth)} cost {usd(PLANS.professional.priceUsd)}.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="costs">
          <h2>What gas buys</h2>
          <p className="sub">One unit for everything, so the gauge in the app always tells you where you stand. Each answer, idea set, app version and browser session shows what it cost the moment it finishes.</p>
          <table className="cost-table">
            <thead><tr><th>What</th><th>Costs</th></tr></thead>
            <tbody>{COST_ROWS.map(([what, cost]) => <tr key={what}><td>{what}</td><td>{gasWord(cost)}</td></tr>)}</tbody>
          </table>
          <p className="note">A failed answer costs nothing; the browser actions it took do. A Discover set you have already seen is served again for free. Minutes in control of the browser are charged as they pass, so a tab you close without pressing Done still pays only for its minutes. The Free allowance is {gasWord(PLANS.free.gasPerMonth)} a month.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
