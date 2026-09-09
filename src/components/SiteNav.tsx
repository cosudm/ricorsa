import { Brand } from './Logo';

export function SiteNav({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="wrap">
      <nav className="topnav">
        <Brand />
        <div className="links">
          <a className="btn ghost hide-sm" href="/#how">How it works</a>
          <a className="btn ghost hide-sm" href="/#enterprise">Enterprise</a>
          <a className="btn ghost hide-sm" href="/pricing">Pricing</a>
          {signedIn ? (
            <>
              <a className="btn ghost" href="/account">Account</a>
              <a className="btn ghost hide-sm" href="/auth/logout" title="Sign out of this account">Sign out</a>
              <a className="btn primary" href="/app">Open Ricorsa</a>
            </>
          ) : (
            <>
              <a className="btn ghost" href="/auth/login?returnTo=/app">Sign in</a>
              <a className="btn primary" href="/auth/login?screen_hint=signup&returnTo=/app">Start free</a>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}

export function SiteFooter() {
  return (
    <div className="wrap">
      <footer>
        <span>© {new Date().getFullYear()} Ricorsa, an SMEPro company. Houston, TX.</span>
        <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:hello@ricorsa.com">hello@ricorsa.com</a> · <a href="mailto:enterprise@ricorsa.com">Enterprise</a></span>
      </footer>
    </div>
  );
}
