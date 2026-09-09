/**
 * Live web retrieval runs inside the model call: Anthropic's web search server tool searches,
 * reads the pages, and cites them; src/lib/llm.ts turns the results into numbered sources and the
 * citations into [n] markers. This module only decides how much searching a turn is allowed.
 */
import type { SearchOpts } from './llm';

export type Source = { n: number; title: string; domain: string; url: string; snippet?: string };

/** How many searches a turn may run, by mode and focus. Writing focus answers without the web unless it is a Research turn. */
export function searchPlan(mode: 'search' | 'research', focus: string): SearchOpts | null {
  if (focus === 'writing' && mode !== 'research') return null;
  if (mode === 'research') return { maxUses: 10 };
  if (focus === 'math') return { maxUses: 2 };
  return { maxUses: 5 };
}
