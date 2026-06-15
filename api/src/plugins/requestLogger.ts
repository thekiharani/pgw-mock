import type { FastifyInstance } from 'fastify';

import { settings } from '@/config.js';

declare module 'fastify' {
  interface FastifyRequest {
    _startTime?: number;
  }
}

export function registerRequestLogger(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    request._startTime = Date.now();
  });

  app.addHook('preHandler', async (request) => {
    const ip = request.ip || '-';
    if (settings.LOG_REQUEST_BODIES) {
      const raw =
        typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? '');
      const body = raw.slice(0, settings.REQUEST_LOG_BODY_MAX_BYTES);
      request.log.info(`→ ${request.method} ${request.url} | ip=${ip} | body=${body}`);
    } else {
      const len = request.headers['content-length'] ?? '0';
      request.log.info(`→ ${request.method} ${request.url} | ip=${ip} | body_bytes=${len}`);
    }
  });

  app.addHook('onResponse', async (request) => {
    const elapsed = request._startTime ? Date.now() - request._startTime : 0;
    request.log.info(`← ${request.method} ${request.url} ${elapsed.toFixed(1)}ms`);
  });
}
