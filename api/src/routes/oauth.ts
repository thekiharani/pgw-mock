import type { FastifyInstance } from 'fastify';

import { validateBasicAuth } from '@/auth/basic.js';
import { requireClientCredentialsGrant } from '@/auth/grant.js';
import { db } from '@/db/client.js';
import { registerToken } from '@/services/tokens.js';
import { generateDarajaToken } from '@/utils/generators.js';

async function issueToken(merchantId?: string) {
  const token = generateDarajaToken();
  await registerToken(db, token, {
    provider: 'mpesa',
    expiresIn: 3599,
    scope: 'daraja',
    meta: { merchantId: merchantId ?? null },
  });
  return { access_token: token, expires_in: '3599' };
}

export async function oauthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/generate', { preHandler: validateBasicAuth }, async (request) => {
    requireClientCredentialsGrant(request, 'daraja');
    return issueToken(request.authMerchantId);
  });
}
