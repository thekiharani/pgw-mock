import type { FastifyReply, FastifyRequest } from 'fastify';

import { getMerchantByMpesaConsumerKey } from '@/actions/mpesaQueries.js';
import { getMerchantBySasapayClientId } from '@/actions/sasapayQueries.js';
import { settings } from '@/config.js';
import { db } from '@/db/client.js';
import { AuthenticationError } from '@/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    authMerchantId?: string;
  }
}

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

// Resolve the merchant whose per-provider credentials match the presented
// id/secret. Daraja uses consumer_key/secret; SasaPay uses client_id/secret.
async function resolveMerchantId(
  path: string,
  clientId: string,
  secret: string,
): Promise<string | null> {
  if (isDarajaOauthPath(path)) {
    const merchant = await getMerchantByMpesaConsumerKey(db, clientId);
    return merchant && merchant.consumer_secret === secret ? merchant.merchant_id : null;
  }
  if (path.startsWith('/sasapay')) {
    const merchant = await getMerchantBySasapayClientId(db, clientId);
    return merchant && merchant.client_secret === secret ? merchant.merchant_id : null;
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

  let clientId: string;
  let secret: string;
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const idx = decoded.indexOf(':');
    if (idx === -1) throw new Error('bad format');
    clientId = decoded.slice(0, idx);
    secret = decoded.slice(idx + 1);
    if (!clientId || !secret) throw new Error('bad format');
  } catch {
    throw new AuthenticationError(
      basicErrorPayload(path, 'Invalid Basic auth format. Expected CLIENT_ID:CLIENT_SECRET'),
    );
  }

  if (settings.STRICT_PROVIDER_AUTH) {
    const merchantId = await resolveMerchantId(path, clientId, secret);
    if (!merchantId) {
      throw new AuthenticationError(basicErrorPayload(path, 'Invalid client credentials'));
    }
    request.authMerchantId = merchantId;
  }
  request.log.info(`Basic auth validated: clientId=${clientId}`);
}
