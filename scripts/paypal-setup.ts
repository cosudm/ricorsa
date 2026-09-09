/**
 * Creates the Ricorsa product and one PayPal billing plan per paid tier, then writes the
 * plan ids into .env.local. Run once per environment (sandbox, then live):
 *   PAYPAL_ENV=sandbox npm run paypal:setup
 * PayPal plans are immutable; to change a price, edit src/lib/plans.ts and run again (new ids).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createPlan, createProduct } from '../src/lib/paypal';
import { PLANS } from '../src/lib/plans';

async function main() {
  const envPath = path.join(process.cwd(), '.env.local');
  const product = await createProduct('Ricorsa', 'Ricorsa answer engine subscription');
  console.log('Product', product.id);
  const lines: string[] = [];
  for (const plan of Object.values(PLANS)) {
    if (!plan.paypalPlanEnv) continue;
    const p = await createPlan(product.id, `Ricorsa ${plan.name}`, `${plan.name} plan: ${plan.blurb}`, plan.priceUsd);
    console.log(`${plan.paypalPlanEnv}=${p.id}`);
    lines.push(`${plan.paypalPlanEnv}=${p.id}`);
  }
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  for (const line of lines) {
    const [k] = line.split('=');
    env = env.match(new RegExp(`^${k}=.*$`, 'm')) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), line) : env + (env.endsWith('\n') || !env ? '' : '\n') + line + '\n';
  }
  fs.writeFileSync(envPath, env);
  console.log('Wrote plan ids to .env.local');
}
main().catch(e => { console.error(e); process.exit(1); });
