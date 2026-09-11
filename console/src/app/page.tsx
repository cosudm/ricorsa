import Script from 'next/script';

export const dynamic = 'force-dynamic';

/** The console shell. The app in /public/console renders into #app and talks to /api/*. */
const SHELL = `<div id="app"><div class="boot"><div class="spinner"></div><div>Opening the console</div></div></div><div id="modalRoot"></div><div id="toasts" aria-live="polite"></div><input type="file" id="fileInput" hidden>`;

export default function ConsolePage() {
  return (
    <>
      <link rel="stylesheet" href="/console/app.css" />
      <div dangerouslySetInnerHTML={{ __html: SHELL }} />
      <Script src="/console/app.js" strategy="afterInteractive" />
    </>
  );
}
