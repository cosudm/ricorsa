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
    blurb: 'Ask a real question and get an answer built from pages fetched moments ago, each claim carrying a numbered citation that opens the source. Fast for simple questions, deeper reasoning for hard ones.',
    lede: 'Ricorsa searches the live web the moment you ask, reads the results, and writes an answer where every claim ends with a number you can press. The page opens; you check it. Attach a file and it reads that first.',
    points: [
      { title: 'Sources arrive before the answer', text: 'You see what was retrieved as it lands, then the answer streams in with numbered citations that point at those pages. Nothing is recalled from training when a live page will do.' },
      { title: 'Three settings, one question', text: 'Fast answers simple things at once. Best is the default: a moderate amount of thinking. Reasoning lets the model think as long as it needs on a hard question.' },
      { title: 'Your files, read first', text: 'Attach PDFs, Word and Excel files, decks or images to a question. Ricorsa reads them before it reads the web, and the viewer opens the exact page a citation points at.' },
      { title: 'Follow up in the same thread', text: 'Each thread keeps its sources and its context. Ask the next thing, rewrite an answer more concisely or in more depth, save the thread to a Space, or export it as Markdown.' },
    ],
    shot: 'search', shotAlt: 'A Ricorsa answer with four sources above it and numbered citations in the text',
    open: { label: 'Ask a question', href: '/app' }, related: ['research', 'graph', 'spaces'],
  },
  {
    slug: 'research', name: 'Research mode',
    blurb: 'Turn a hard question into a report. Research mode plans several searches, reads the results, and writes a structured answer with every source numbered, ready to hand to someone who will check it.',
    lede: 'Some questions need more than one search. Research mode plans the searches, runs them, reads what comes back, and writes a report with sections, a summary and numbered sources, so the result is something you can send on.',
    points: [
      { title: 'Several searches, one report', text: 'Ricorsa breaks the question into the searches it needs, runs them, and shows each step as it goes. The report that follows has a summary, sections and the sources behind every paragraph.' },
      { title: 'Written to be checked', text: 'Every claim carries a citation that opens the page. Hand the report to a colleague, a client or a reviewer and they can follow each number to what it rests on.' },
      { title: 'Ask for a different shape', text: 'Rewrite the report more concisely, in more depth, or with the Reasoning model. Follow-ups stay in the thread with the sources already on hand.' },
      { title: 'Counted separately', text: 'Reports cost more to produce than an answer, so plans include a monthly number of them alongside the question limits.' },
    ],
    shot: 'research', shotAlt: 'A Research mode report with a summary, sections and numbered sources',
    open: { label: 'Start a report', href: '/app' }, related: ['search', 'spaces', 'build'],
  },
  {
    slug: 'spaces', name: 'Spaces',
    blurb: 'A Space is a client, a matter or a project: its own standing instructions, its own threads, and connectors kept unique to it, so nothing leaks between projects and every question there starts informed.',
    lede: 'Give each client, matter or project its own Space. Questions asked there follow the Space\'s instructions, its threads stay together, and the connectors it uses can be kept to it alone.',
    points: [
      { title: 'Standing instructions', text: 'Write what every answer in the Space should honor: cite the statute, note effective dates, write for a particular reader. Ricorsa applies it to every question asked there.' },
      { title: 'Connectors unique to the Space', text: 'A website, a document vault or an MCP server connected for one client can be limited to that client\'s Space. Threads elsewhere never see it, so nothing crosses between projects.' },
      { title: 'Threads in one place', text: 'Every thread started in the Space stays listed there, and any thread can be moved in or out. The Library keeps the whole history searchable.' },
      { title: 'As many as the work needs', text: 'Plans include 25 Spaces on Essentials, 100 on Professional and no limit on Enterprise.' },
    ],
    shot: 'spaces', shotAlt: 'A Space page with its instructions, its connectors and its threads',
    open: { label: 'Open Spaces', href: '/app#/spaces' }, related: ['connectors', 'graph', 'vault'],
  },
  {
    slug: 'graph', name: 'The Identity Graph',
    blurb: 'Every answer adds to a graph you can read: the topics, people, organizations, goals and sources of your work, weighted by what keeps coming up. It shapes how the next question is understood. Edit it, export it as JSON, forget any part of it.',
    lede: 'Ricorsa keeps what it learns in a graph you can see, not inside a model you cannot. Topics, entities, goals, expertise and the way you like answers, weighted by repetition, folded into every question so your intent is read better each time.',
    points: [
      { title: 'Readable, not hidden', text: 'Open the Graph page and see every node, how they connect, and what you have been trying to do lately. Each node carries where it came from: the thread and the turn that added it.' },
      { title: 'Weights that move', text: 'A topic that keeps coming up grows heavier; one that stops mattering fades. Pause learning when you want a question read cold, and turn it back on when you are done.' },
      { title: 'Yours to keep', text: 'Export the whole graph as JSON, forget any node with one press, or reset it entirely. It belongs to your account and follows you across devices.' },
      { title: 'The asset behind Discover', text: 'Discover reads the graph to propose apps, agents and datasets worth building. The better the graph knows your work, the closer the ideas land.' },
    ],
    shot: 'graph', shotAlt: 'The Graph page: node counts, recent intents, and a map of connected topics, entities and goals',
    open: { label: 'See your graph', href: '/app#/graph' }, related: ['build', 'search', 'spaces'],
  },
  {
    slug: 'build', name: 'Discover and the Build studio',
    blurb: 'Ricorsa proposes apps, agents, tools and datasets drawn from your own asset and builds the one you pick: a working version, opened in a real browser and checked before it is called done, improved with you in a chat, with a live line to the model.',
    lede: 'Discover turns your graph into ideas worth building. Pick one, or describe your own, and the studio writes a working app, agent, tool or dataset, opens it in a real browser to press every control, fixes what it finds, and keeps improving it with you.',
    points: [
      { title: 'Ideas from your own work', text: 'Discover draws on your graph: the subjects you keep returning to, the goals you have named, the sources you rely on. Each idea carries a provenance id tied to the exact state of the graph it came from.' },
      { title: 'A real build, checked for real', text: 'The studio writes the whole app, then opens it in a headless browser, presses every control, opens every screen and records what breaks. The findings go back to the builder for repair before the version is called ready.' },
      { title: 'A live line to the model', text: 'Apps built here can ask Ricorsa\'s model directly, with your context, so an agent or a checker answers for real rather than showing a canned reply. Open one in its own tab or download it as a single file.' },
      { title: 'Keep shaping it in a chat', text: 'Ask for a change, add a screen, or ask how it works. Each request becomes a new version you can compare, show or roll back to.' },
    ],
    shot: 'build', shotAlt: 'The Build studio: a chat of versions on the left, the working app in a preview on the right',
    open: { label: 'Open Discover', href: '/app#/discover' }, related: ['graph', 'connectors', 'research'],
  },
  {
    slug: 'connectors', name: 'Connectors',
    blurb: 'Link the apps and servers you use over MCP: GitHub, Notion, your own server. Point Ricorsa at any website and it reads the site and stands up an MCP server for it. Answers use them when the question is about your own data, and cite the page.',
    lede: 'Connectors give answers a live line into your own data. Any MCP server, the apps that publish one, any public website, and your document vault; Ricorsa asks them when the question calls for it and cites what it used.',
    points: [
      { title: 'Any MCP server', text: 'Add a server by URL with a token or a sign-in, or pick one from the catalog. Ricorsa lists its tools, lets you choose which may be used, and calls them on your behalf mid-answer.' },
      { title: 'Any website', text: 'Give Ricorsa a site or a web app. It reads the pages, opening them in a browser when they only show their content on a click, keeps the text in your account, and stands up an MCP server for it. Answers cite the page.' },
      { title: 'Everywhere, or in one Space', text: 'A connector can serve every thread, or be kept to the Spaces you choose, so a client\'s sources stay with that client.' },
      { title: 'Credentials stay sealed', text: 'Tokens are stored encrypted, never shown again, and deleted with the connector. Answers that used a connector say so beneath the text.' },
    ],
    shot: 'connectors', shotAlt: 'The Add a connector catalog: apps, MCP servers, websites and the VDRPros Vault',
    open: { label: 'Open Connectors', href: '/app#/connectors' }, related: ['vault', 'spaces', 'build'],
  },
  {
    slug: 'vault', name: 'VDRPros Vault',
    blurb: 'Your documents, searched page by page. Connect a Vault workspace with a one-time code and answers cite the exact page, which opens in the viewer. Depositions, transcripts, exhibits, records and correspondence, with every read logged.',
    lede: 'The VDRPros Vault holds the documents a matter runs on. Connect a workspace to Ricorsa with a one-time code and questions about a witness, a site or a defendant are answered from the pages themselves, each citation opening the page.',
    points: [
      { title: 'Page-level answers', text: 'Vault search returns pages, not files. Ricorsa reads the ones it relies on and cites them by number; the viewer opens the page, whether it is a transcript, a spreadsheet or a scan.' },
      { title: 'A code, not a password', text: 'Connecting uses a six-digit code issued for your Vault email. Nothing about the Vault sign-in is shared with Ricorsa; the Vault issues a token limited to the workspaces you tick.' },
      { title: 'Every read on record', text: 'The Vault logs each search and each page read, so the record of what was consulted is complete.' },
      { title: 'Paper, too', text: 'When a matching folder is still on paper, the answer says so and offers to request a scan.' },
    ],
    shot: 'vault', shotAlt: 'Connecting a VDRPros Vault: the one-time code step',
    open: { label: 'Connect a Vault', href: '/app#/connectors' }, related: ['connectors', 'spaces', 'search'],
  },
  {
    slug: 'enterprise', name: 'Ricorsa Enterprise',
    blurb: 'The same loop, learning a network. Deployments feed looped data back into the SMEPro Identity Graph, map direct and lateral relationships as they change, and anchor every node to geography: points, lines and polygons.',
    lede: 'The loop that learns a person can learn an organization. Ricorsa Enterprise runs on your data and your geography: every node anchored to a point, a line or a polygon, lateral relationships mapped as they change, and governance set by you.',
    points: [
      { title: 'Critical infrastructure and utilities', text: 'Substations as points, grids as lines, tied to maintenance logs, weather risk and contractor identities. As field data feeds back in, the graph flags overlapping regional vulnerabilities before a failure.' },
      { title: 'Supply chain and fleet logistics', text: 'Shifting corporate identities and freight manifests on moving lanes and geofenced hubs. A customs backup hitting a secondary supplier is inferred, and transit profiles recalculated, as the graph evolves.' },
      { title: 'Geospatial fraud and risk', text: 'Financial entities and transaction behavior linked to specific locations and high-risk zones. Fraud rings surface when unrelated identities keep landing on the same, highly specific vectors.' },
      { title: 'Smart cities and municipal planning', text: 'Demographic, commercial and sensor data tied to zoning boundaries and transit corridors, so a change in one layer shows its effect on traffic and utility load across the whole graph.' },
    ],
    shot: 'graph', shotAlt: 'The identity graph: nodes for topics, entities, goals and expertise, connected',
    open: { label: 'Talk to us about a deployment', href: 'mailto:enterprise@ricorsa.com?subject=Ricorsa%20Enterprise' }, related: ['graph', 'connectors', 'spaces'],
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
