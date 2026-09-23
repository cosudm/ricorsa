'use client';
import { useState } from 'react';
import { PayPalSubscribe } from './PayPalSubscribe';

export type Cycle = 'monthly' | 'annual';

/** One plan as the pricing page shows it: prices for both cycles and the PayPal plan id for each. */
export type PlanCard = {
  key: string; name: string; blurb: string; features: string[]; hot: boolean;
  priceUsd: number; priceUsdYear: number | null;
  /** The annual price spread over twelve months, in whole dollars (rounded up). */
  monthlyEquivalent: number | null;
  /** What twelve monthly payments would cost beyond the annual price. */
  saving: number;
  priceMarker?: string; licensing?: string;
  planIds: Record<Cycle, string | null>;
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
  initialCycle: Cycle;
  signupHref: string;
};

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * The plan cards with the billing toggle. Annual is the default: the card shows what the year costs per month
 * with an asterisk, and the footnote says what is billed and when. Monthly and annual are the same product.
 */
export function PricingPlans({ plans, signedIn, current, currentCycle, currentName, hasSubscription, clientId, userId, trialDays, initialCycle, signupHref }: PricingPlansProps) {
  const [cycle, setCycle] = useState<Cycle>(initialCycle);
  const annual = cycle === 'annual';
  const heldCycle: Cycle = currentCycle || 'monthly';
  const signup = signupHref + (annual ? '' : (signupHref.includes('?') ? '&' : '?') + 'cycle=monthly');
  const per = annual ? 'a year' : 'a month';
  return (
    <>
      <div className="cycle-row">
        <div className="cycle-toggle" role="radiogroup" aria-label="Billing cycle">
          <button type="button" role="radio" aria-checked={annual} className={annual ? 'on' : ''} onClick={() => setCycle('annual')}>Annual <span className="save">2 months free</span></button>
          <button type="button" role="radio" aria-checked={!annual} className={!annual ? 'on' : ''} onClick={() => setCycle('monthly')}>Monthly</button>
        </div>
        <span className="note">{annual ? 'Billed once a year. Same features and limits as monthly.' : 'Billed every month. Switch to annual any time for two months free.'}</span>
      </div>
      <div className="plans" data-cycle={cycle}>
        {plans.map(p => {
          const pid = p.planIds[cycle];
          const price = annual ? p.priceUsdYear : p.priceUsd;
          const onThisPlan = signedIn && current === p.key;
          const isCurrent = onThisPlan && heldCycle === cycle;
          const yearlyElsewhere = onThisPlan && heldCycle === 'annual' && !annual;
          const switching = onThisPlan && heldCycle === 'monthly' && annual;
          const replaces = hasSubscription && current !== 'free' ? `${currentName} (${heldCycle})` : null;
          const shown = annual && p.monthlyEquivalent != null ? p.monthlyEquivalent : p.priceUsd;
          return (
            <div key={p.key} className={'plan' + (p.hot ? ' hot' : '')}>
              <div className="name">{p.name}{p.hot && <span className="tag">Most popular</span>}{onThisPlan && <span className="tag current">Current{currentCycle ? `, ${currentCycle}` : ''}</span>}</div>
              <div className="price">{money(shown)}{p.priceMarker && <sup className="mark" title={p.licensing}>{p.priceMarker}</sup>}<small>/ month{annual ? '*' : ''}</small></div>
              {price != null && (
                <div className="trial">{trialDays > 0 ? `${trialDays}-day free trial, then ${money(price)} ${per}` : `${money(price)} ${per}, billed from today`}</div>
              )}
              {annual && p.priceUsdYear != null && <div className="note">* Billed {money(p.priceUsdYear)} a year, {money(p.saving)} less than paying monthly.</div>}
              <p className="blurb">{p.blurb}</p>
              <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
              <div className="buy">
                {!signedIn ? (
                  <a className="btn primary" href={signup}>{trialDays > 0 ? 'Start free trial' : 'Subscribe'}</a>
                ) : isCurrent ? (
                  <a className="btn" href="/account">Manage on Account</a>
                ) : yearlyElsewhere ? (
                  <div className="notice info"><span>Your {p.name} plan bills yearly. Manage it on your <a href="/account">Account page</a>.</span></div>
                ) : !pid || !clientId ? (
                  <div className="notice">Checkout is being set up. Please check back in a moment.</div>
                ) : (
                  <>
                    {switching && <div className="note" style={{ marginBottom: 8 }}>Switch to annual and pay {money(p.priceUsdYear || 0)} a year instead of {money(p.priceUsd * 12)}.</div>}
                    <PayPalSubscribe key={`${p.key}:${cycle}`} planId={pid} planKey={p.key} planName={p.name} clientId={clientId} userId={userId} trialDays={trialDays} cycle={cycle} priceUsd={price || undefined} replaces={replaces} />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
