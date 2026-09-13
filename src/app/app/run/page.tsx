import type { Metadata } from 'next';
import Script from 'next/script';

export const metadata: Metadata = { title: 'Ricorsa' };
export const dynamic = 'force-dynamic';

/**
 * A built app in its own tab: /app/run#<version id>. The document is fetched with the person's session, shown in
 * a sandboxed frame like the studio's, and given the same live line to Ricorsa's model (window.ricorsa.ask).
 */
const SHELL = `
<style>
  html, body { height: 100%; margin: 0; background: #fbfbf9; }
  .run-bar { position: fixed; inset: 0 0 auto 0; height: 36px; display: flex; align-items: center; gap: 10px; padding: 0 12px; font: 13px system-ui, sans-serif; color: #55606b; background: #fff; border-bottom: 1px solid #e5e5df; z-index: 2; }
  .run-bar b { color: #1b2228; font-weight: 600; }
  .run-bar a { color: #2d5f8a; text-decoration: none; margin-left: auto; }
  .run-frame { position: fixed; inset: 36px 0 0 0; width: 100%; height: calc(100% - 36px); border: 0; background: #fff; }
  .run-note { position: fixed; inset: 36px 0 0 0; display: grid; place-items: center; font: 15px system-ui, sans-serif; color: #55606b; }
</style>
<div class="run-bar"><b data-run-title>Ricorsa</b><span data-run-sub></span><a href="/app#/discover">Back to Ricorsa</a></div>
<div class="run-note" data-run-note>Opening the app</div>
<iframe class="run-frame" data-run-frame sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads" title="Your app" referrerpolicy="no-referrer" hidden></iframe>
`;

const RUNNER = `
(function () {
  var ref = decodeURIComponent((location.hash || '').replace(/^#\\/?/, '')).trim();
  var id = ref.split(':')[0], version = ref.split(':')[1] || '';
  var note = document.querySelector('[data-run-note]'), frame = document.querySelector('[data-run-frame]'), title = document.querySelector('[data-run-title]'), sub = document.querySelector('[data-run-sub]');
  if (!id) { note.textContent = 'No app was named. Open one from the Build studio.'; return; }
  var buildId = id;
  if (window.RicorsaBridge) window.RicorsaBridge.host(function () { return frame; }, function () { return buildId; });
  fetch('/api/builds/' + encodeURIComponent(id) + (version ? '?version=' + encodeURIComponent(version) : ''), { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? 'This app is not in your account.' : 'The app could not be loaded (' + r.status + ').'); return r.json(); }).then(function (j) {
    var cur = j.current || {};
    var html = cur.html || '';
    if (!html) throw new Error('This version has no document yet.');
    buildId = cur.id || id;
    title.textContent = (j.session && j.session.title) || 'Your app';
    sub.textContent = cur.version ? 'v' + cur.version : '';
    document.title = ((j.session && j.session.title) || 'Your app') + ' · Ricorsa';
    frame.srcdoc = window.RicorsaBridge ? window.RicorsaBridge.wrap(html) : html;
    frame.hidden = false; note.hidden = true;
  }).catch(function (e) { note.textContent = (e && e.message) || 'The app could not be loaded.'; });
})();
`;

export default function RunPage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: SHELL }} />
      <Script src="/app/assets/bridge.js" strategy="beforeInteractive" />
      <Script id="ricorsa-runner" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: RUNNER }} />
    </>
  );
}
