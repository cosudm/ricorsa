/**
 * An example brain for the landing page: what fourteen months of one professional's work looks like inside Ricorsa.
 * Every node is fictional and plainly labeled as an example on the page; the shape of the data (kinds, weights,
 * timestamps, Spaces, pathways) is exactly what the living brain draws for a real account, so what a visitor
 * watches is what they get.
 */
export type SampleNode = { id: string; kind: 'topic' | 'entity' | 'goal' | 'expertise' | 'style' | 'thread' | 'build' | 'connector' | 'intent'; label: string; weight: number; count: number; firstSeen: number; lastSeen: number; level?: string; spaceId?: string | null; origin?: string | null };
export type SampleModel = { nodes: SampleNode[]; edges: Array<{ a: string; b: string; weight: number; at?: number }>; spaces: Array<{ id: string; name: string }>; org: { name: string } };

const DAY = 86400000;

export function sampleBrain(now = Date.now()): SampleModel {
  const d = (daysAgo: number) => now - daysAgo * DAY;
  const spaces = [{ id: 'sp1', name: 'Bayou Logistics Park' }, { id: 'sp2', name: 'Permian minerals' }, { id: 'sp3', name: 'Workforce grant' }];
  const threads: Array<[string, string, number, number, number, string | null]> = [
    // id, title, first (days ago), last (days ago), turns, space
    ['t1', 'Industrial absorption in Houston submarkets', 410, 395, 6, 'sp1'],
    ['t2', 'Cap rate ranges for 40-unit multifamily, San Antonio', 380, 380, 3, null],
    ['t3', 'Title diligence checklist for mineral acquisitions', 350, 210, 9, 'sp2'],
    ['t4', 'Which short-term rental rules changed this year', 330, 330, 4, null],
    ['t5', 'Lease comps along the Port Houston corridor', 300, 120, 11, 'sp1'],
    ['t6', 'ERCOT load forecast and data center demand', 270, 265, 5, null],
    ['t7', 'Grant compliance timeline, Department of Labor', 240, 60, 8, 'sp3'],
    ['t8', 'Summarize the Diamondback lease amendments', 205, 205, 4, 'sp2'],
    ['t9', 'Draft the workforce program narrative', 180, 45, 12, 'sp3'],
    ['t10', 'Compare Lamar and Sam Houston State program outcomes', 160, 158, 5, 'sp3'],
    ['t11', 'Which depositions mention the warehouse, and where', 130, 128, 3, 'sp1'],
    ['t12', 'Royalty statements against production volumes', 110, 30, 10, 'sp2'],
    ['t13', 'Tenant improvement allowance norms, 2026', 95, 95, 4, 'sp1'],
    ['t14', 'Build a rule checker for short-term rentals', 80, 78, 7, null],
    ['t15', 'Map AI roles employers are hiring for in Texas', 60, 58, 6, 'sp3'],
    ['t16', 'Data room index for the minerals package', 40, 12, 9, 'sp2'],
    ['t17', 'Bayou park lease: final redline points', 21, 3, 8, 'sp1'],
    ['t18', 'Investor update: what changed this quarter', 9, 2, 5, null],
    ['t19', 'Weekly brief on my topics', 4, 1, 3, null],
  ];
  const nodes: SampleNode[] = [];
  for (const [id, title, f, l, turns, sp] of threads) nodes.push({ id: 'thread:' + id, kind: 'thread', label: title, weight: Math.min(1, 0.22 + 0.05 * Math.min(8, turns) + 0.3 * Math.max(0, 1 - l / 60)), count: turns, firstSeen: d(f), lastSeen: d(l), spaceId: sp });
  const learned: Array<[string, SampleNode['kind'], string, number, number, number, number, string, string?]> = [
    // id, kind, label, weight, count, first, last, origin thread, level
    ['topic:absorption', 'topic', 'industrial absorption', 0.82, 9, 410, 3, 't1'],
    ['topic:caprates', 'topic', 'cap rates', 0.55, 4, 380, 95, 't2'],
    ['topic:minerals', 'topic', 'mineral rights', 0.9, 12, 350, 12, 't3'],
    ['topic:diligence', 'topic', 'title diligence', 0.7, 7, 350, 40, 't3'],
    ['topic:str', 'topic', 'short-term rental rules', 0.6, 5, 330, 78, 't4'],
    ['topic:leasing', 'topic', 'lease comps', 0.78, 8, 300, 3, 't5'],
    ['topic:ercot', 'topic', 'ERCOT load forecasts', 0.42, 3, 270, 265, 't6'],
    ['topic:grants', 'topic', 'grant compliance', 0.66, 6, 240, 45, 't7'],
    ['topic:royalty', 'topic', 'royalty audits', 0.58, 5, 110, 30, 't12'],
    ['topic:ti', 'topic', 'tenant improvements', 0.4, 2, 95, 95, 't13'],
    ['topic:mcp', 'topic', 'MCP servers', 0.45, 3, 80, 12, 't14'],
    ['topic:workforce', 'topic', 'workforce data', 0.5, 4, 60, 45, 't15'],
    ['exp:leasing', 'expertise', 'commercial leasing', 0.85, 10, 300, 3, 't5', 'expert'],
    ['exp:energy', 'expertise', 'energy diligence', 0.6, 6, 350, 30, 't3', 'intermediate'],
    ['exp:grants', 'expertise', 'grant writing', 0.5, 4, 180, 45, 't9', 'intermediate'],
    ['ent:hcad', 'entity', 'Harris County Appraisal District', 0.5, 4, 410, 120, 't1'],
    ['ent:port', 'entity', 'Port Houston', 0.7, 7, 300, 3, 't5'],
    ['ent:diamondback', 'entity', 'Diamondback Energy', 0.6, 5, 205, 30, 't8'],
    ['ent:dol', 'entity', 'Department of Labor', 0.55, 5, 240, 45, 't7'],
    ['ent:lamar', 'entity', 'Lamar University', 0.62, 6, 160, 45, 't10'],
    ['ent:shsu', 'entity', 'Sam Houston State', 0.3, 2, 160, 158, 't10'],
    ['ent:ercot', 'entity', 'ERCOT', 0.4, 3, 270, 265, 't6'],
    ['ent:vault', 'entity', 'VDRPros Vault', 0.5, 4, 130, 12, 't11'],
    ['ent:pearland', 'entity', 'City of Pearland', 0.3, 2, 330, 330, 't4'],
    ['ent:reeves', 'entity', 'Reeves County', 0.45, 4, 350, 12, 't3'],
    ['ent:investors', 'entity', 'the investor group', 0.5, 3, 9, 2, 't18'],
    ['goal:lease', 'goal', 'close the Bayou park lease', 0.9, 8, 300, 3, 't5'],
    ['goal:dataroom', 'goal', 'package the minerals data room', 0.75, 6, 110, 12, 't12'],
    ['goal:grant', 'goal', 'win the workforce grant', 0.7, 7, 240, 45, 't7'],
    ['goal:brief', 'goal', 'a weekly brief on my topics', 0.45, 2, 4, 1, 't19'],
    ['style:short', 'style', 'short answers, numbers first', 0.7, 9, 380, 2, 't2'],
    ['style:cite', 'style', 'cite the statute', 0.6, 6, 330, 45, 't4'],
  ];
  for (const [id, kind, label, weight, count, f, l, origin, level] of learned) nodes.push({ id, kind, label, weight, count, firstSeen: d(f), lastSeen: d(l), origin, level });
  const builds: Array<[string, string, number, number]> = [['b1', 'Short-term rental rule checker', 78, 60], ['b2', 'Absorption tracker', 100, 20], ['b3', 'Data room index agent', 38, 12], ['b4', 'Grant timeline board', 55, 45]];
  for (const [id, title, f, l] of builds) nodes.push({ id: 'build:' + id, kind: 'build', label: title, weight: 0.55, count: 3, firstSeen: d(f), lastSeen: d(l) });
  const connectors: Array<[string, string, number]> = [['c1', 'VDRPros Vault', 130], ['c2', 'Notion', 200], ['c3', 'GitHub', 82]];
  for (const [id, name, f] of connectors) nodes.push({ id: 'conn:' + id, kind: 'connector', label: name, weight: 0.45, count: 1, firstSeen: d(f), lastSeen: d(Math.max(1, f - 100)) });
  const intents: Array<[string, number, string]> = [
    ['deciding whether the Bayou park lease terms hold up against the corridor comps', 3, 't17'],
    ['getting the minerals data room ready for the investor group', 12, 't16'],
    ['keeping the grant on its compliance timeline', 45, 't7'],
    ['turning the rental rules research into a tool the team can use', 78, 't14'],
    ['understanding what ERCOT demand means for industrial land', 265, 't6'],
    ['checking royalty statements against reported production', 30, 't12'],
    ['comparing the two universities before choosing a partner', 158, 't10'],
    ['writing the quarterly investor update', 2, 't18'],
  ];
  intents.forEach(([text, ago, th], i) => nodes.push({ id: 'intent:' + i, kind: 'intent', label: text, weight: 0.45 - i * 0.02, count: 1, firstSeen: d(ago), lastSeen: d(ago), origin: th }));
  const edges: SampleModel['edges'] = [];
  const link = (a: string, b: string, w: number, ago: number) => edges.push({ a, b, weight: w, at: d(ago) });
  // Pathways between learned nodes.
  const pairs: Array<[string, string, number, number]> = [
    ['topic:absorption', 'ent:port', 0.8, 300], ['topic:absorption', 'topic:leasing', 0.7, 300], ['topic:leasing', 'goal:lease', 0.9, 21], ['topic:leasing', 'exp:leasing', 0.8, 120], ['ent:port', 'goal:lease', 0.7, 21], ['topic:ti', 'topic:leasing', 0.4, 95], ['ent:hcad', 'topic:absorption', 0.5, 395],
    ['topic:minerals', 'topic:diligence', 0.9, 210], ['topic:minerals', 'ent:reeves', 0.6, 210], ['topic:minerals', 'ent:diamondback', 0.6, 205], ['topic:royalty', 'topic:minerals', 0.7, 30], ['topic:royalty', 'goal:dataroom', 0.7, 30], ['topic:diligence', 'exp:energy', 0.7, 210], ['goal:dataroom', 'ent:vault', 0.6, 12], ['goal:dataroom', 'ent:investors', 0.6, 9],
    ['topic:grants', 'ent:dol', 0.8, 60], ['topic:grants', 'goal:grant', 0.9, 45], ['goal:grant', 'ent:lamar', 0.7, 45], ['topic:workforce', 'ent:lamar', 0.6, 58], ['topic:workforce', 'goal:grant', 0.6, 58], ['exp:grants', 'goal:grant', 0.7, 45], ['ent:shsu', 'ent:lamar', 0.4, 158],
    ['topic:str', 'ent:pearland', 0.5, 330], ['topic:str', 'topic:mcp', 0.5, 78], ['topic:ercot', 'ent:ercot', 0.7, 265], ['topic:ercot', 'topic:absorption', 0.4, 265], ['style:short', 'goal:brief', 0.4, 4], ['style:cite', 'topic:str', 0.5, 330],
  ];
  for (const [a, b, w, ago] of pairs) link(a, b, w, ago);
  // Learned nodes to the conversations that taught them; intents to their conversations; builds to their goals.
  for (const n of nodes) if (n.origin && nodes.some(x => x.id === 'thread:' + n.origin)) link(n.id, 'thread:' + n.origin, n.kind === 'intent' ? 0.25 : 0.35, (now - n.firstSeen) / DAY);
  link('build:b1', 'topic:str', 0.5, 78); link('build:b2', 'topic:absorption', 0.5, 100); link('build:b3', 'goal:dataroom', 0.6, 38); link('build:b4', 'goal:grant', 0.6, 55);
  link('conn:c1', 'ent:vault', 0.6, 130); link('conn:c3', 'topic:mcp', 0.4, 82);
  return { nodes, edges, spaces, org: { name: 'Example organization' } };
}
