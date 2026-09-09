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
    <h2>Plans and billing</h2><p>Paid plans are billed monthly through PayPal and renew automatically until cancelled. Usage limits per plan are shown on the pricing page and may change with notice. Cancel any time from your Account page; access continues until the end of the paid period where PayPal reports it that way.</p>
    <h2>Acceptable use</h2><p>Do not use Ricorsa to harm others, break the law, or circumvent the limits of your plan. We may suspend accounts that abuse the service.</p>
    <h2>Your content</h2><p>You own what you write and the graph derived from it. You grant us the right to process it to run the service.</p>
  </main><SiteFooter /></>);
}
