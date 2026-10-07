import '../globals.css'; // site styles load only on these pages; the app under /app has its own
import type { Metadata } from 'next';
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { CancelButton, DeleteAccountButton, SignedInSites } from '@/components/AccountActions';
import { AutoRechargeControls } from '@/components/AutoRechargeControls';
import { currentUser } from '@/lib/session';
import { planFor, statusGrants, usd, GAS, RECHARGE, gas as gasWord } from '@/lib/plans';
import { readUsage, gasState, capabilityPlan } from '@/lib/usage';
import { db, schema } from '@/lib/db';
import { desc, eq } from 'drizzle-orm';
import { loadGraph } from '@/lib/graph';
import { currentSubscription } from '@/lib/billing';
import { rememberedSites } from '@/lib/browse-live';
import { finixProvisioned, finixPublic } from '@/lib/finix-setup';
import { cardOnFile, autoRechargeState, purchaseKinds } from '@/lib/recharge';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

/**
 * The account: who is signed in, the gas on hand with the card and auto-recharge that keep it topped up, the purchases
 * so far, the identity graph, remembered sign-ins, and the ways out. A Plan card shows only for accounts that still
 * carry a subscription or a license from before prepaid gas, so new accounts never see plan or trial copy.
 */
export default async function Account() {
  const user = await currentUser();
  const plan = planFor(user.plan);
  const [usage, graph, sub, sites, gas, purchases, fx] = await Promise.all([
    readUsage(user.id), loadGraph(user.id), currentSubscription(user), rememberedSites(user.id).catch(() => []), gasState(user),
    db().select().from(schema.gasPurchases).where(eq(schema.gasPurchases.userId, user.id)).orderBy(desc(schema.gasPurchases.createdAt)).limit(24),
    finixProvisioned().catch(e => { console.error('[finix] provisioning failed', e); return null; }),
  ]);
  const capPlan = capabilityPlan(user);
  const active = statusGrants(user.subscriptionStatus);
  const granted = user.subscriptionStatus === 'TRIAL' || user.subscriptionStatus === 'LICENSED';
  const ended = user.subscriptionStatus === 'TRIAL_ENDED' || user.subscriptionStatus === 'LICENSE_ENDED';
  // The legacy subscription, if the account has one: who bills it and how.
  const paying = !!user.paypalSubscriptionId && active && !granted && plan.key !== 'free';
  const provider: 'paypal' | 'finix' = user.subscriptionProvider || sub?.provider || 'paypal';
  const billedBy = provider === 'finix' ? 'to your card' : 'through PayPal';
  const startedAt = sub?.startedAt ? new Date(sub.startedAt) : null;
  const hasLegacy = plan.key !== 'free' || !!user.paypalSubscriptionId || !!user.subscriptionStatus;
  const resets = new Date(gas.resetsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const pct = gas.allowance > 0 ? Math.min(100, Math.round((gas.used / gas.allowance) * 100)) : 0;
  const card = cardOnFile(user);
  const auto = autoRechargeState(user);
  const pub = finixPublic(fx);
  const finix = pub && pub.merchant ? { env: pub.env, applicationId: pub.applicationId } : null;
  const low = !gas.unlimited && gas.remaining < RECHARGE.autoThresholdGas;
  const kindLabel = (k: string | null) => purchaseKinds[(k || 'recharge') as keyof typeof purchaseKinds] || 'Recharge';
  return (
    <>
      <SiteNav signedIn />
      <main className="wrap">
        <section className="section" style={{ borderTop: 0, paddingTop: 40 }}>
          <h2>Account</h2>
          <p className="sub">{user.name || user.email}{user.email && user.name ? ` · ${user.email}` : ''}{user.admin ? ' · admin, all access' : ''}</p>
          <div className="cards">
            <div className="card">
              <h3>Gas</h3>
              {user.admin ? <p>Admin accounts are not metered. This month: {usage.month.questions} questions, {usage.month.research} Research reports, {usage.month.builds} app versions, {usage.month.ideas} idea sets, {usage.month.browserActions} browser actions.</p> : <>
                {gas.allowance > 0 ? <>
                  <p>{gasWord(gas.planLeft)} of this month&apos;s {gasWord(gas.allowance)} allowance left; it refills {resets}.{gas.balance > 0 ? ` Plus ${gasWord(gas.balance)} bought, which never expires and is spent after the allowance.` : ''}</p>
                  <div className="gauge" aria-label={`${gasWord(gas.planLeft)} of ${gasWord(gas.allowance)} left`}><span style={{ width: `${100 - pct}%` }} /></div>
                </> : (
                  <p>You have <b>{gasWord(gas.remaining)}</b> to spend. Gas never expires; when it runs low, recharge from {usd(RECHARGE.minUsd)} or let auto-recharge do it.</p>
                )}
                {low && <div className="notice" style={{ marginBottom: 12 }}>{gas.remaining <= 0 ? 'You are out of gas.' : `You are down to ${gasWord(gas.remaining)}.`} A recharge adds gas you can use right away.</div>}
                <div className="stats">
                  <div className="stat"><b>{gas.remaining.toLocaleString('en-US')}</b><span>gas to spend</span></div>
                  <div className="stat"><b>{gas.used.toLocaleString('en-US')}</b><span>spent this month</span></div>
                  {gas.allowance > 0 && <div className="stat"><b>{gas.balance.toLocaleString('en-US')}</b><span>bought and unspent</span></div>}
                </div>
                <p style={{ marginTop: 12 }}>What things cost: a question {GAS.question}, on the Reasoning model {GAS.reasoning}; a Research report {GAS.research}; a browser action or a minute in control {GAS.browserAction}; a Discover idea set {GAS.ideaSet}; an app version {GAS.build}. This month: {usage.month.questions} questions, {usage.month.research} reports, {usage.month.builds} versions, {usage.month.ideas} idea sets, {usage.month.browserActions} browser actions.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a className="btn primary" href="/pricing">Recharge</a><a className="btn" href="/pricing#costs">What gas buys</a></div>
              </>}
            </div>
            {!user.admin && <div className="card">
              <h3>Card and auto-recharge</h3>
              <p className="note">The card from your last recharge stays on file for one-click recharges. Auto-recharge, when it is on, tops your balance up by itself so a build is never interrupted. Both are covered by the <a href="/recharge-agreement">Recharge Agreement</a>{auto.agreed ? ', which you agreed to' : ''}.</p>
              <AutoRechargeControls finix={finix} card={card} on={auto.on} thresholdGas={auto.thresholdGas} usd={auto.usd} failures={auto.failures} off={auto.off} agreed={auto.agreed} tiles={RECHARGE.tiles.map(t => ({ usd: t.usd, label: t.label }))} minUsd={RECHARGE.minUsd} maxUsd={RECHARGE.maxUsd} />
            </div>}
            {purchases.length > 0 && <div className="card">
              <h3>Gas added</h3>
              <p className="note">Every credit to this account: recharges you made, automatic ones, and the gas it started with.</p>
              <ul className="purchases">{purchases.map(pu => (
                <li key={pu.id}>
                  <span className="when">{new Date(pu.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="what">{kindLabel(pu.kind)}{pu.provider === 'paypal' ? ' (PayPal)' : ''}</span>
                  <b>{gasWord(pu.gas)}</b>
                  <span className="paid">{pu.usdCents > 0 ? usd(pu.usdCents / 100) : 'Free'}</span>
                </li>
              ))}</ul>
            </div>}
            {hasLegacy && !user.admin && <div className="card">
              <h3>Plan</h3>
              <p><span className={'pill ' + (active ? 'on' : 'off')}>{plan.name}{user.subscriptionStatus ? ` · ${user.subscriptionStatus.toLowerCase()}` : ''}</span>{user.planRenewsAt && active ? <span className="note" style={{ marginLeft: 10 }}>{granted ? (user.subscriptionStatus === 'TRIAL' ? 'Ends' : 'Licensed until') : 'Renews'} {new Date(user.planRenewsAt).toLocaleDateString()}</span> : null}</p>
              {paying && <p className="note">Billed {plan.contactSales ? 'under your organization’s agreement' : `monthly at ${usd(plan.priceUsd)} ${billedBy}`}{startedAt ? `, since ${startedAt.toLocaleDateString()}` : ''}. Your plan keeps its monthly gas allowance for as long as you keep it; Ricorsa no longer sells subscriptions, so if you cancel, the account continues on prepaid gas.</p>}
              {granted && !user.planRenewsAt && <p className="note">Your {plan.name} plan is licensed with no end date.</p>}
              {capPlan.key !== plan.key && !user.admin && plan.key === 'free' && <p className="note">Every feature is on for your account: Discover, the Build studio and the Ricorsa Browser.</p>}
              {ended && <div className="notice" style={{ marginBottom: 12 }}>Your {user.subscriptionStatus === 'TRIAL_ENDED' ? 'trial' : 'license'} has ended. The account continues on prepaid gas: recharge whenever you need more.</div>}
              {!active && !ended && <div className="notice" style={{ marginBottom: 12 }}>Your subscription is {user.subscriptionStatus?.toLowerCase()}, so its monthly gas is paused. {provider === 'paypal' ? 'Update the payment method in PayPal to resume it, or' : 'You can'} simply recharge: bought gas works right away.</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {plan.contactSales && <a className="btn" href="mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise">Contact your account team</a>}
                <CancelButton hasSubscription={!!user.paypalSubscriptionId && active} provider={provider} />
              </div>
            </div>}
            <div className="card">
              <h3>Your identity graph</h3>
              <p>{Object.keys(graph.nodes).length} nodes from {graph.events} conversations. Learning is {graph.paused ? 'paused' : 'on'}.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a className="btn" href="/app#/graph">Open the graph</a><a className="btn" href="/api/account/export">Export everything</a></div>
            </div>
            {(capPlan.caps.browser === 'full' || sites.length > 0) && <div className="card">
              <h3>Sites Ricorsa stays signed in to</h3>
              <p>Sign-ins you chose to keep after taking over Ricorsa&apos;s browser. Each is sealed in your account and used only when you send Ricorsa to that site. Signing out here deletes it; the site itself is untouched.</p>
              <SignedInSites sites={sites} />
            </div>}
            <div className="card">
              <h3>Delete account</h3>
              <p>Removes your threads, Spaces, graph and usage history, the card on file, and cancels any active subscription. Unspent gas is lost with the account. This cannot be undone.</p>
              <DeleteAccountButton />
            </div>
          </div>
          <div className="card" style={{ marginTop: 18 }}>
            <h3>Signed in as {user.email || user.name || 'you'}</h3>
            <p>To use a different account, sign out here and then sign in or sign up again from the home page.</p>
            <a className="btn" href="/auth/logout">Sign out</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
