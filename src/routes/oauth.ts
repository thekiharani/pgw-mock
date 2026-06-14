/** Mirrors app/routes/oauth.py. Registered at /oauth and mirrored under /mpesa/oauth. */
import type { FastifyInstance } from 'fastify';

import { validateBasicAuth } from '../auth/basic.js';
import { db } from '../db/client.js';
import { PayloadError } from '../errors.js';
import { registerToken } from '../services/tokens.js';
import { generateDarajaToken } from '../utils/generators.js';

async function generate(grantType: string) {
  if (grantType !== 'client_credentials') {
    throw new PayloadError({
      statusCode: 400,
      payload: { requestId: '', errorCode: 'invalid_grant', errorMessage: 'Invalid grant type' },
    });
  }
  const token = generateDarajaToken();
  await registerToken(db, token, { provider: 'mpesa', expiresIn: 3599, scope: 'daraja' });
  return { access_token: token, expires_in: '3599' };
}

export async function oauthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/generate', { preHandler: validateBasicAuth }, async (request) => {
    const grantType = (request.query as Record<string, any>).grant_type ?? '';
    return generate(grantType);
  });

  app.get('/v2/generate', { preHandler: validateBasicAuth }, async (request) => {
    const grantType = (request.query as Record<string, any>).grant_type ?? '';
    return generate(grantType);
  });
}
