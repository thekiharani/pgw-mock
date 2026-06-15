import { desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { db } from '@/db/client.js';
import { callbackDeliveries } from '@/db/schema.js';
import { PayloadError } from '@/errors.js';
import { scheduleCallback } from '@/services/callbacks.js';
import {
  MPESA_RESULT_CATALOG,
  SASAPAY_RESULT_CATALOG,
  createScenario,
} from '@/services/scenarios.js';
import { PaymentsUtils } from '@/utils/payments.js';
import { uuid7 } from '@/utils/generators.js';
import { invoices, optIns, standingOrders } from '@/routes/stores.js';

const ScenarioRequest = z
  .object({
    provider: z.enum(['mpesa', 'sasapay']),
    flow: z
      .string()
      .optional()
      .transform((v) => (v === undefined ? '*' : v.trim()))
      .pipe(z.string().min(1, 'flow must not be empty')),
    selectorType: z.enum(['default', 'amount', 'reference']).default('default'),
    selectorValue: z.string().nullish(),
    resultCode: z.string(),
    resultDescription: z.string().nullish(),
    status: z.string().nullish(),
    payload: z.record(z.string(), z.any()).nullish(),
  })
  .strict();

const InvoicePayRequest = z
  .object({
    paymentReference: z.string().nullish(),
    msisdn: z.string().nullish(),
    amount: z.union([z.number(), z.string()]).nullish(),
    shortcode: z.string().nullish(),
  })
  .strict();

const StandingOrderTickRequest = z
  .object({
    amount: z.union([z.number(), z.string()]).nullish(),
    msisdn: z.string().nullish(),
  })
  .strict();

function iso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value
    .toISOString()
    .replace('Z', '')
    .replace(/\.000$/, '');
}

export async function mockAdminRoutes(app: FastifyInstance): Promise<void> {
  app.post('/scenarios', { schema: { body: ScenarioRequest } }, async (request) => {
    const body = request.body as z.infer<typeof ScenarioRequest>;
    const catalog = body.provider === 'mpesa' ? MPESA_RESULT_CATALOG : SASAPAY_RESULT_CATALOG;
    const entry = catalog[body.resultCode];
    const resultDescription =
      body.resultDescription ?? (entry ? entry.description : 'Mock scenario');
    const status = body.status ?? (entry ? entry.status : 'FAILED');

    const scenario = await createScenario(db, {
      provider: body.provider,
      flow: body.flow,
      selectorType: body.selectorType,
      selectorValue: body.selectorValue ?? null,
      resultCode: body.resultCode,
      resultDescription,
      status,
      payload: body.payload ?? null,
    });
    return {
      status: true,
      data: {
        id: scenario.id,
        provider: scenario.provider,
        flow: scenario.flow,
        selectorType: scenario.selector_type,
        selectorValue: scenario.selector_value,
        resultCode: scenario.result_code,
        resultDescription: scenario.result_description,
        scenarioStatus: scenario.status,
      },
    };
  });

  app.get('/callback-deliveries', async () => {
    const deliveries = await db
      .select()
      .from(callbackDeliveries)
      .orderBy(desc(callbackDeliveries.createdAt))
      .limit(100);
    return {
      status: true,
      data: deliveries.map((d) => ({
        id: d.id,
        provider: d.provider,
        flow: d.flow,
        eventType: d.eventType,
        url: d.url,
        deliveryStatus: d.status,
        attempts: d.attempts,
        lastStatusCode: d.lastStatusCode,
        lastError: d.lastError,
        deliveredAt: iso(d.deliveredAt),
        createdAt: iso(d.createdAt),
        payload: d.payload,
      })),
    };
  });

  app.post(
    '/billmanager/invoices/:invoice_number/pay',
    { schema: { body: InvoicePayRequest } },
    async (request) => {
      const invoiceNumber = String((request.params as Record<string, string>).invoice_number);
      const body = request.body as z.infer<typeof InvoicePayRequest>;
      const invoice = invoices.get(invoiceNumber);
      if (!invoice) {
        throw new PayloadError({
          statusCode: 404,
          payload: { rescode: '404', resmsg: 'Invoice not found.', invoiceNumber },
        });
      }
      if (invoice.status === 'CANCELLED') {
        throw new PayloadError({
          statusCode: 409,
          payload: { rescode: '409', resmsg: 'Cancelled invoice cannot be paid.', invoiceNumber },
        });
      }
      if (invoice.status === 'PAID') {
        throw new PayloadError({
          statusCode: 409,
          payload: { rescode: '409', resmsg: 'Invoice has already been paid.', invoiceNumber },
        });
      }

      invoice.status = 'PAID';
      invoice.paidAt = new Date().toISOString();
      const paymentRef = body.paymentReference || PaymentsUtils.generateTransactionCode();
      const msisdn = body.msisdn || '254700000000';
      const amount = body.amount || invoice.amount || 0;

      const callbackPayload = {
        Mpesa: {
          TransactionType: 'Pay Bill',
          TransID: paymentRef,
          TransTime: PaymentsUtils.generateTimestamp(),
          TransAmount: String(amount),
          BillRefNumber: invoice.accountReference || invoiceNumber,
          InvoiceNumber: invoiceNumber,
          OrgAccountBalance: '0.00',
          MSISDN: msisdn,
          FirstName: PaymentsUtils.getRandomName().split(' ')[0],
        },
        InvoiceNumber: invoiceNumber,
        PaymentReference: paymentRef,
        Status: 'PAID',
      };

      const targetShortcodes = body.shortcode ? [body.shortcode] : [...optIns.keys()];
      const deliveredTo: string[] = [];
      for (const sc of targetShortcodes) {
        const optIn = optIns.get(sc);
        if (!optIn || !optIn.callbackurl) continue;
        scheduleCallback(request, {
          provider: 'mpesa',
          flow: 'bill_manager',
          eventType: 'invoice_paid',
          url: optIn.callbackurl,
          payload: callbackPayload,
        });
        deliveredTo.push(sc);
      }

      return {
        rescode: '0',
        resmsg: 'Invoice payment simulated.',
        invoiceNumber,
        paymentReference: paymentRef,
        callbacksDispatched: deliveredTo,
      };
    },
  );

  app.post(
    '/standing-orders/:standing_order_id/tick',
    { schema: { body: StandingOrderTickRequest } },
    async (request) => {
      const standingOrderId = String((request.params as Record<string, string>).standing_order_id);
      const body = request.body as z.infer<typeof StandingOrderTickRequest>;
      const order = standingOrders.get(standingOrderId);
      if (!order) {
        throw new PayloadError({
          statusCode: 404,
          payload: {
            ResponseHeader: { responseStatus: 'FAILED', responseCode: '404' },
            ResponseBody: { responseDescription: 'Standing order not found' },
          },
        });
      }

      order.ticks += 1;
      const transactionId = PaymentsUtils.generateTransactionCode();
      const amount = body.amount || order.amount;
      const msisdn = body.msisdn || order.partyA;

      const callbackPayload = {
        ResponseHeader: {
          responseRefID: uuid7(),
          responseStatus: 'SUCCESS',
          responseCode: '0',
          ResultDesc: 'Standing order debit completed.',
        },
        ResponseBody: {
          standingOrderId,
          transactionId,
          amount: String(amount),
          msisdn,
          transactionType: order.transactionType,
          businessShortCode: order.businessShortCode,
          accountReference: order.accountReference,
          tickNumber: order.ticks,
          executedAt: new Date().toISOString(),
        },
      };
      scheduleCallback(request, {
        provider: 'mpesa',
        flow: 'standing_order',
        eventType: 'debit',
        url: order.callbackUrl,
        payload: callbackPayload,
      });

      return {
        ResponseHeader: {
          responseStatus: 'SUCCESS',
          responseCode: '200',
          ResultDesc: 'Standing order debit simulated.',
        },
        ResponseBody: {
          standingOrderId,
          transactionId,
          tickNumber: order.ticks,
        },
      };
    },
  );
}
