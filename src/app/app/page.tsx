import type { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = { title: 'Ricorsa' };
export const dynamic = 'force-dynamic';

/** The app shell. The vanilla app in /public/app/assets renders into #main and talks to /api/*. */
const SHELL = `
<div id="app">
  <div class="scrim" id="scrim"></div>
  <nav id="sidebar" aria-label="Main">
    <div class="brand">
      <a class="brand-link" href="#/" aria-label="Ricorsa home"><span class="logomark" data-logo></span><span class="wordmark">ricorsa</span></a>
      <button class="collapse-btn" id="collapseBtn" aria-label="Collapse sidebar" title="Collapse sidebar"></button>
    </div>
    <button class="new-thread tip" id="newThreadBtn" data-tip="New Thread" title="Start a new question (Ctrl K)" aria-label="New thread"><span data-icon="plus"></span><span class="grow">New Thread</span><kbd id="kbdHint">Ctrl K</kbd></button>
    <div class="nav">
      <a class="nav-item tip" href="#/" data-route="home" data-tip="Home" title="Home: ask a new question"><span class="ico" data-icon="home"></span><span class="lbl">Home</span></a>
      <a class="nav-item tip" href="#/discover" data-route="discover" data-tip="Discover" title="Discover: things you could build from your identity graph"><span class="ico" data-icon="compass"></span><span class="lbl">Discover</span></a>
      <a class="nav-item tip" href="#/spaces" data-route="spaces" data-tip="Spaces" title="Spaces: group threads under standing instructions"><span class="ico" data-icon="layers"></span><span class="lbl">Spaces</span></a>
      <a class="nav-item tip" href="#/library" data-route="library" data-tip="Library" title="Library: every thread you have started"><span class="ico" data-icon="library"></span><span class="lbl">Library</span></a>
      <a class="nav-item tip" href="#/graph" data-route="graph" data-tip="Your graph" title="Graph: what Ricorsa has learned about you, and the controls for it"><span class="ico" data-icon="loop"></span><span class="lbl">Graph</span></a>
      <a class="nav-item tip" href="#/connectors" data-route="connectors" data-tip="Connectors" title="Connectors: link outside apps and MCP servers so answers can use your own data"><span class="ico" data-icon="plug"></span><span class="lbl">Connectors</span></a>
    </div>
    <div class="recent" id="recent"></div>
    <div class="side-bottom">
      <a class="upgrade-row tip" id="upgradeRow" href="/pricing" data-tip="Upgrade" title="Higher limits, Research mode and the Reasoning model" hidden><span data-icon="sparkles"></span><span>Upgrade to Pro</span></a>
      <button class="nav-item tip" id="settingsBtn" data-tip="Settings" title="Settings: default mode, model, focus and answer length"><span class="ico" data-icon="settings"></span><span class="lbl">Settings</span></button>
      <button class="nav-item tip" id="acctRow" data-tip="Account" title="Account: plan, billing, export and sign out"><span class="avatar">Y</span><span class="lbl">Account</span></button>
    </div>
  </nav>
  <main id="main"></main>
</div>
<div id="modalRoot"></div>
<div id="toasts" aria-live="polite"></div>
<input type="file" id="fileInput" accept="image/*" multiple hidden>
`;

export default function AppPage() {
  return (
    <>
      <link rel="stylesheet" href="/app/assets/app.css" />
      <div dangerouslySetInnerHTML={{ __html: SHELL }} />
      <Script src="/app/assets/app.js" strategy="afterInteractive" />
    </>
  );
}
