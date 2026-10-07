import '../globals.css'; // site styles load only on these pages; the app under /app has its own
import type { Metadata } from 'next';
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { RechargeBlock, type CardCheckout } from '@/components/RechargeBlock';
import { viewer } from '@/lib/viewer';
import { PLANS, GAS, RECHARGE, gasForUsd, gas as gasWord, usd } from '@/lib/plans';
import { currentUser } from '@/lib/session';
import { gasState } from '@/lib/usage';
import { finixProvisioned, finixPublic } from '@/lib/finix-setup';
import { cardOnFile, autoRechargeState } from '@/lib/recharge';

export const metadata: Metadata = { title: 'Recharge' };
export const dynamic = 'force-dynamic';

/** The price list as the page prints it: each metered thing and what it costs in gas. */
const COST_ROWS: Array<[string, number]> = [
  ['A question on Auto or a standard model', GAS.question],
  ['A question on a premium model (Claude Fable, GPT, Gemini Pro, Grok)', GAS.reasoning],
  ['A Research report', GAS.research],
  ['A Discover idea set (a set you have seen is free)', GAS.ideaSet],
  ['An app version in the Build studio, checked and repaired', GAS.build],
  ['A browser action: an open, a click, a typed field, a scroll', GAS.browserAction],
  ['A minute in control of the browser after a take-over', GAS.takeoverMinute],
  ['A question one of your built apps asks', GAS.appQuestion],
];

/**
 * Ricorsa is prepaid: every account starts with gas, everything metered costs gas, and when it runs out the person
 * recharges here, $20 to $5,000 at a time, by card on the page (the card is kept for one-click recharges and, if
 * they turn it on, auto-recharge) or through PayPal. Organizations with a contract are on Enterprise, set from the
 * Manager Console. The URL stays /pricing (links and bookmarks); /recharge comes here too.
 */
export default async function Recharge() {
  const v = await viewer();
  let admin = false; let remaining: number | null = null; let balance = 0; let allowance = 0; let userPlanName = '';
  let card: { brand: string | null; lastFour: string | null } | null = null; let agreed = false; let autoOn = false; let threshold: number = RECHARGE.autoThresholdGas;
  let finix: CardCheckout = null;
  if (v) {
    try {
      const u = await currentUser();
      admin = !!u.admin; userPlanName = PLANS[u.plan as keyof typeof PLANS]?.name || '';
      const st = await gasState(u); balance = st.balance; allowance = st.allowance; remaining = st.unlimited ? null : st.remaining;
      card = cardOnFile(u); const auto = autoRechargeState(u); agreed = auto.agreed; autoOn = auto.on; threshold = auto.thresholdGas;
      const fx = await finixProvisioned().catch(e => { console.error('[finix] provisioning failed', e); return null; });
      const pub = finixPublic(fx);
      if (pub && pub.merchant) finix = { env: pub.env, applicationId: pub.applicationId };
    } catch {}
  }
  const clientId = process.env.PAYPAL_CLIENT_ID || ''; // public by nature; it renders the buttons
  const signup = '/auth/login?screen_hint=signup&returnTo=/pricing';
  const contact = 'mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise';
  return (
    <>
      <SiteNav signedIn={!!v} />
      <main className="wrap">
        <section className="section" style={{ borderTop: 0, paddingTop: 40 }}>
          <h2>Recharge</h2>
          <p className="sub">
            Top up your gas with a card. Every account starts with <b>{gasWord(RECHARGE.signupGas)}</b> free; when it runs out, recharge to continue. Everything you do in Ricorsa is counted in one unit, gas, at <b>{RECHARGE.gasPerUsd} gas per dollar</b>, and <a href="#costs">the price list</a> says what each thing costs. Gas never expires, there is no subscription, and every feature is on for every account: the full identity graph, Research, Discover, the Build studio and the Ricorsa Browser.
          </p>
          {v && !admin && (
            <div className="notice info" style={{ marginBottom: 18 }}>
              <span>
                You have <b>{remaining === null ? 'unlimited gas' : gasWord(remaining)}</b>{allowance > 0 ? ` (${gasWord(balance)} of it bought, the rest this month's ${userPlanName} allowance)` : ''}.{card ? ` Card on file: ${card.brand || 'card'} ending ${card.lastFour || ''}${autoOn ? `; auto-recharge is on below ${gasWord(threshold)}` : ''}.` : ''} Manage your card and auto-recharge on your <a href="/account">Account page</a>.
              </span>
            </div>
          )}
          <RechargeBlock signedIn={!!v} admin={admin} tiles={RECHARGE.tiles.map(t => ({ usd: t.usd, label: t.label, recommended: 'recommended' in t && !!t.recommended }))} gasPerUsd={RECHARGE.gasPerUsd} minUsd={RECHARGE.minUsd} maxUsd={RECHARGE.maxUsd} finix={finix} clientId={clientId} card={card} agreed={agreed} autoOn={autoOn} thresholdGas={threshold} signupHref={signup} />
          <p className="note" style={{ marginTop: 14 }}>Recharges are credited at once and never expire. Each tile is {RECHARGE.gasPerUsd} gas per dollar: {RECHARGE.tiles.slice(0, 4).map(t => `${usd(t.usd)} is ${gasWord(gasForUsd(t.usd))}`).join(', ')}. Cards are processed by our card processor and never touch Ricorsa; taxes may be added where they apply.</p>
        </section>

        <section className="section" id="enterprise">
          <h2>For organizations</h2>
          <div className="payg">
            <div className="payg-card">
              <div className="price contact-price">Enterprise<small>priced for your organization</small></div>
              <div className="gas-line"><b>A monthly gas allowance</b> set with you, raised as you grow</div>
              <ul>{PLANS.enterprise.features.map(f => <li key={f}>{f}</li>)}</ul>
              <a className="btn primary" href={contact}>Talk to us</a>
              <div className="note" style={{ marginTop: 8 }}>{PLANS.enterprise.licensing}</div>
            </div>
            <div className="payg-side">
              <div className="card">
                <h3>How prepaid gas compares</h3>
                <p className="note">A person who asks a few questions a day spends about {gasWord(GAS.question * 90)} a month, so a {usd(20)} recharge lasts most of a year. A team that builds apps every week spends {gasWord(GAS.build * 4)} a month on versions alone, which is where an Enterprise allowance, set once for the organization, starts to make sense.</p>
              </div>
              <div className="card">
                <h3>Auto-recharge</h3>
                <p className="note">Turn it on with any recharge and your card tops the balance up by the same amount whenever it falls below {gasWord(RECHARGE.autoThresholdGas)}, at most once a day, so a build is never interrupted. It switches itself off after three failed charges and tells you on the Account page.</p>
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
          <p className="note">A failed answer costs nothing; the browser actions it took do. A Discover set you have already seen is served again for free. Minutes in control of the browser are charged as they pass, so a tab you close without pressing Done still pays only for its minutes. Every account starts with {gasWord(RECHARGE.signupGas)}.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
