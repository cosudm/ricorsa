import '../globals.css'; // site styles load only on these pages; the app under /app has its own
import type { Metadata } from 'next';
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { CancelButton, DeleteAccountButton } from '@/components/AccountActions';
import { currentUser } from '@/lib/session';
import { planFor } from '@/lib/plans';
import { readUsage } from '@/lib/usage';
import { loadGraph } from '@/lib/graph';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function Account() {
  const user = await currentUser();
  const plan = planFor(user.plan);
  const [usage, graph] = await Promise.all([readUsage(user.id), loadGraph(user.id)]);
  const active = !user.subscriptionStatus || ['ACTIVE', 'APPROVAL_PENDING'].includes(user.subscriptionStatus);
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
              <p><span className={'pill ' + (active ? 'on' : 'off')}>{plan.name}{user.subscriptionStatus ? ` · ${user.subscriptionStatus.toLowerCase()}` : ''}</span>{user.planRenewsAt && active ? <span className="note" style={{ marginLeft: 10 }}>Renews {new Date(user.planRenewsAt).toLocaleDateString()}</span> : null}</p>
              {!active && <div className="notice" style={{ marginBottom: 12 }}>Your PayPal subscription is {user.subscriptionStatus?.toLowerCase()}. Update the payment method in PayPal, or subscribe again on the pricing page, to restore {plan.name} limits.</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {plan.key === 'free' ? <a className="btn primary" href="/pricing">Upgrade</a> : <a className="btn" href="/pricing">Change plan</a>}
                <CancelButton hasSubscription={!!user.paypalSubscriptionId && active} />
              </div>
            </div>
            <div className="card">
              <h3>Usage</h3>
              <p>Counters reset daily at midnight UTC and monthly on the first.</p>
              <div className="stats">
                <div className="stat"><b>{usage.day.questions} / {plan.questionsPerDay}</b><span>questions today</span></div>
                <div className="stat"><b>{usage.month.questions} / {plan.questionsPerMonth}</b><span>this month</span></div>
                <div className="stat"><b>{usage.month.research} / {plan.researchPerMonth}</b><span>Research reports</span></div>
              </div>
            </div>
            <div className="card">
              <h3>Your identity graph</h3>
              <p>{Object.keys(graph.nodes).length} nodes from {graph.events} conversations. Learning is {graph.paused ? 'paused' : 'on'}.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><a className="btn" href="/app#/graph">Open the graph</a><a className="btn" href="/api/account/export">Export everything</a></div>
            </div>
            <div className="card">
              <h3>Delete account</h3>
              <p>Removes your threads, Spaces, graph and usage history, and cancels any active subscription. This cannot be undone.</p>
              <DeleteAccountButton />
            </div>
          </div>
          <p className="note" style={{ marginTop: 18 }}><a href="/auth/logout">Sign out</a></p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
