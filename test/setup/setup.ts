/** Per-test setup: stub outbound webhooks, reset DB + in-memory stores. */
import { afterAll, beforeEach, vi } from 'vitest';

// Silence outbound webhook HTTP calls (mirrors conftest _silence_webhooks).
// Returns 200 so callback deliveries persist as DELIVERED.
vi.mock('@/utils/webhooks.js', () => ({
  postWebhook: vi.fn(async (url: string) => ({
    message: `Webhook sent to ${url}`,
    status: 200,
    attempts: 1,
    body: null,
  })),
}));

const { seedDatabase, clearStores, closeApp } = await import('@test/helpers/app.js');

beforeEach(async () => {
  await seedDatabase();
  clearStores();
});

afterAll(async () => {
  await closeApp();
});
