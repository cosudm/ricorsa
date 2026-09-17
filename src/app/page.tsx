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
          <p className="sub">Three stages, one thread. Nothing you learn gets lost between them.</p>
          <div className="stages">
            <div className="stage-c">
              <div className="k"><span className="n">1</span>Research</div>
              <h3>Ask, and get an answer you can check</h3>
              <p>Ricorsa searches the live web, reads the pages, and answers with numbered citations that open the source. Attach files, or connect a website or a document vault, and it reads those first.</p>
              <div className="mini">
                <div className="src"><b>capitol.texas.gov</b>Texas Legislature Online</div>
                <div className="src"><b>nyc.gov</b>Office of Special Enforcement</div>
              </div>
            </div>
            <div className="stage-c">
              <div className="k"><span className="n">2</span>Data asset</div>
              <h3>What you learn stays, and stays yours</h3>
              <p>Every answer adds to an asset you can read: the topics, people, organizations, goals and sources of your work, kept in Spaces per client or project. It shapes how the next question is understood. Edit it, export it, forget any part of it.</p>
              <div className="mini chips">
                <span className="nchip"><i className="dot" style={{ background: 'var(--n-topic)' }} />state pre-emption</span>
                <span className="nchip"><i className="dot square" style={{ background: 'var(--n-entity)' }} />Florida DBPR</span>
                <span className="nchip"><i className="dot diamond" style={{ background: 'var(--n-goal)' }} />advise hosts by state</span>
              </div>
            </div>
            <div className="stage-c">
              <div className="k"><span className="n">3</span>Working tools</div>
              <h3>Turn the asset into something that runs</h3>
              <p>Describe a tool, or pick an idea Ricorsa draws from your asset, and get a working app, agent or dataset, checked in a real browser and improved with you in a chat. It speaks MCP, so your other AI tools can join in.</p>
              <div className="mini tools">
                <span className="tool-pill">Rule checker · app</span>
                <span className="tool-pill">Change alert · agent</span>
                <span className="tool-pill">Rules dataset</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section-c wrap" id="products">
          <h2>What Ricorsa gives you</h2>
          <p className="sub">One place to ask, keep and build. Each part works on its own; together they carry a question through to a tool.</p>
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
          <p className="sub">Get to know it with a few sample questions. Each one lands in the composer, ready to send.</p>
          <TryRicorsa groups={SAMPLE_PROMPTS} signedIn={!!v} />
        </section>

        <section className="section-c wrap middle-c">
          <p className="big">Ricorsa sits in the middle: between a search box that hands you links, and a software team you do not have.</p>
          <p className="sub">Research it properly, keep what you learn, turn it into a tool. Organizations run the same loop on a map with the SMEPro Identity Graph; <a href="mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise">talk to us about a deployment</a>.</p>
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
