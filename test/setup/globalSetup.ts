/** Creates and migrates the disposable test database once per run. */
import { execSync } from 'node:child_process';

export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? 'mysql://root:root@127.0.0.1:3307/pgw_mock_test';
  // dbmate auto-creates the database and applies all migrations (schema + seed).
  // Per-test reset wipes data, so the seed rows are harmless.
  execSync('dbmate up', {
    env: {
      ...process.env,
      DATABASE_URL: url,
      DBMATE_MIGRATIONS_DIR: './db/migrations',
      DBMATE_NO_DUMP_SCHEMA: 'true',
    },
    stdio: 'inherit',
  });
}
