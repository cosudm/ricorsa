import { defineConfig } from 'drizzle-kit';

/** Schema and migration generation only; migrations are applied with wrangler (see package.json). */
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
});
