/**
 * Consoles: an interactive card the model can place inside an answer when the answer is about the person's own
 * Ricorsa setup or something they can act on right here: their connectors (turn on, turn off, add), the apps they
 * built (open, continue), an idea worth building, the next question to ask. The model writes the console as a
 * fenced block tagged `console` holding one JSON object; the app renders it as rows with status pills and
 * buttons, and every button runs one of a fixed set of verbs against ids that came from this context, never
 * from the model's imagination. The prose still carries the substance; the console is the control surface.
 */
import { desc, eq } from 'drizzle-orm';
import { db, schema } from './db';
import { listConnectors, catalogForClient } from './connectors';

export const CONSOLE_GUIDE = `Consoles. When the answer concerns the person's own Ricorsa setup or something they can act on right here (their connectors, the apps they have built, an idea worth building, what to ask next), you may include one interactive console inside <answer>, placed where it belongs in the prose, as a fenced block whose language tag is console and whose body is one JSON object:
\`\`\`console
{"title":"Your connectors","subtitle":"optional, one line","items":[{"title":"VDRPros Vault","detail":"optional, one line","status":"on","actions":[{"label":"Turn off","do":"connector.off","id":"<connector id from the context>"},{"label":"Open","do":"open","to":"#/connectors"}]}],"footer":"optional, one line"}
\`\`\`
Verbs, with their required fields: open (to: one of #/discover, #/connectors, #/graph, #/spaces, #/library, #/build/<app id>, #/thread/<thread id>, /pricing, /account); ask (text: a question to send next in this conversation); build (title, what, kind: App, Tool, Agent, Dataset or Content); connector.on and connector.off (id: a connector id from the context); connector.add (id: a preset key from the context); app.open (id: an app version id from the context, opens the app in its own tab); link (url: https only); copy (text). Status is one of on, off, available, done, building, error, none. At most one console per answer, eight items, three actions per item. Use only ids and keys given in the context below; a console with no valid action is worse than none. Say in the prose what the console shows; never put information only in the console. Do not use a console for general knowledge answers.`;

/** The person's connectors, the presets they could add, and their recent apps, as the model may reference them in a console. */
export async function consoleContext(userId: string, opts: { canBuild: boolean }): Promise<string> {
  const [conns, spaces, builds] = await Promise.all([
    listConnectors(userId).catch(() => []),
    db().select({ id: schema.spaces.id, name: schema.spaces.name }).from(schema.spaces).where(eq(schema.spaces.userId, userId)).catch(() => []),
    db().select({ id: schema.builds.id, rootId: schema.builds.rootId, version: schema.builds.version, title: schema.builds.title, kind: schema.builds.kind, status: schema.builds.status, updatedAt: schema.builds.updatedAt })
      .from(schema.builds).where(eq(schema.builds.userId, userId)).orderBy(desc(schema.builds.updatedAt)).limit(40).catch(() => []),
  ]);
  const L: string[] = [];
  const spaceName = new Map(spaces.map(s => [s.id, s.name]));
  const cl = conns.map(c => `- ${c.name} (connector id ${c.id}, ${c.enabled ? 'on' : 'off'}${c.status === 'ok' ? '' : `, ${c.status === 'needs_auth' ? 'needs a sign-in' : c.status === 'error' ? 'not reachable' : 'not checked yet'}`}${c.spaceIds?.length ? `, only in the ${c.spaceIds.map(id => spaceName.get(id)).filter(Boolean).join(' and ')} Space${c.spaceIds.length === 1 ? '' : 's'}` : ''})`);
  L.push(cl.length ? `Connectors the person has:\n${cl.join('\n')}` : 'The person has no connectors yet.');
  const have = new Set(conns.map(c => c.preset).filter(Boolean));
  const presets = catalogForClient().filter(p => p.key !== 'custom' && p.available !== false && !have.has(p.key)).slice(0, 12);
  L.push(`Presets that can be added with connector.add:\n${presets.map(p => `- ${p.name} (preset key ${p.key}): ${p.blurb}`).join('\n')}`);
  // One line per app session: the root id opens the studio, the newest version id opens the app itself.
  const sessions = new Map<string, { id: string; title: string; kind: string; status: string; latest: string; version: number; at: number }>();
  for (const b of builds) {
    const key = b.rootId || b.id; const at = new Date(b.updatedAt).getTime();
    const cur = sessions.get(key);
    if (!cur) sessions.set(key, { id: key, title: b.title, kind: b.kind, status: b.status, latest: b.id, version: b.version, at });
    else if (at > cur.at) { cur.at = at; cur.status = b.status; cur.latest = b.id; cur.version = b.version; }
  }
  const apps = [...sessions.values()].sort((a, b) => b.at - a.at).slice(0, 10);
  L.push(apps.length
    ? `Apps the person has built in the Build studio (app id opens the studio with #/build/<app id>; version id is for app.open):\n${apps.map(a => `- ${a.title} (${a.kind}, ${a.status === 'done' ? 'ready' : a.status}; app id ${a.id}; version id ${a.latest}, v${a.version})`).join('\n')}`
    : `The person has not built an app yet${opts.canBuild ? '; the build verb starts one from an idea' : ' (building is part of the Team plan; the build verb shows the upgrade)'}.`);
  return `Console context (for consoles only; never recite ids in prose):\n${L.join('\n')}`;
}
