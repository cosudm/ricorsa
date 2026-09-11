import type { Page } from '../shard-do';

export function tidy(text: string): string {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Text without natural pages is cut into pages of about 3,000 characters at paragraph or sentence boundaries. */
export function paginate(text: string, size = 3000): Page[] {
  const t = tidy(text); if (!t) return [];
  const pages: Page[] = []; let rest = t;
  while (rest.length) {
    if (rest.length <= size * 1.3) { pages.push({ page: pages.length + 1, text: rest }); break; }
    let cut = rest.lastIndexOf('\n\n', size); if (cut < size * 0.5) cut = rest.lastIndexOf('\n', size); if (cut < size * 0.5) cut = rest.lastIndexOf('. ', size); if (cut < size * 0.5) cut = size;
    pages.push({ page: pages.length + 1, text: rest.slice(0, cut).trim() }); rest = rest.slice(cut).trim();
  }
  return pages;
}

export function decodeText(bytes: Uint8Array): string {
  // UTF-8 with a BOM, UTF-16 with a BOM, else UTF-8 and finally Latin-1.
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) return new TextDecoder(bytes[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(bytes.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes); } catch { return new TextDecoder('latin1').decode(bytes); }
}

/** An email file (.eml): the headers that matter, then the readable body; attachments are named, not read. */
export function emlPages(raw: string): { pages: Page[]; date: string | null; subject: string | null } {
  const norm = raw.replace(/\r\n?/g, '\n');
  const split = norm.indexOf('\n\n'); const head = split >= 0 ? norm.slice(0, split) : norm; const bodyRaw = split >= 0 ? norm.slice(split + 2) : '';
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\n[ \t]+/g, ' ').split('\n')) { const m = /^([\w-]+):\s*(.*)$/.exec(line); if (m) headers[m[1].toLowerCase()] = m[2]; }
  const boundary = (/boundary="?([^";\s]+)"?/i.exec(headers['content-type'] || '') || [])[1];
  const parts: string[] = []; const attachments: string[] = [];
  const readPart = (part: string) => {
    const i = part.indexOf('\n\n'); const ph = i >= 0 ? part.slice(0, i) : ''; let pb = i >= 0 ? part.slice(i + 2) : part;
    const ct = (/content-type:\s*([^;\n]+)/i.exec(ph) || [])[1]?.toLowerCase() || 'text/plain';
    const name = (/name="?([^";\n]+)"?/i.exec(ph) || [])[1];
    const enc = (/content-transfer-encoding:\s*([^\n]+)/i.exec(ph) || [])[1]?.trim().toLowerCase();
    if (/attachment/i.test(ph) || (name && !ct.startsWith('text/'))) { if (name) attachments.push(name); return; }
    if (ct.startsWith('multipart/')) { const b = (/boundary="?([^";\s]+)"?/i.exec(ph) || [])[1]; if (b) for (const sub of pb.split('--' + b).slice(1)) if (!sub.startsWith('--')) readPart(sub); return; }
    if (enc === 'base64') { try { pb = decodeText(Uint8Array.from(atob(pb.replace(/\s+/g, '')), c => c.charCodeAt(0))); } catch { return; } }
    else if (enc === 'quoted-printable') pb = pb.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (ct.startsWith('text/html')) pb = pb.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '');
    if (ct.startsWith('text/')) parts.push(pb);
  };
  if (boundary) for (const part of bodyRaw.split('--' + boundary).slice(1)) { if (!part.startsWith('--')) readPart(part); }
  else readPart(head + '\n\n' + bodyRaw);
  const top = ['from', 'to', 'cc', 'date', 'subject'].filter(k => headers[k]).map(k => `${k[0].toUpperCase() + k.slice(1)}: ${headers[k]}`).join('\n');
  const text = tidy(top + '\n\n' + (parts[0] || '') + (attachments.length ? `\n\n[Attachments: ${attachments.join(', ')}]` : ''));
  let date: string | null = null; if (headers.date) { const d = new Date(headers.date); if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10); }
  return { pages: paginate(text), date, subject: headers.subject || null };
}
