import type { FastifyRequest } from 'fastify';

import { PayloadError } from '@/errors.js';

// All three token endpoints (Daraja oauth, SasaPay v1, SasaPay WaaS) require
// `grant_type=client_credentials` as a query param. This normalizes the check:
// a 400 with the provider's error envelope on a missing/wrong grant_type, and
// extra query params are ignored (the real APIs do not reject them).
export function requireClientCredentialsGrant(
  request: FastifyRequest,
  provider: 'daraja' | 'sasapay',
): void {
  const query = (request.query ?? {}) as Record<string, unknown>;
  if (query.grant_type === 'client_credentials') return;

  if (provider === 'daraja') {
    throw new PayloadError({
      statusCode: 400,
      payload: { requestId: '', errorCode: 'invalid_grant', errorMessage: 'Invalid grant type' },
    });
  }
  throw new PayloadError({
    statusCode: 400,
    payload: {
      status: false,
      responseCode: '400',
      detail: 'Invalid grant_type. Expected client_credentials',
    },
  });
}
