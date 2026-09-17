'use client';
import { useState } from 'react';

type Group = { key: string; label: string; prompts: string[] };

/**
 * Sample questions by the kind of work. Each "Ask Ricorsa" carries the question into the app's composer
 * (/app?q=…), through sign-up first for a visitor; nothing is sent until the person presses send.
 */
export function TryRicorsa({ groups, signedIn }: { groups: Group[]; signedIn: boolean }) {
  const [active, setActive] = useState(groups[0]?.key || '');
  const group = groups.find(g => g.key === active) || groups[0];
  const hrefFor = (q: string) => {
    const app = '/app?q=' + encodeURIComponent(q);
    return signedIn ? app : '/auth/login?screen_hint=signup&returnTo=' + encodeURIComponent(app);
  };
  return (
    <div className="try">
      <div className="try-tabs" role="tablist" aria-label="Kind of work">
        {groups.map(g => (
          <button key={g.key} type="button" role="tab" aria-selected={g.key === group.key} className={'try-tab' + (g.key === group.key ? ' on' : '')} onClick={() => setActive(g.key)}>{g.label}</button>
        ))}
      </div>
      <div className="try-grid" role="tabpanel">
        {group.prompts.map(q => (
          <div key={q} className="try-card">
            <p>{q}</p>
            <a className="btn sm" href={hrefFor(q)}>Ask Ricorsa</a>
          </div>
        ))}
      </div>
    </div>
  );
}
