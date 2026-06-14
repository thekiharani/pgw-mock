/**
 * Background task runner — the FastAPI BackgroundTasks equivalent.
 *
 * Tasks enqueued during a request run AFTER the response is sent (onResponse
 * hook), so handlers return immediately and callbacks fire asynchronously.
 *
 * In-flight batches are tracked so tests can deterministically await them via
 * flushBackgroundTasks() — mirroring how httpx ASGITransport runs FastAPI
 * background tasks inline before the test sees the response.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';

export type BackgroundTask = () => Promise<unknown> | unknown;

declare module 'fastify' {
  interface FastifyRequest {
    backgroundTasks: BackgroundTask[];
  }
}

const inFlight = new Set<Promise<unknown>>();

export function enqueueBackgroundTask(request: FastifyRequest, task: BackgroundTask): void {
  request.backgroundTasks.push(task);
}

/** Await all currently-running and imminently-scheduled background batches. */
export async function flushBackgroundTasks(): Promise<void> {
  // Let any pending onResponse hooks start and register their batch.
  for (let i = 0; i < 5 && inFlight.size === 0; i++) {
    await new Promise((r) => setImmediate(r));
  }
  while (inFlight.size > 0) {
    await Promise.allSettled([...inFlight]);
    await new Promise((r) => setImmediate(r));
  }
}

export function registerBackgroundTasks(app: FastifyInstance): void {
  app.decorateRequest('backgroundTasks', null as unknown as BackgroundTask[]);

  app.addHook('onRequest', async (request) => {
    request.backgroundTasks = [];
  });

  app.addHook('onResponse', async (request) => {
    const tasks = request.backgroundTasks ?? [];
    if (tasks.length === 0) return;
    const batch = (async () => {
      for (const task of tasks) {
        try {
          await task();
        } catch (err) {
          request.log.error({ err }, 'background task failed');
        }
      }
    })();
    inFlight.add(batch);
    batch.finally(() => inFlight.delete(batch));
  });
}
