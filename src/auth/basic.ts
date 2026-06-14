/** Basic auth validation. Mirrors validate_basic_auth in app/middleware/auth.py. */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { settings } from '../config.js';
import { AuthenticationError } from '../errors.js';

function pathOf(request: FastifyRequest): string {
  return request.url.split('?')[0] ?? request.url;
}

function isDarajaOauthPath(path: string): boolean {
  return path.startsWith('/oauth') || path.startsWith('/mpesa/oauth');
}

function basicErrorPayload(path: string, message: string): Record<string, any> {
  if (isDarajaOauthPath(path)) {
    return { requestId: '', errorCode: '401.002.01', errorMessage: message };
  }
  return { status: false, ResponseCode: '401', detail: message };
}

function expectedBasicCredentials(path: string): [string, string] | null {
  if (isDarajaOauthPath(path) && settings.MPESA_CONSUMER_KEY && settings.MPESA_CONSUMER_SECRET) {
    return [settings.MPESA_CONSUMER_KEY, settings.MPESA_CONSUMER_SECRET];
  }
  if (path.startsWith('/sasapay') && settings.SASAPAY_CLIENT_ID && settings.SASAPAY_CLIENT_SECRET) {
    return [settings.SASAPAY_CLIENT_ID, settings.SASAPAY_CLIENT_SECRET];
  }
  return null;
}

export async function validateBasicAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const path = pathOf(request);
  const authorization = request.headers['authorization'];
  if (!authorization) {
    throw new AuthenticationError(basicErrorPayload(path, 'Authorization header is required'));
  }
  const parts = authorization.split(' ');
  if (parts[0] !== 'Basic') {
    throw new AuthenticationError(basicErrorPayload(path, 'Authorization type must be Basic'));
  }
  const encoded = authorization.slice(parts[0].length + 1);
  if (parts.length < 2 || !encoded) {
    throw new AuthenticationError(basicErrorPayload(path, 'Basic auth credentials are required'));
  }
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const idx = decoded.indexOf(':');
    const credentials = idx === -1 ? [decoded] : [decoded.slice(0, idx), decoded.slice(idx + 1)];
    if (credentials.length < 2 || !credentials[0] || !credentials[1]) {
      throw new Error('bad format');
    }
    const expected = expectedBasicCredentials(path);
    if (expected && (credentials[0] !== expected[0] || credentials[1] !== expected[1])) {
      throw new AuthenticationError(basicErrorPayload(path, 'Invalid client credentials'));
    }
    request.log.info(`Basic auth validated: clientId=${credentials[0]}`);
  } catch (exc) {
    if (exc instanceof AuthenticationError) throw exc;
    throw new AuthenticationError(
      basicErrorPayload(path, 'Invalid Basic auth format. Expected CLIENT_ID:CLIENT_SECRET'),
    );
  }
}
