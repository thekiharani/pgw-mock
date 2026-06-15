import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { auth } from '@/auth/betterAuth.js';
import { settings } from '@/config.js';
import { AuthenticationError } from '@/errors.js';

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: AuthSession;
  }
}

function toWebRequest(request: FastifyRequest): Request {
  const url = new URL(request.url, settings.AUTH_BASE_URL);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined || key.toLowerCase() === 'content-length') continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.append(key, String(value));
  }
  const init: RequestInit = { method: request.method, headers };
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body != null) {
    init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }
  return new Request(url, init);
}

export function registerAuth(app: FastifyInstance): void {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    schema: { hide: true },
    async handler(request, reply) {
      const response = await auth.handler(toWebRequest(request));
      reply.status(response.status);
      for (const [key, value] of response.headers) {
        if (key.toLowerCase() === 'set-cookie') continue;
        reply.header(key, value);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      reply.send(response.body ? await response.text() : null);
    },
  });
}

export async function requireSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const data = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!data) {
    throw new AuthenticationError({ status: false, message: 'Authentication required' });
  }
  request.authSession = data;
}
