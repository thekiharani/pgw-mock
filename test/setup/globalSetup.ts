/** Creates and migrates the disposable test database once per run. */
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export default async function globalSetup() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  // globalSetup runs in the main process and does not see Vitest's test.env,
  // so default to the same test DB URL as vitest.config.ts.
  const url =
    process.env.TEST_DATABASE_URL ?? 'mysql://root:pass_444888@127.0.0.1:3326/pgw_mock_test';
  // dbmate auto-creates the database and applies all migrations (schema + seed).
  // Per-test reset wipes data, so the seed rows are harmless.
  execSync('dbmate up', {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: url,
      DBMATE_MIGRATIONS_DIR: resolve(projectRoot, 'db/migrations'),
      DBMATE_NO_DUMP_SCHEMA: 'true',
    },
    stdio: 'inherit',
  });
}
