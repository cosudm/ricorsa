import { Brand } from './Logo';

export function SiteNav({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="wrap">
      <nav className="topnav">
        <Brand />
        <div className="links">
          <a className="btn ghost hide-sm" href="/#how">How it works</a>
          <a className="btn ghost hide-sm" href="/#products">Products</a>
          <a className="btn ghost hide-sm" href="/pricing">Pricing</a>
          {signedIn ? (
            <>
              <a className="btn ghost" href="/account">Account</a>
              <a className="btn primary" href="/app">Open Ricorsa</a>
            </>
          ) : (
            <a className="btn" href="/auth/login?returnTo=/app">Sign in</a>
          )}
        </div>
      </nav>
    </div>
  );
}

/** The footer band: the tagline on the left, the graph that powers Ricorsa on the right, the legal links beneath. */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="foot-band">
          <span className="tag">Intelligence that stays yours.</span>
          <span className="powered">Powered by <b>SMEPro Identity Graph</b></span>
        </div>
        <div className="foot-legal">
          <span>© {new Date().getFullYear()} Ricorsa, an SMEPro company. Houston, TX.</span>
          <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:hello@ricorsa.com">hello@ricorsa.com</a> · <a href="mailto:enterprise@ricorsa.com">Enterprise</a></span>
        </div>
      </div>
    </footer>
  );
}
