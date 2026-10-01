import '../globals.css'; // site styles load only on these pages; the app under /app has its own
import type { Metadata } from 'next';
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { CancelButton, DeleteAccountButton, SignedInSites } from '@/components/AccountActions';
import { currentUser } from '@/lib/session';
import { planFor, statusGrants, ANNUAL_MONTHS_FREE, usd, GAS, PAYG, gas as gasWord } from '@/lib/plans';
import { readUsage, gasState, capabilityPlan } from '@/lib/usage';
import { db, schema } from '@/lib/db';
import { desc, eq } from 'drizzle-orm';
import { loadGraph } from '@/lib/graph';
import { currentSubscription } from '@/lib/billing';
import { rememberedSites } from '@/lib/browse-live';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function Account() {
  const user = await currentUser();
  const plan = planFor(user.plan);
  const [usage, graph, sub, sites, gas, purchases] = await Promise.all([readUsage(user.id), loadGraph(user.id), currentSubscription(user), rememberedSites(user.id).catch(() => []), gasState(user), db().select().from(schema.gasPurchases).where(eq(schema.gasPurchases.userId, user.id)).orderBy(desc(schema.gasPurchases.createdAt)).limit(12)]);
  const capPlan = capabilityPlan(user);
  const active = statusGrants(user.subscriptionStatus);
  const granted = user.subscriptionStatus === 'TRIAL' || user.subscriptionStatus === 'LICENSED';
  const ended = user.subscriptionStatus === 'TRIAL_ENDED' || user.subscriptionStatus === 'LICENSE_ENDED';
  // How the subscription bills: the row says, or every subscription from before the annual option was monthly.
  const paying = !!user.paypalSubscriptionId && active && !granted && plan.key !== 'free';
  const cycle = paying ? (user.billingCycle || sub?.billingCycle || 'monthly') : null;
  const startedAt = sub?.startedAt ? new Date(sub.startedAt) : null;
  const pct = gas.allowance > 0 ? Math.min(100, Math.round((gas.used / gas.allowance) * 100)) : 100;
  const resets = new Date(gas.resetsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return (
    <>
      <SiteNav signedIn />
      <main className="wrap">
        <section className="section" style={{ borderTop: 0, paddingTop: 40 }}>
          <h2>Account</h2>
          <p className="sub">{user.name || user.email}{user.email && user.name ? ` · ${user.email}` : ''}</p>
          <div className="cards">
            <div className="card">
              <h3>Plan</h3>
              <p><span className={'pill ' + (active ? 'on' : 'off')}>{plan.name}{user.subscriptionStatus ? ` · ${user.subscriptionStatus.toLowerCase()}` : ''}{user.admin ? ' · admin, all access' : ''}</span>{user.planRenewsAt && active ? <span className="note" style={{ marginLeft: 10 }}>{granted ? (user.subscriptionStatus === 'TRIAL' ? 'Trial ends' : 'Licensed until') : 'Renews'} {new Date(user.planRenewsAt).toLocaleDateString()}</span> : null}</p>
              {cycle && <p className="note">Billed {cycle === 'annual' ? `yearly at the price you subscribed at, ${ANNUAL_MONTHS_FREE} months free against monthly` : plan.contactSales ? 'under your organization\u2019s agreement' : `monthly: ${usd(plan.priceUsd)} a month`}{startedAt ? `, since ${startedAt.toLocaleDateString()}` : ''}.</p>}
              {capPlan.key !== plan.key && !user.admin && <p className="note">While your bought gas lasts you have the {capPlan.name} features: Discover, the Build studio and the Ricorsa Browser.</p>}
              {granted && !user.planRenewsAt && <p className="note">Your {plan.name} plan is licensed with no end date.</p>}
              {ended && <div className="notice" style={{ marginBottom: 12 }}>Your {user.subscriptionStatus === 'TRIAL_ENDED' ? 'trial' : 'license'} has ended, so the account has the free limits. Choose a plan on the pricing page to keep going; every plan starts with a free trial.</div>}
              {!active && !ended && <div className="notice" style={{ marginBottom: 12 }}>Your PayPal subscription is {user.subscriptionStatus?.toLowerCase()}. Update the payment method in PayPal, or subscribe again on the pricing page, to restore {plan.name} limits.</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {plan.key === 'free' ? <a className="btn primary" href="/pricing">Start a free trial</a> : <a className="btn" href="/pricing">Change plan</a>}
                <CancelButton hasSubscription={!!user.paypalSubscriptionId && active} />
              </div>
            </div>
            <div className="card">
              <h3>Gas</h3>
              {user.admin ? <p>Admin accounts are not metered. This month: {usage.month.questions} questions, {usage.month.research} Research reports, {usage.month.builds} app versions, {usage.month.ideas} idea sets, {usage.month.browserActions} browser actions.</p> : <>
                <p>{gasWord(gas.planLeft)} of this month&apos;s {gasWord(gas.allowance)} left; refills {resets}.{gas.balance > 0 ? ` Plus ${gasWord(gas.balance)} bought, which never expires and is used after the month\u2019s allowance.` : ''}</p>
                <div className="gauge" aria-label={`${gasWord(gas.planLeft)} of ${gasWord(gas.allowance)} left`}><span style={{ width: `${100 - pct}%` }} /></div>
                <div className="stats">
                  <div className="stat"><b>{gas.remaining.toLocaleString('en-US')}</b><span>gas left in all</span></div>
                  <div className="stat"><b>{gas.used.toLocaleString('en-US')}</b><span>spent this month</span></div>
                  <div className="stat"><b>{gas.balance.toLocaleString('en-US')}</b><span>bought and unspent</span></div>
                </div>
                <p style={{ marginTop: 12 }}>What things cost: a question {GAS.question}, on the Reasoning model {GAS.reasoning}; a Research report {GAS.research}; a browser action or a minute in control {GAS.browserAction}; a Discover idea set {GAS.ideaSet}; an app version {GAS.build}. This month: {usage.month.questions} questions, {usage.month.research} reports, {usage.month.builds} versions, {usage.month.ideas} idea sets, {usage.month.browserActions} browser actions.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a className="btn primary" href="/pricing#gas">Buy gas: {gasWord(PAYG.gas)} for ${PAYG.usd}</a></div>
                {purchases.length > 0 && <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 4, fontSize: 13 }}>{purchases.map(pu => <li key={pu.id}>{new Date(pu.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}: {gasWord(pu.gas)} for {usd(pu.usdCents / 100)}</li>)}</ul>}
              </>}
            </div>
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
              <p>Removes your threads, Spaces, graph and usage history, and cancels any active subscription. This cannot be undone.</p>
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
