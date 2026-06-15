import { defineConfig } from 'vitest/config';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'mysql://root:pass_444888@127.0.0.1:3326/pgw_mock_test';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./test/setup/globalSetup.ts'],
    setupFiles: ['./test/setup/setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/index.ts'],
    },
    env: {
      DOTENV_CONFIG_PATH: './.env.test-nonexistent',
      DATABASE_URL: TEST_DB_URL,
      LOG_LEVEL: 'CRITICAL',
      STRICT_PROVIDER_AUTH: 'true',
      STRICT_PROVIDER_VALIDATION: 'true',
      RELAXED_WAAS_KYC: 'false',
      MOCK_CALLBACK_DELAY_SECONDS: '0',
      WEBHOOK_RETRY_DELAY_SECONDS: '0',
      HTTP_TIMEOUT_SECONDS: '5',
      SERVICE_URL: 'http://127.0.0.1:4200',
      PAYMENTS_SERVICE_URL: 'http://127.0.0.1:4001',
      AUTH_SECRET: 'test-secret-test-secret-test-secret-0123',
      AUTH_BASE_URL: 'http://localhost:4200',
      MAIL_DRIVER: 'console',
    },
  },
});
