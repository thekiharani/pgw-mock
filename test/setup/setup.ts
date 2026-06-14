import { afterAll, beforeEach, vi } from 'vitest';

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
