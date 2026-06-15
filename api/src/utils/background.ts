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

export async function flushBackgroundTasks(): Promise<void> {
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
