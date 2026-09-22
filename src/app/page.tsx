import './globals.css'; // site styles load only on these pages; the app under /app has its own
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { TryRicorsa } from '@/components/TryRicorsa';
import { viewer } from '@/lib/viewer';
import { PRODUCTS, SAMPLE_PROMPTS } from '@/lib/products';

// Rendered per request: the nav reflects the signed-in state, which comes from the session cookie.
export const dynamic = 'force-dynamic';

/**
 * The landing page: one centered promise, two buttons, and below the fold the three stages in the fewest words
 * that still say what happens (research with citations, a data asset you own, working tools that speak MCP).
 * Plans live on /pricing; the footer carries the tagline and the SMEPro Identity Graph line.
 */
export default async function Landing() {
  const v = await viewer();
  const signup = '/auth/login?screen_hint=signup&returnTo=/app';
  const start = v ? '/app' : signup;
  return (
    <>
      <SiteNav signedIn={!!v} />
      <main>
        <section className="hero-c wrap">
          <h1>Answers that <span className="hl">understand you.</span></h1>
          <p className="lede">Live web answers. More personal with every conversation.</p>
          <div className="cta">
            <a className="btn primary lg" href={start}>{v ? 'Open Ricorsa' : 'Start free'}</a>
            <a className="btn lg" href="#how">How it works</a>
          </div>
          <div className="fine">14-day free trial on every plan. Cancel any time.</div>
        </section>

        <section className="section-c wrap" id="how">
          <h2>How it works</h2>
          <p className="sub">Research, data asset, working tools.</p>
          <div className="stages">
            <div className="stage-c">
              <div className="k"><span className="n">1</span>Research</div>
              <h3>Ask a question</h3>
              <p>Ricorsa searches the live web and answers with numbered citations that open the source page. Files, websites and document vaults are read first.</p>
              <div className="mini">
                <div className="src"><b>capitol.texas.gov</b>Texas Legislature Online</div>
                <div className="src"><b>nyc.gov</b>Office of Special Enforcement</div>
              </div>
            </div>
            <div className="stage-c">
              <div className="k"><span className="n">2</span>Data asset</div>
              <h3>Keep what you learn</h3>
              <p>Each answer adds to a graph you can read: topics, entities, goals, sources. It is yours to edit, export or delete.</p>
              <div className="mini chips">
                <span className="nchip"><i className="dot" style={{ background: 'var(--n-topic)' }} />state pre-emption</span>
                <span className="nchip"><i className="dot square" style={{ background: 'var(--n-entity)' }} />Florida DBPR</span>
                <span className="nchip"><i className="dot diamond" style={{ background: 'var(--n-goal)' }} />advise hosts by state</span>
              </div>
            </div>
            <div className="stage-c">
              <div className="k"><span className="n">3</span>Working tools</div>
              <h3>Build a tool</h3>
              <p>Turn the graph into an app, agent or dataset. Built in the studio, tested in a browser, connected over MCP.</p>
              <div className="mini tools">
                <span className="tool-pill">Rule checker · app</span>
                <span className="tool-pill">Change alert · agent</span>
                <span className="tool-pill">Rules dataset</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section-c wrap" id="products">
          <h2>Products</h2>
          <div className="products">
            {PRODUCTS.map(p => (
              <div key={p.slug} className="product">
                <h3>{p.name}</h3>
                <p>{p.blurb}</p>
                <a className="more" href={`/product/${p.slug}`}>Learn more<span aria-hidden="true"> →</span></a>
              </div>
            ))}
          </div>
        </section>

        <section className="section-c wrap" id="try">
          <h2>Try Ricorsa</h2>
          <p className="sub">Sample questions. Each opens in the composer.</p>
          <TryRicorsa groups={SAMPLE_PROMPTS} signedIn={!!v} />
        </section>

        <section className="section-c wrap middle-c">
          <p className="big">Ricorsa sits in the middle: between a search box that hands you links, and a software team you do not have.</p>
          <p className="sub">For organizations, the same graph on a map. <a href="mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise">Contact us</a>.</p>
          <div className="cta">
            <a className="btn primary lg" href={start}>{v ? 'Open Ricorsa' : 'Start free'}</a>
            <a className="btn lg" href="/pricing">See plans</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
