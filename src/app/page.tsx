import './globals.css'; // site styles load only on these pages; the app under /app has its own
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { viewer } from '@/lib/viewer';
import { PLANS } from '@/lib/plans';

// Rendered per request: the nav reflects the signed-in state, which comes from the session cookie.
export const dynamic = 'force-dynamic';

/**
 * The landing page. One story, told three times at different depths: research the live web with citations,
 * let what you learn organise itself into a data asset you own, then turn that asset into working tools that
 * speak MCP. The hero shows the three stages on one example; the sections below explain each stage, place
 * Ricorsa between a search box and a software team, and put real situations in the reader's own words.
 */
export default async function Landing() {
  const v = await viewer();
  const signup = '/auth/login?screen_hint=signup&returnTo=/app';
  const start = v ? '/app' : signup;
  return (
    <>
      <SiteNav signedIn={!!v} />
      <main className="wrap">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">Research. Data asset. Working tools.</div>
            <h1>Research it properly. Keep what you learn. <em>Turn it into a tool.</em></h1>
            <p className="lede">Ricorsa sits in the middle, between a search box that hands you links and a software team you do not have. Ask a real question and it researches the live web with citations you can check. What you learn organises itself into a data asset you own. When you are ready, that asset becomes a working app, agent or dataset, and it speaks MCP, the same protocol your other AI tools use.</p>
            <div className="cta">
              <a className="btn primary lg" href={start}>{v ? 'Open Ricorsa' : 'Start free'}</a>
              <a className="btn lg" href="#how">See how it works</a>
            </div>
            <div className="fine">Free plan includes 10 questions a day. No card needed to start.</div>
          </div>

          <div className="flow" aria-label="From a question to a working tool, on one example">
            <div className="flow-tag">Example</div>
            <div className="stage">
              <div className="stage-k"><span className="n">1</span>Research</div>
              <p className="q">Which states changed their short-term rental rules this year, and what changed?</p>
              <div className="srcs">
                <div className="src"><b>Texas Legislature Online</b>capitol.texas.gov</div>
                <div className="src"><b>Florida DBPR licensing</b>myfloridalicense.com</div>
                <div className="src"><b>NYC Office of Special Enforcement</b>nyc.gov</div>
              </div>
              <div className="ans">Twelve states changed their rules this year, in three directions: moving licensing up to the state<span className="cite">2</span>, limiting how far a city can go in restricting hosts<span className="cite">1</span>, and adding registration duties and fines for platforms<span className="cite">3</span>. The table below lists each state, what changed and when it takes effect.</div>
            </div>
            <div className="flow-arrow" aria-hidden="true"><i /></div>
            <div className="stage asset">
              <div className="stage-k"><span className="n">2</span>Data asset</div>
              <div className="asset-h"><b>Short-term rental rules, 2026</b><span>34 rule changes · 61 sources · 12 states</span></div>
              <div className="chips">
                <span className="nchip"><i className="dot" style={{ background: 'var(--n-topic)' }} />state pre-emption</span>
                <span className="nchip"><i className="dot square" style={{ background: 'var(--n-entity)' }} />Texas Legislature</span>
                <span className="nchip"><i className="dot square" style={{ background: 'var(--n-entity)' }} />Florida DBPR</span>
                <span className="nchip"><i className="dot diamond" style={{ background: 'var(--n-goal)' }} />advise hosts by state</span>
                <span className="nchip"><i className="dot hex" style={{ background: 'var(--n-expertise)' }} />property management</span>
              </div>
              <div className="asset-f">Grows with every question. Yours to read, edit and export.</div>
            </div>
            <div className="flow-arrow" aria-hidden="true"><i /></div>
            <div className="stage tools">
              <div className="stage-k"><span className="n">3</span>Working tools</div>
              <div className="tool-grid">
                <div className="tool"><b>Rule checker</b><span>App: pick a state and an address, get the rules that apply and the source for each.</span></div>
                <div className="tool"><b>Change alert</b><span>Agent: watches the sources and tells you when a rule moves.</span></div>
                <div className="tool"><b>Rules dataset</b><span>Dataset: every change with its citation, ready for your own tools.</span></div>
              </div>
              <div className="asset-f">Built from the asset, checked in a real browser, on a live line to the model.</div>
            </div>
          </div>
        </section>

        <section className="section" id="middle">
          <h2>A search box stops at links. A software team starts from nothing. Ricorsa is the middle.</h2>
          <p className="sub">Most tools do one part of the job. Ricorsa does the three parts in a row, in the order you actually work.</p>
          <div className="middle">
            <div className="side">
              <div className="k">A search box</div>
              <p>Hands you ten links and a summary. Reading, checking and remembering are still on you, and tomorrow you start again from the same blank field.</p>
            </div>
            <div className="mid">
              <div className="k">Ricorsa</div>
              <p>Researches with citations you can open, keeps what it learned as a structured asset you own, and turns that asset into tools you can run, share and connect to the rest of your stack.</p>
              <a className="btn primary" href={start}>{v ? 'Open Ricorsa' : 'Try it free'}</a>
            </div>
            <div className="side">
              <div className="k">A software team</div>
              <p>Can build anything, in a few weeks, for a budget, once you can explain exactly what you want. Most research never gets that far.</p>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <h2>How it works</h2>
          <p className="sub">Three stages, one thread. You never leave the page, and nothing you learn gets lost between them.</p>
          <div className="steps">
            <div className="step">
              <div className="k">1. Research</div>
              <h3>Ask like you would ask a colleague</h3>
              <p>Ricorsa searches the live web, reads the pages, and answers with numbered citations that open the source. Attach your own files, connect a website or a document vault, and it reads those first. Research mode runs several searches and writes a full report.</p>
            </div>
            <div className="step">
              <div className="k">2. Structure</div>
              <h3>Your research becomes an asset</h3>
              <p>Every answer adds to a data asset you can read: the topics, people, organisations, goals and sources of your work, organised into Spaces for each client or project. It shapes how your next question is understood. Edit it, export it as JSON, forget any part of it.</p>
            </div>
            <div className="step">
              <div className="k">3. Build</div>
              <h3>Turn the asset into a working tool</h3>
              <p>Pick an idea from Discover or describe your own, and Ricorsa writes a working app, agent or dataset from what it knows, opens it in a real browser to check it, and keeps improving it with you in a chat. Built tools have a live line to the model, so they answer for real.</p>
            </div>
          </div>
        </section>

        <section className="section" id="protocols">
          <div className="proto">
            <div>
              <p className="big">Built on protocols your other tools already understand.</p>
              <p>MCP, the Model Context Protocol, is how AI tools talk to data and to each other. Ricorsa uses it in both directions, so the research you do here is never trapped here, and the tools you already pay for can join in.</p>
              <p>Nothing about your asset is locked in: export it whenever you like, and take it with you.</p>
            </div>
            <div className="diff">
              <div className="row"><b>Connect any MCP server</b><span>GitHub, Notion, a document vault, your own server. Answers use their tools when your question is about your own data.</span></div>
              <div className="row"><b>Any website becomes a connector</b><span>Point Ricorsa at a site or web app. It reads the pages, stands up an MCP server for them, and cites the page it used.</span></div>
              <div className="row"><b>Connectors per Space</b><span>Keep a client's sources unique to that client's Space, so nothing leaks between projects.</span></div>
              <div className="row"><b>Tools with a live line</b><span>Apps built here ask Ricorsa's model directly, with your context, so they work like the real thing because they are.</span></div>
            </div>
          </div>
        </section>

        <section className="section" id="who">
          <h2>Made for the way research actually goes</h2>
          <p className="sub">If one of these sounds like you, Ricorsa was built with you in mind.</p>
          <div className="who">
            <div className="case"><h3>“I need a defensible answer by Friday.”</h3><p>Every claim carries a citation that opens the page it came from. Research mode turns a hard question into a report you can hand to someone who will check it.</p></div>
            <div className="case"><h3>“I keep researching the same market from scratch.”</h3><p>Ricorsa remembers. Your asset carries what you learned last month into this month's question, and a Space per client keeps their work and their sources apart.</p></div>
            <div className="case"><h3>“I found something worth turning into a tool.”</h3><p>Describe it, or take one of the ideas Discover draws from your own asset, and get a working app, agent or dataset you can use, improve and share.</p></div>
            <div className="case"><h3>“My documents are the real source.”</h3><p>Attach PDFs, spreadsheets and decks, connect your document vault or a website, and answers read those before they read the web, citing the page.</p></div>
          </div>
        </section>

        <section className="section" id="enterprise">
          <h2>For organisations: the same loop, on a map</h2>
          <p className="sub">The same loop that learns a person can learn a network. Ricorsa Enterprise feeds looped data back into the SMEPro Identity Graph, maps direct and lateral relationships as they change, and anchors every node to geography: points, lines and polygons. <span className="geo" aria-hidden="true"><i className="pt" /><i className="ln" /><i className="pg" /></span></p>
          <div className="ent">
            <div className="case"><h3>Critical infrastructure and utilities</h3><p>Substations as points, grids as lines, tied to maintenance logs, weather risk and contractor identities. As field data feeds back in, the graph flags overlapping regional vulnerabilities before a failure.</p></div>
            <div className="case"><h3>Supply chain and fleet logistics</h3><p>Shifting corporate identities and freight manifests on moving lanes and geofenced hubs. A customs backup hitting a secondary supplier is inferred, and transit profiles recalculated, as the graph evolves.</p></div>
            <div className="case"><h3>Geospatial fraud and risk</h3><p>Financial entities and transaction behaviour linked to specific locations and high-risk zones. Fraud rings surface when unrelated identities keep landing on the same, highly specific vectors.</p></div>
            <div className="case"><h3>Smart cities and municipal planning</h3><p>Demographic, commercial and sensor data tied to zoning boundaries and transit corridors, so a change in one layer, such as a new permit, shows its effect on traffic and utility load across the whole graph.</p></div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 22 }}>
            <a className="btn primary lg" href="mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise">Talk to us about a deployment</a>
            <span className="note">Houston, TX. Deployments scoped to your data, your geography and your governance.</span>
          </div>
        </section>

        <section className="section" id="pricing">
          <h2>Plans</h2>
          <p className="sub">Start free. Upgrade when the daily limit gets in your way, or when you want to build.</p>
          <div className="plans">
            {Object.values(PLANS).map(p => (
              <div key={p.key} className={'plan' + (p.key === 'pro' ? ' hot' : '')}>
                <div className="name">{p.name}{p.key === 'pro' && <span className="tag">Most popular</span>}</div>
                <div className="price">${p.priceUsd}<small>/ month</small></div>
                <p className="blurb">{p.blurb}</p>
                <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
                <div className="buy"><a className={'btn ' + (p.key === 'pro' ? 'primary' : '')} href={p.key === 'free' ? start : '/pricing'}>{p.key === 'free' ? 'Start free' : `Get ${p.name}`}</a></div>
              </div>
            ))}
          </div>
        </section>

        <section className="section closing">
          <p className="big">Ask the question you have been putting off.</p>
          <p className="sub">The answer comes with its sources, the asset starts building itself, and the tool is one step further along than you think.</p>
          <a className="btn primary lg" href={start}>{v ? 'Open Ricorsa' : 'Start free'}</a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
