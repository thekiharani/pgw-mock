import type { FastifyInstance } from 'fastify';

import { validateBearerToken } from '@/auth/bearer.js';
import { B2BExpressCheckoutRequest } from '@/schemas/mpesa.js';
import { scheduleCallback } from '@/services/callbacks.js';
import { uuid7 } from '@/utils/generators.js';

export async function b2bExpressRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', validateBearerToken);

  app.post(
    '/v1/ussdpush/get-msisdn',
    { schema: { body: B2BExpressCheckoutRequest } },
    async (request) => {
      const body = request.body as any;
      const code = uuid7();
      const callbackPayload = {
        resultCode: '0',
        resultDesc: 'The service request is processed successfully.',
        amount: body.amount,
        requestId: body.RequestRefID,
        resultType: 'SUCCESS',
        conversationID: code,
        transactionId: uuid7(),
        status: 'SUCCESS',
      };
      scheduleCallback(request, {
        provider: 'mpesa',
        flow: 'b2b_express',
        eventType: 'result',
        url: String(body.callbackUrl),
        payload: callbackPayload,
      });
      return { code: '0', status: 'USSD Initiated Successfully' };
    },
  );
}
