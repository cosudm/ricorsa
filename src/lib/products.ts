/**
 * What Ricorsa offers, as the site describes it: the cards on the home page and the page behind each one
 * (/product/<slug>). Screens are captured from the app with example content (public/brand/shots).
 */
export type Product = {
  slug: string;
  name: string;
  /** The card and page one-liner. */
  blurb: string;
  /** The page opening, a little longer. */
  lede: string;
  /** Three or four short paragraphs: what you can do with it. */
  points: Array<{ title: string; text: string }>;
  /** Screenshot under /brand/shots, and what it shows. */
  shot: string;
  shotAlt: string;
  /** Where the feature lives in the app, for the page's button. */
  open: { label: string; href: string };
  /** Products worth reading next. */
  related: string[];
};

export const PRODUCTS: Product[] = [
  {
    slug: 'search', name: 'Search with citations',
    blurb: 'Ask a question. Ricorsa searches the live web and answers with numbered citations that open the source page. Attach files and it reads them first.',
    lede: 'Ricorsa searches the live web when you ask, reads the results, and writes an answer with numbered citations. Each number opens the page it came from.',
    points: [
      { title: 'Live sources', text: 'Pages are fetched when you ask, not recalled from training. They appear before the answer does.' },
      { title: 'Three settings', text: 'Fast for simple questions. Best by default. Reasoning for hard ones.' },
      { title: 'Your files', text: 'Attach PDFs, Word, Excel, decks or images. Ricorsa reads them before the web. Citations open the page in the viewer.' },
      { title: 'Threads', text: 'Follow up in the same thread. Rewrite an answer shorter or longer. Save it to a Space or export it as Markdown.' },
    ],
    shot: 'search', shotAlt: 'An answer with four sources above it and numbered citations in the text',
    open: { label: 'Open Ricorsa', href: '/app' }, related: ['research', 'graph', 'spaces'],
  },
  {
    slug: 'research', name: 'Research mode',
    blurb: 'Runs several searches on a hard question and writes a report with sections and numbered sources. Reports are counted separately from questions.',
    lede: 'Research mode plans the searches a question needs, runs them, and writes a report: a summary, sections, and a numbered source for every claim.',
    points: [
      { title: 'Several searches', text: 'The question is broken into searches. Each one is shown as it runs.' },
      { title: 'Checkable', text: 'Every claim has a citation that opens the page. Send the report to someone who will check it.' },
      { title: 'Rewrites', text: 'Ask for a shorter version, a longer one, or the Reasoning model. Sources stay in the thread.' },
      { title: 'Counted separately', text: 'Each plan includes a number of reports a month, alongside questions.' },
    ],
    shot: 'research', shotAlt: 'A Research mode report with a summary, sections and numbered sources',
    open: { label: 'Open Ricorsa', href: '/app' }, related: ['search', 'spaces', 'build'],
  },
  {
    slug: 'spaces', name: 'Spaces',
    blurb: 'A Space holds one client, matter or project: its instructions, its threads and its connectors. Nothing in one Space is used in another.',
    lede: 'A Space is one client, matter or project. Questions asked in it follow its instructions. Its threads stay together. Its connectors can be limited to it.',
    points: [
      { title: 'Instructions', text: 'Write what every answer in the Space should do: cite the statute, note effective dates, write for a given reader.' },
      { title: 'Connectors per Space', text: 'A website, vault or MCP server connected for one client can be limited to that client\'s Space. Other threads never see it.' },
      { title: 'Threads', text: 'Threads started in a Space are listed there. Any thread can be moved in or out.' },
      { title: 'Limits', text: '25 Spaces on Essentials, 100 on Professional, unlimited on Enterprise.' },
    ],
    shot: 'spaces', shotAlt: 'A Space page with its instructions, its connectors and its threads',
    open: { label: 'Open Spaces', href: '/app#/spaces' }, related: ['connectors', 'graph', 'vault'],
  },
  {
    slug: 'graph', name: 'The Identity Graph',
    blurb: 'What Ricorsa learns from your questions, kept as a graph you can read: topics, entities, goals, expertise. Export it as JSON, forget any node, or reset it.',
    lede: 'Ricorsa keeps what it learns about your work in a graph you can open and read. It is folded into every question so your intent is read better each time.',
    points: [
      { title: 'Readable', text: 'Every node is listed with where it came from: the thread and the turn that added it.' },
      { title: 'Weighted', text: 'A topic that keeps coming up gains weight. One that stops mattering fades. Learning can be paused.' },
      { title: 'Yours', text: 'Export the graph as JSON. Forget any node. Reset it. It belongs to your account and follows you across devices.' },
      { title: 'Feeds Discover', text: 'Discover reads the graph to propose apps, agents and datasets.' },
    ],
    shot: 'graph', shotAlt: 'The Graph page: node counts, recent intents, and a map of connected topics, entities and goals',
    open: { label: 'Open the graph', href: '/app#/graph' }, related: ['build', 'search', 'spaces'],
  },
  {
    slug: 'build', name: 'Discover and the Build studio',
    blurb: 'Discover proposes apps, agents, tools and datasets based on your graph. The studio builds the one you pick, tests it in a browser, and takes change requests in a chat.',
    lede: 'Discover proposes apps, agents, tools and datasets based on your graph. Pick one, or describe your own. The studio builds it, tests it in a browser, and takes change requests in a chat.',
    points: [
      { title: 'Ideas from your graph', text: 'Each idea carries a provenance id tied to the state of the graph it came from.' },
      { title: 'Tested in a browser', text: 'Every version is opened in a headless browser. Controls are pressed, screens opened, errors recorded and sent back for repair.' },
      { title: 'Live model access', text: 'Built apps can call Ricorsa\'s model with your context. Open one in its own tab or download it as one HTML file.' },
      { title: 'Versions', text: 'Each change request makes a new version. Compare, show or roll back.' },
    ],
    shot: 'build', shotAlt: 'The Build studio: versions on the left, the working app on the right',
    open: { label: 'Open Discover', href: '/app#/discover' }, related: ['graph', 'connectors', 'research'],
  },
  {
    slug: 'connectors', name: 'Connectors',
    blurb: 'Connect MCP servers, GitHub, Notion, websites and document vaults. Answers use them when a question is about your own data and cite what they used.',
    lede: 'Connectors give answers access to your own data: any MCP server, the apps that publish one, any public website, and your document vault.',
    points: [
      { title: 'MCP servers', text: 'Add a server by URL with a token or a sign-in, or pick one from the catalog. Choose which of its tools may be used.' },
      { title: 'Websites', text: 'Give Ricorsa a site. It reads the pages, keeps the text in your account, and cites the page it used.' },
      { title: 'Scope', text: 'A connector serves every thread, or only the Spaces you choose.' },
      { title: 'Credentials', text: 'Tokens are stored encrypted and deleted with the connector. Answers that used a connector say so.' },
    ],
    shot: 'connectors', shotAlt: 'The connector catalog: apps, MCP servers, websites and the VDRPros Vault',
    open: { label: 'Open Connectors', href: '/app#/connectors' }, related: ['vault', 'spaces', 'build'],
  },
  {
    slug: 'vault', name: 'VDRPros Vault',
    blurb: 'Connect a Vault workspace with a one-time code. Answers cite the page and open it in the viewer. Every read is logged.',
    lede: 'The VDRPros Vault holds the documents a matter runs on. Connected to Ricorsa, questions about a witness, a site or a defendant are answered from the pages, with each citation opening the page.',
    points: [
      { title: 'Page-level', text: 'Search returns pages, not files. Citations open the page: transcript, spreadsheet or scan.' },
      { title: 'One-time code', text: 'Connecting uses a six-digit code issued for your Vault email. The Vault issues a token limited to the workspaces you choose.' },
      { title: 'Logged', text: 'The Vault records each search and each page read.' },
      { title: 'Paper', text: 'If a matching folder is still on paper, the answer says so and offers to request a scan.' },
    ],
    shot: 'vault', shotAlt: 'Connecting a VDRPros Vault: the one-time code step',
    open: { label: 'Connect a Vault', href: '/app#/connectors' }, related: ['connectors', 'spaces', 'search'],
  },
  {
    slug: 'enterprise', name: 'Ricorsa Enterprise',
    blurb: 'The identity graph for an organization, anchored to geography. Deployed on your data, your geography and your governance.',
    lede: 'Ricorsa Enterprise runs the identity graph for an organization. Every node is anchored to a point, a line or a polygon. Relationships are mapped as they change. Deployed on your data, under your governance.',
    points: [
      { title: 'Utilities and infrastructure', text: 'Substations as points, grids as lines, tied to maintenance logs, weather risk and contractor identities.' },
      { title: 'Supply chain and fleet', text: 'Corporate identities and freight manifests on moving lanes and geofenced hubs.' },
      { title: 'Fraud and risk', text: 'Financial entities and transaction behavior linked to locations and high-risk zones.' },
      { title: 'Cities and planning', text: 'Demographic, commercial and sensor data tied to zoning boundaries and transit corridors.' },
      { title: 'Licensing', text: 'Seat licenses, 60 seats or more at $85 per seat a month, or floating licenses shared across a team. Call for pricing.' },
    ],
    shot: 'graph', shotAlt: 'The identity graph: nodes for topics, entities, goals and expertise, connected',
    open: { label: 'Contact us', href: 'mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise' }, related: ['graph', 'connectors', 'spaces'],
  },
];

export function productBySlug(slug: string): Product | null { return PRODUCTS.find(p => p.slug === slug) || null; }

/** Sample questions by the kind of work, for the Try Ricorsa section. */
export const SAMPLE_PROMPTS: Array<{ key: string; label: string; prompts: string[] }> = [
  { key: 'analysts', label: 'Analysts and consultants', prompts: [
    'Compare the last three quarters of guidance from the two largest US homebuilders and show where they diverge, with sources.',
    'What changed in the EU AI Act obligations for general-purpose models this year, and when does each part apply?',
    'Summarize the strongest evidence for and against remote work productivity, citing the studies.',
    'Write a one-page brief on lithium prices since January and what moved them.',
  ] },
  { key: 'operators', label: 'Founders and operators', prompts: [
    'What do I need to register a Delaware C corp and open a business bank account in the first week?',
    'Which payroll providers pay contractors in Mexico and Colombia, and what do they charge?',
    'Draft a 90-day plan for launching a paid newsletter, with benchmarks from comparable launches.',
    'Turn my research on customer onboarding into a checklist app I can share with the team.',
  ] },
  { key: 'realestate', label: 'Real estate', prompts: [
    'Which Houston submarkets added the most industrial space this year, and who is leasing it?',
    'Which states changed their short-term rental rules this year, and what changed?',
    'Estimate a cap rate range for a 40-unit multifamily in San Antonio from recent comparable sales, with sources.',
    'Build a rule checker that tells me which short-term rental rules apply to an address.',
  ] },
  { key: 'legal', label: 'Legal teams', prompts: [
    'Which depositions in my document vault mention the warehouse, and on which pages?',
    'What are the current federal rules on retaining electronic records in an asbestos matter?',
    'Summarize the last five Texas appellate decisions on premises liability, with citations.',
    'Create a dataset of every exhibit referenced in these transcripts, with the page each appears on.',
  ] },
  { key: 'educators', label: 'Educators', prompts: [
    'Map the AI-related roles employers in Texas are hiring for this year to the programs a regional university could add.',
    'Draft a syllabus week on responsible AI use, with readings I can cite.',
    'Which accreditation standards touch AI in the curriculum, and how have peer institutions responded?',
    'Turn this research into a simple explorer students can browse by role.',
  ] },
];
