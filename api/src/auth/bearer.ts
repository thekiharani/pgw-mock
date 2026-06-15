import type { FastifyReply, FastifyRequest } from 'fastify';

import { settings } from '@/config.js';
import { db } from '@/db/client.js';
import { AuthenticationError } from '@/errors.js';
import { isValidToken, providerFromPath, requiredScopeFromPath } from '@/services/tokens.js';

function pathOf(request: FastifyRequest): string {
  return request.url.split('?')[0] ?? request.url;
}

function bearerErrorPayload(path: string, message: string): Record<string, any> {
  if (path.startsWith('/mpesa')) {
    return { requestId: '', errorCode: '404.001.03', errorMessage: message };
  }
  return { status: false, ResponseCode: '401', ResponseDescription: message };
}

export async function validateBearerToken(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const path = pathOf(request);
  const authorization = request.headers['authorization'];
  if (!authorization) {
    throw new AuthenticationError(bearerErrorPayload(path, 'Authorization header is required'));
  }
  const parts = authorization.split(' ');
  if (parts[0] !== 'Bearer') {
    throw new AuthenticationError(bearerErrorPayload(path, 'Authorization type must be Bearer'));
  }
  const token = authorization.slice(parts[0].length + 1);
  if (parts.length < 2 || !token) {
    throw new AuthenticationError(bearerErrorPayload(path, 'Bearer token is required'));
  }
  const provider = providerFromPath(path);
  const requiredScope = requiredScopeFromPath(path);
  if (
    settings.STRICT_PROVIDER_AUTH &&
    !(await isValidToken(db, token, { provider, requiredScope }))
  ) {
    throw new AuthenticationError(bearerErrorPayload(path, 'Invalid or expired access token'));
  }
  request.log.info(`Bearer token validated: ${token.slice(0, 10)}...`);
}
