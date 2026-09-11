/**
 * Outbound email through Resend (RESEND_API_KEY). The console sends invoices and messages from the address in
 * Settings; every send is also logged as a communication on the customer.
 */
import { HttpError } from './http';

export function emailConfigured(): boolean { return Boolean(process.env.RESEND_API_KEY); }
function base(): string { return (process.env.RESEND_BASE_URL || 'https://api.resend.com').replace(/\/$/, ''); }

export type Attachment = { filename: string; content: string /* base64 */ };

export async function sendEmail(msg: { from: string; to: string[]; subject: string; html: string; text?: string; replyTo?: string; attachments?: Attachment[] }): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new HttpError(503, 'Email sending is not set up yet: add the RESEND_API_KEY secret to the console.', 'email_unconfigured');
  const res = await fetch(base() + '/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: msg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, reply_to: msg.replyTo, attachments: msg.attachments }),
  });
  const text = await res.text();
  if (!res.ok) {
    let m = text; try { m = JSON.parse(text).message || text; } catch { /* plain */ }
    throw new HttpError(res.status === 429 ? 503 : 502, `The email service refused the message: ${String(m).slice(0, 200)}`, 'email_failed');
  }
  const data = JSON.parse(text) as { id: string };
  return { id: data.id };
}

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** A plain, well-set message: paragraphs from the text, the signature underneath, no tracking, no images. */
export function messageHtml(body: string, signature: string, opts: { button?: { label: string; url: string } } = {}): string {
  const paras = body.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const button = opts.button ? `<p style="margin:20px 0"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#2D5F8A;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600">${esc(opts.button.label)}</a></p>` : '';
  const sig = signature ? `<p style="margin:22px 0 0;color:#55606B">${esc(signature).replace(/\n/g, '<br>')}</p>` : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FBFBF9"><div style="max-width:600px;margin:0 auto;padding:32px 24px;font:15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1B2228">${paras}${button}${sig}</div></body></html>`;
}
export function messageText(body: string, signature: string, opts: { button?: { label: string; url: string } } = {}): string {
  return body + (opts.button ? `\n\n${opts.button.label}: ${opts.button.url}` : '') + (signature ? `\n\n${signature}` : '');
}
