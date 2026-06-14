import { defineConfig } from 'vitest/config';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'mysql://root:root@127.0.0.1:3307/pgw_mock_test';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./test/setup/globalSetup.ts'],
    setupFiles: ['./test/setup/setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    env: {
      // Point the app at the disposable test database and disable .env loading.
      DOTENV_CONFIG_PATH: './.env.test-nonexistent',
      DATABASE_URL: TEST_DB_URL,
      LOG_LEVEL: 'CRITICAL',
      STRICT_PROVIDER_AUTH: 'true',
      STRICT_PROVIDER_VALIDATION: 'true',
      RELAXED_WAAS_KYC: 'false',
      MOCK_CALLBACK_DELAY_SECONDS: '0',
      SERVICE_URL: 'http://127.0.0.1:4002',
      PAYMENTS_SERVICE_URL: 'http://127.0.0.1:4001',
    },
  },
});
