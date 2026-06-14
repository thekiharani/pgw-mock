import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { AppError } from '@/errors.js';
import { registerErrorHandlers } from '@/plugins/errorHandler.js';

async function appWithRoutes() {
  const app = Fastify({ logger: false });
  registerErrorHandlers(app);
  app.get('/app-error', async () => {
    throw new AppError({
      statusCode: 418,
      message: 'teapot',
      payload: { status: false, message: 'teapot', extra: 1 },
    });
  });
  app.get('/boom', async () => {
    throw new Error('kaboom');
  });
  app.get('/client', async () => {
    throw Object.assign(new Error('bad request'), { statusCode: 400 });
  });
  await app.ready();
  return app;
}

describe('error handlers', () => {
  it('returns an AppError status and payload verbatim', async () => {
    const app = await appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/app-error' });
    expect(res.statusCode).toBe(418);
    expect(res.json()).toEqual({ status: false, message: 'teapot', extra: 1 });
    await app.close();
  });

  it('unhandled error returns a generic 500 envelope', async () => {
    const app = await appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ status: false, message: 'Internal server error' });
    await app.close();
  });

  it('4xx framework errors return a status:false envelope', async () => {
    const app = await appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/client' });
    expect(res.statusCode).toBe(400);
    expect(res.json().status).toBe(false);
    await app.close();
  });

  it('unknown route returns the 404 envelope', async () => {
    const app = await appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/nowhere' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ status: false, message: 'Route not found' });
    await app.close();
  });
});
