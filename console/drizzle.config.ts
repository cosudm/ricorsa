import { defineConfig } from 'drizzle-kit';

/** Schema and migration generation for the console's own database; migrations are applied with wrangler (see package.json). */
export default defineConfig({ schema: './src/lib/db/schema.ts', out: './drizzle', dialect: 'sqlite' });
