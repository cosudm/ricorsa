import '../globals.css'; // site styles load only on these pages; the app under /app has its own
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { viewer } from '@/lib/viewer';
import { RECHARGE, gasForUsd, gas as gasWord, usd } from '@/lib/plans';

// Rendered per request: the nav reflects the signed-in state, which comes from the session cookie.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recharge Agreement' };

/**
 * The terms of prepaid gas and of the card on file: what a recharge buys, when a card may be charged without a
 * button press, and how to turn that off. Linked from the checkbox on the Recharge page; the version is recorded
 * with each purchase and consent.
 */
export default async function RechargeAgreement() {
  const v = await viewer();
  return (<><SiteNav signedIn={!!v} /><main className="wrap prose">
    <h1>Recharge Agreement</h1>
    <p>Version {RECHARGE.agreementVersion}. This agreement covers gas you buy for your Ricorsa account and the card you pay with. It sits alongside the <a href="/terms">Terms of service</a>; where the two differ on recharges, this agreement applies. It is a starting point for review by counsel, not legal advice.</p>
    <h2>What a recharge is</h2><p>Gas is the unit everything in Ricorsa is counted in. A recharge is a one-time purchase of gas at the rate shown on the Recharge page at the time of purchase ({RECHARGE.gasPerUsd} gas per US dollar as of this version: {usd(RECHARGE.minUsd)} buys {gasWord(gasForUsd(RECHARGE.minUsd))}), in whole dollars between {usd(RECHARGE.minUsd)} and {usd(RECHARGE.maxUsd)}. The gas is credited to your account as soon as the payment clears, usually at once. The rate and what each thing costs in gas may change with notice on the Recharge page; gas already on your account keeps its value in gas.</p>
    <h2>Gas does not expire</h2><p>Gas you buy stays on your account until it is spent. It is spent after any monthly allowance your account carries. It has no cash value, cannot be transferred to another account, and is spent only on Ricorsa.</p>
    <h2>Refunds</h2><p>Gas that has been spent is not refundable. Unspent gas from a recharge made in the last 14 days is refunded on request to the card or PayPal account that paid for it; write to support@ricorsa.com from the address on your account. Gas granted free of charge, including the gas every new account starts with, has no refund value.</p>
    <h2>Your card on file</h2><p>Card payments are taken by our card processor. Your card details are entered into fields the processor serves and never touch Ricorsa; what Ricorsa keeps is a reference to the card, its brand and its last four digits. The card used for a recharge is kept on file so your next recharge is one click and so auto-recharge can work. You can replace or remove the card on your Account page at any time.</p>
    <h2>Auto-recharge</h2><p>Auto-recharge is off unless you turn it on, on the Recharge page or the Account page. When it is on, you authorize Ricorsa to charge your card on file for the amount you chose whenever your balance falls below the threshold you chose ({gasWord(RECHARGE.autoThresholdGas)} unless you change it), at most once in any 24 hours. Each automatic charge is credited as gas at the rate in force, appears on your Account page, and is covered by the refund terms above. If a charge fails, Ricorsa tries again on a later day; after three failed charges in a row auto-recharge switches itself off and the Account page says so. You can turn it off, change the amount or the threshold, or replace the card at any time, and the change applies to every charge after it.</p>
    <h2>PayPal</h2><p>A recharge through PayPal is a one-time payment approved in PayPal and covered by PayPal&apos;s own terms. PayPal payments do not keep a card on file with Ricorsa, so auto-recharge is not offered with them.</p>
    <h2>Taxes</h2><p>Prices are in US dollars. Where Ricorsa is required to collect sales tax or VAT on a recharge, the tax is shown before you pay.</p>
    <h2>Changes</h2><p>We may revise this agreement. A new version is shown on the Recharge page before your next purchase, and your agreement to it is asked for again there; automatic charges continue under the version you agreed to until you recharge again.</p>
  </main><SiteFooter /></>);
}
