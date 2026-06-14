import { defineConfig } from 'drizzle-kit';

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url) return url.replace(/^([a-z]+)\+[a-z0-9]+:\/\//i, '$1://');
  const host = process.env.DB_HOST ?? '127.0.0.1';
  const port = process.env.DB_PORT ?? '3306';
  const user = process.env.DB_USER ?? 'root';
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? '');
  const name = process.env.DB_NAME ?? 'pgw_mock';
  return `mysql://${user}:${password}@${host}:${port}/${name}`;
}

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: databaseUrl() },
});
