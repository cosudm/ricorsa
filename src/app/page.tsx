import './globals.css'; // site styles load only on these pages; the app under /app has its own
import { SiteNav, SiteFooter } from '@/components/SiteNav';
import { viewer } from '@/lib/viewer';
import { PLANS } from '@/lib/plans';

// Rendered per request: the nav reflects the signed-in state, which comes from the session cookie.
export const dynamic = 'force-dynamic';

export default async function Landing() {
  const v = await viewer();
  const signup = '/auth/login?screen_hint=signup&returnTo=/app';
  return (
    <>
      <SiteNav signedIn={!!v} />
      <main className="wrap">
        <section className="hero">
          <div>
            <h1>Ask anything. Be understood a little better <em>each time.</em></h1>
            <p className="lede">Ricorsa is an answer engine with live web citations built on the SMEPro Identity Graph. Every question feeds a recursive learning loop that makes the graph smarter, not the model, and the intelligence it builds stays yours.</p>
            <div className="cta">
              <a className="btn primary lg" href={v ? '/app' : signup}>{v ? 'Open Ricorsa' : 'Start free'}</a>
              <a className="btn lg" href="/pricing">See pricing</a>
            </div>
            <div className="fine">Free plan includes 10 questions a day. No card needed to start.</div>
          </div>
          <div className="demo" aria-label="Example answer">
            <p className="q">Why do kestrels hover in place?</p>
            <div className="srcs">
              <div className="src"><b>Common kestrel</b>en.wikipedia.org</div>
              <div className="src"><b>Kestrel</b>rspb.org.uk</div>
              <div className="src"><b>All About Birds</b>allaboutbirds.org</div>
            </div>
            <div className="ans">Kestrels hover by flying into the wind at the wind&rsquo;s own speed, so their ground speed drops to zero while air keeps flowing over their wings<span className="cite">1</span>. The head stays almost perfectly still while the body rides the gusts, which keeps the image of the ground stable enough to spot a vole from twenty metres up<span className="cite">2</span><span className="cite">3</span>.</div>
            <div className="learned"><b>Learned from this exchange</b><span className="nchip"><i className="dot" style={{ background: 'var(--n-topic)' }} />birds of prey</span><span className="nchip"><i className="dot diamond" style={{ background: 'var(--n-goal)' }} />explain science simply</span><span className="nchip"><i className="dot hex" style={{ background: 'var(--n-expertise)' }} />biology · novice</span></div>
          </div>
        </section>

        <section className="section" id="how">
          <h2>How it works</h2>
          <p className="sub">Three things happen every time you ask. Only the third one is new.</p>
          <div className="steps">
            <div className="step"><div className="k">1. Ask</div><h3>Search or Research</h3><p>Type a question. Ricorsa searches the live web, reads the results, and picks the model that fits: fast for simple questions, deeper reasoning for hard ones, a full report in Research mode.</p></div>
            <div className="step"><div className="k">2. Answer</div><h3>Sourced, streamed, citable</h3><p>The answer streams in with numbered citations that point at real pages retrieved moments ago. Follow up in the same thread, save it to a Space, export it as Markdown.</p></div>
            <div className="step"><div className="k">3. Learn</div><h3>Your graph gets sharper</h3><p>Each exchange records what it revealed about what you are working on. That merges into your identity graph, which shapes how your next question is read.</p></div>
          </div>
        </section>

        <section className="section">
          <div className="loop">
            <div>
              <p className="big">The model does not get smarter. You do.</p>
              <p>Every other assistant keeps what it learns about you inside a model you cannot see, move, or delete. Ricorsa keeps it in a graph you can read: topics, entities, goals, expertise, the way you like answers. Weights strengthen when something comes up again and fade when it stops mattering.</p>
              <p>Pause it, edit it, export it, or wipe it. It is folded into every prompt so your intent is read better each time, and it is portable, which is what makes it worth building on.</p>
            </div>
            <div className="diff">
              <div className="row"><b>Live citations</b><span>Sources are fetched when you ask, not recalled from training.</span></div>
              <div className="row"><b>Recursive learning</b><span>Answer, learn, fold back in. A closed loop you can inspect.</span></div>
              <div className="row"><b>Yours to keep</b><span>Export the graph as JSON, forget any node, reset the whole thing.</span></div>
              <div className="row"><b>Discover from your graph</b><span>See what your graph could become: agents, tools, decentralized apps, credentials.</span></div>
            </div>
          </div>
        </section>


        <section className="section" id="enterprise">
          <h2>The Spatial Identity Graph, for the enterprise</h2>
          <p className="sub">The same loop that learns a person can learn a network. Ricorsa Enterprise drives looped data back into the SMEPro Identity Graph, maps direct and lateral relationships as they change, and anchors every node to geography: points, lines and polygons. <span className="geo" aria-hidden="true"><i className="pt" /><i className="ln" /><i className="pg" /></span></p>
          <div className="ent">
            <div className="case"><h3>Critical infrastructure and utilities</h3><p><b>The spatial graph</b> connects physical assets (substations as points, grids as lines) to lateral data: maintenance logs, weather risk, contractor identities.</p><p><b>The loop effect</b>: as field data feeds back in, the graph flags systemic or overlapping regional vulnerabilities before a failure.</p></div>
            <div className="case"><h3>Supply chain and fleet logistics</h3><p><b>The spatial graph</b> maps shifting corporate identities and freight manifests onto moving lanes (lines) and geofenced hubs (polygons).</p><p><b>The loop effect</b>: lateral delays, like a customs backup hitting a secondary supplier, are inferred and transit profiles recalculated as the graph evolves.</p></div>
            <div className="case"><h3>Geospatial fraud and risk</h3><p><b>The spatial graph</b> links financial entities and transaction behavior to specific locations (points) and high-risk zones (polygons).</p><p><b>The loop effect</b>: fraud rings surface when unrelated identities keep landing on the same, highly specific geospatial vectors.</p></div>
            <div className="case"><h3>Smart cities and municipal planning</h3><p><b>The spatial graph</b> ties demographic, commercial and sensor data to zoning boundaries (polygons) and transit corridors (lines).</p><p><b>The loop effect</b>: planners simulate how a change in one layer, such as a new commercial permit, laterally moves traffic and utility load across the whole graph.</p></div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 22 }}>
            <a className="btn primary lg" href="mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise">Talk to us about a deployment</a>
            <span className="note">Houston, TX. Deployments scoped to your data, your geography and your governance.</span>
          </div>
        </section>

        <section className="section" id="pricing">
          <h2>Plans</h2>
          <p className="sub">Start free. Upgrade when the daily limit gets in your way.</p>
          <div className="plans">
            {Object.values(PLANS).map(p => (
              <div key={p.key} className={'plan' + (p.key === 'pro' ? ' hot' : '')}>
                <div className="name">{p.name}{p.key === 'pro' && <span className="tag">Most popular</span>}</div>
                <div className="price">${p.priceUsd}<small>/ month</small></div>
                <p className="blurb">{p.blurb}</p>
                <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
                <div className="buy"><a className={'btn ' + (p.key === 'pro' ? 'primary' : '')} href={p.key === 'free' ? (v ? '/app' : signup) : '/pricing'}>{p.key === 'free' ? 'Start free' : `Get ${p.name}`}</a></div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
