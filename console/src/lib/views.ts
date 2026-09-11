import { schema } from './db';
import { effectiveStatus } from './invoices';

const ms = (x: Date | null | undefined) => (x ? x.getTime() : null);
type Cust = { name: string; company: string | null; email: string | null } | null | undefined;

/** Rows as the client receives them: dates as epoch milliseconds, the customer's name alongside. */
export const licenseView = (l: typeof schema.licenses.$inferSelect, customer?: Cust) => ({ ...l, startsAt: l.startsAt.getTime(), endsAt: ms(l.endsAt), createdAt: l.createdAt.getTime(), updatedAt: l.updatedAt.getTime(), customer: customer || null });
export const trialView = (t: typeof schema.trials.$inferSelect, customer?: Cust) => ({ ...t, startedAt: t.startedAt.getTime(), endsAt: t.endsAt.getTime(), convertedAt: ms(t.convertedAt), createdAt: t.createdAt.getTime(), updatedAt: t.updatedAt.getTime(), customer: customer || null });
export const commView = (c: typeof schema.communications.$inferSelect, customer?: Cust) => ({ ...c, at: c.at.getTime(), createdAt: c.createdAt.getTime(), customer: customer || null });
export const invoiceView = (i: typeof schema.invoices.$inferSelect, customer?: Cust) => ({ ...i, status: effectiveStatus(i), rawStatus: i.status, issuedAt: ms(i.issuedAt), dueAt: ms(i.dueAt), paidAt: ms(i.paidAt), sentAt: ms(i.sentAt), createdAt: i.createdAt.getTime(), updatedAt: i.updatedAt.getTime(), customer: customer || null });
export const paymentView = (p: typeof schema.payments.$inferSelect) => ({ ...p, receivedAt: p.receivedAt.getTime(), createdAt: p.createdAt.getTime() });
export const contactView = (c: typeof schema.contacts.$inferSelect) => ({ ...c, createdAt: c.createdAt.getTime() });
export const activityView = (a: typeof schema.activity.$inferSelect) => ({ ...a, at: a.at.getTime() });
