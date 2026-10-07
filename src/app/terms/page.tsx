import '../globals.css'; // site styles load only on these pages; the app under /app has its own
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { viewer } from '@/lib/viewer';

// Rendered per request: the nav reflects the signed-in state, which comes from the session cookie.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Terms' };
export default async function Terms() {
  const v = await viewer();
  return (<><SiteNav signedIn={!!v} /><main className="wrap prose">
    <h1>Terms of service</h1>
    <p>This is a starting point, not legal advice. Have it reviewed before launch.</p>
    <h2>The service</h2><p>Ricorsa provides AI-generated answers with citations to third-party web pages. Answers can be wrong or incomplete; verify anything important before relying on it. Ricorsa is not a substitute for professional advice.</p>
    <h2>Gas and billing</h2><p>Ricorsa is prepaid. Every account starts with a grant of gas, the unit everything in Ricorsa is counted in; when it runs out you recharge, by card or through PayPal, at the rate shown on the Recharge page, and the gas you buy never expires. The Recharge Agreement sets out recharges, refunds, the card on file and auto-recharge, and you agree to it before each purchase. What each thing costs in gas is shown on the Recharge page and may change with notice. Enterprise is priced per organization under its own agreement; subscriptions taken out before October 7, 2026 run on their terms until canceled.</p>
    <h2>Acceptable use</h2><p>Do not use Ricorsa to harm others, break the law, or circumvent the meter. We may suspend accounts that abuse the service.</p>
    <h2>Your content</h2><p>You own what you write and the graph derived from it. You grant us the right to process it to run the service.</p>
  </main><SiteFooter /></>);
}
