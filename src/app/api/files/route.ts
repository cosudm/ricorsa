import { currentUser } from '@/lib/session';
import { handle, json, fail, uid } from '@/lib/http';
import { db, schema } from '@/lib/db';
import { planFor } from '@/lib/plans';
import { extractText, FileError, metaOf, sweepPending, ACCEPT } from '@/lib/files';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * POST /api/files  (multipart, one `file`) — read a file into text for the next question. Returns the
 * attachment's id and size; the text stays on the server. GET returns what the picker should accept.
 */
export const GET = handle(async () => {
  const user = await currentUser();
  const caps = planFor(user.plan).caps.files;
  return json({ accept: ACCEPT, perQuestion: user.admin ? 20 : caps.perQuestion, maxMb: user.admin ? 40 : caps.maxMb });
});

export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const caps = planFor(user.plan).caps.files;
  // Workers hold the whole upload in memory, so the ceiling stays well under the isolate's 128 MB.
  const maxBytes = (user.admin ? 40 : caps.maxMb) * 1024 * 1024;
  let form: FormData;
  try { form = await req.formData(); } catch { return fail(400, 'Send the file as multipart form data', 'invalid_request'); }
  const file = form.get('file');
  if (!(file instanceof File)) return fail(400, 'No file was sent', 'invalid_request');
  if (!file.name) return fail(400, 'The file has no name', 'invalid_request');
  if (file.size === 0) return fail(400, `${file.name} is empty`, 'empty');
  if (file.size > maxBytes) return fail(413, `${file.name} is ${(file.size / 1048576).toFixed(1)} MB; files up to ${user.admin ? 40 : caps.maxMb} MB can be attached on your plan.`, 'too_large');
  void sweepPending(user.id);
  let text: string, via: string;
  try { ({ text, via } = await extractText(file, req.signal)); }
  catch (e) {
    if (e instanceof FileError) return fail(e.status, e.message, e.code);
    console.error('[files] extract failed', String((e as Error)?.message || e));
    return fail(502, `${file.name} could not be read right now. Try again in a moment.`, 'file_service');
  }
  const id = uid();
  const row = { id, userId: user.id, threadId: null, name: file.name.slice(0, 200), type: (file.type || '').slice(0, 100), size: file.size, text, chars: text.length, via };
  await db().insert(schema.attachments).values(row);
  console.log('[files]', JSON.stringify({ user: user.id, name: row.name, size: row.size, chars: row.chars, via }));
  return json({ file: { ...metaOf(row), preview: text.slice(0, 240) } });
});
