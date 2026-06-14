import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export default async function globalSetup() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const url =
    process.env.TEST_DATABASE_URL ?? 'mysql://root:pass_444888@127.0.0.1:3326/pgw_mock_test';
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
