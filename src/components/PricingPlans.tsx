'use client';
import { PayPalSubscribe } from './PayPalSubscribe';

export type Cycle = 'monthly' | 'annual';

/** One plan as the pricing page shows it: its monthly price (or none, for a plan priced per organization) and its PayPal plan id. */
export type PlanCard = {
  key: string; name: string; blurb: string; features: string[]; hot: boolean;
  priceUsd: number;
  /** Gas included every month. */
  gasPerMonth: number;
  /** Priced per organization: the card says Call for pricing and leads to a conversation instead of a checkout. */
  contactSales: boolean;
  licensing?: string;
  planId: string | null;
};

export type PricingPlansProps = {
  plans: PlanCard[];
  signedIn: boolean;
  /** The signed-in account's plan key (`free` for none) and how it bills, when it does. */
  current: string; currentCycle: Cycle | null; currentName: string;
  /** Whether the account has a PayPal subscription a new one would replace. */
  hasSubscription: boolean;
  clientId: string; userId: string;
  /** Days of free trial a new subscription starts with; 0 once the account's one trial is used. */
  trialDays: number;
  signupHref: string;
  contactHref: string;
};

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const gasWord = (n: number) => `${n.toLocaleString('en-US')} gas`;

/**
 * The plan cards. Plans bill monthly; a person already on an annual plan from before October 2026 keeps it, and their
 * card says so. Enterprise has no checkout: its price is set per organization, so the card opens a conversation.
 */
export function PricingPlans({ plans, signedIn, current, currentCycle, currentName, hasSubscription, clientId, userId, trialDays, signupHref, contactHref }: PricingPlansProps) {
  const heldCycle: Cycle = currentCycle || 'monthly';
  return (
    <div className="plans" data-cycle="monthly">
      {plans.map(p => {
        const onThisPlan = signedIn && current === p.key;
        const replaces = hasSubscription && current !== 'free' ? `${currentName} (${heldCycle})` : null;
        return (
          <div key={p.key} className={'plan' + (p.hot ? ' hot' : '') + (p.contactSales ? ' contact' : '')}>
            <div className="name">{p.name}{p.hot && <span className="tag">Most popular</span>}{onThisPlan && <span className="tag current">Current{currentCycle === 'annual' ? ', annual' : ''}</span>}</div>
            {p.contactSales ? (
              <div className="price contact-price">Call for pricing<small>priced for your organization</small></div>
            ) : (
              <div className="price">{money(p.priceUsd)}<small>/ month</small></div>
            )}
            <div className="gas-line"><b>{gasWord(p.gasPerMonth)}</b> a month{p.contactSales ? ', set with you' : ''}</div>
            {!p.contactSales && (
              <div className="trial">{trialDays > 0 ? `${trialDays}-day free trial, then ${money(p.priceUsd)} a month` : `${money(p.priceUsd)} a month, billed from today`}</div>
            )}
            <p className="blurb">{p.blurb}</p>
            <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
            <div className="buy">
              {p.contactSales ? (
                <>
                  <a className="btn primary" href={contactHref}>Talk to us</a>
                  <div className="note" style={{ marginTop: 8 }}>{p.licensing || 'Seat and floating licenses for organizations, with deployment on your own data and geography.'}</div>
                </>
              ) : !signedIn ? (
                <a className="btn primary" href={signupHref}>{trialDays > 0 ? 'Start free trial' : 'Subscribe'}</a>
              ) : onThisPlan ? (
                <a className="btn" href="/account">Manage on Account</a>
              ) : !p.planId || !clientId ? (
                <div className="notice">Checkout is being set up. Please check back in a moment.</div>
              ) : (
                <PayPalSubscribe key={p.key} planId={p.planId} planKey={p.key} planName={p.name} clientId={clientId} userId={userId} trialDays={trialDays} cycle="monthly" priceUsd={p.priceUsd} replaces={replaces} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
