import { redirect } from 'next/navigation';

/** /recharge is the Recharge page's second address; the page itself lives at /pricing so older links keep working. */
export default function RechargeAlias() { redirect('/pricing'); }
