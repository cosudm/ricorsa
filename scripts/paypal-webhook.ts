/**
 * Registers the webhook endpoint with PayPal and prints the webhook id for PAYPAL_WEBHOOK_ID.
 *   APP_BASE_URL=https://ricorsa.com PAYPAL_ENV=live npm run paypal:webhook
 */
import 'dotenv/config';
import { createWebhook } from '../src/lib/paypal';

async function main() {
  const base = process.env.APP_BASE_URL;
  if (!base || base.includes('localhost')) throw new Error('APP_BASE_URL must be a public https URL for webhooks');
  const hook = await createWebhook(base.replace(/\/$/, '') + '/api/billing/paypal/webhook');
  console.log('PAYPAL_WEBHOOK_ID=' + hook.id);
}
main().catch(e => { console.error(e); process.exit(1); });
