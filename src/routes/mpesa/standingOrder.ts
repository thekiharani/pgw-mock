/** Daraja M-Pesa Ratiba (Standing Orders). Mirrors app/routes/mpesa/standing_order.py. */
import type { FastifyInstance } from 'fastify';

import { validateBearerToken } from '../../auth/bearer.js';
import { db } from '../../db/client.js';
import { PayloadError } from '../../errors.js';
import { getMerchantByMpesaPaybill } from '../../actions/mpesaQueries.js';
import { StandingOrderRequest } from '../../schemas/mpesa.js';
import { scheduleCallback } from '../../services/callbacks.js';
import { enforceCapability } from '../../services/capabilities.js';
import { uuid7 } from '../../utils/generators.js';
import { standingOrders } from '../stores.js';

export async function standingOrderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', validateBearerToken);

  app.post(
    '/standingorder/v1/createStandingOrderExternal',
    { schema: { body: StandingOrderRequest } },
    async (request) => {
      const body = request.body as any;
      const merchant = await getMerchantByMpesaPaybill(db, String(body.BusinessShortCode));
      if (!merchant) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            ResponseCode: '400',
            ResponseHeader: { responseRefID: uuid7(), responseStatus: 'FAILED' },
            ResponseDescription: 'Invalid BusinessShortCode',
          },
        });
      }

      enforceCapability(merchant, 'stk_push', { transactionType: 'CustomerPayBillOnline' });

      const responseRefId = uuid7();
      const standingOrderId = uuid7();

      standingOrders.set(standingOrderId, {
        id: standingOrderId,
        name: body.StandingOrderName,
        businessShortCode: String(body.BusinessShortCode),
        transactionType: body.TransactionType,
        amount: String(body.Amount),
        partyA: String(body.PartyA),
        callbackUrl: String(body.CallBackURL),
        accountReference: body.AccountReference,
        transactionDesc: body.TransactionDesc ?? null,
        frequency: body.Frequency,
        startDate: body.StartDate,
        endDate: body.EndDate,
        ticks: 0,
      });

      const callbackPayload = {
        ResponseHeader: {
          responseRefID: responseRefId,
          responseStatus: 'SUCCESS',
          responseCode: '0',
          ResultDesc: 'Standing Order created successfully.',
        },
        ResponseBody: {
          responseDescription: 'Standing Order created successfully.',
          responseCode: '200',
          standingOrderId,
          merchantRequestId: uuid7(),
        },
      };
      scheduleCallback(request, {
        provider: 'mpesa',
        flow: 'standing_order',
        eventType: 'result',
        url: String(body.CallBackURL),
        payload: callbackPayload,
      });

      return {
        ResponseHeader: {
          responseRefID: responseRefId,
          responseStatus: 'SUCCESS',
          responseCode: '200',
          ResultDesc: 'Request accepted for processing',
        },
        ResponseBody: {
          responseDescription: 'Standing Order created successfully.',
          responseCode: '200',
        },
      };
    },
  );
}
