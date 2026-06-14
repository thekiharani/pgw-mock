import { defineConfig } from 'drizzle-kit';
import { settings } from './src/config.js';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: settings.databaseUrl,
  },
});
