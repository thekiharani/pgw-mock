/** Shared scaffold for SasaPay outbound (B2C/B2B). Mirrors app/services/sasapay_command.py. */
import type { FastifyRequest } from 'fastify';

import {
  applySasapayBalanceDelta,
  getMerchantBySasapayTill,
  insertSasapayTransaction,
} from '@/actions/sasapayQueries.js';
import { DEFAULT_SASAPAY_CALLBACK } from '@/constants.js';
import { db } from '@/db/client.js';
import { PayloadError } from '@/errors.js';
import { scheduleCallback } from '@/services/callbacks.js';
import { resolveSasapayResult } from '@/services/scenarios.js';
import { PaymentsUtils } from '@/utils/payments.js';
import { generateUlid, uuid7 } from '@/utils/generators.js';

export function sasapayError(
  description: string,
  opts: { code?: string; extras?: Record<string, any> | null } = {},
): Record<string, any> {
  const payload: Record<string, any> = {
    status: false,
    ResponseCode: opts.code ?? '400',
    ResponseDescription: description,
  };
  if (opts.extras) Object.assign(payload, opts.extras);
  return payload;
}

export interface SasaPayContext {
  body: any;
  merchant: Record<string, any>;
  transactionId: string;
  transactionCode: string;
  thirdPartyTransactionCode: string;
  checkoutRequestId: string;
  conversationId: string;
  requestId: string;
  newBalance: number;
  fee: number;
  total: number;
  isSuccess: boolean;
  scenarioCode: string;
  scenarioDescription: string;
  scenarioStatus: string;
  transactionDate: string;
}

export interface SasaPayCommandSpec {
  flow: string;
  category: string;
  requestIdPrefix: string;
}

export interface RunSasapayCommandOptions {
  body: any;
  spec: SasaPayCommandSpec;
  request: FastifyRequest;
  buildPersistenceRecord: (ctx: SasaPayContext) => Record<string, any>;
  buildCallbackPayload: (ctx: SasaPayContext) => Record<string, any>;
  responseExtras?: (ctx: SasaPayContext) => Record<string, any>;
}

function randInt(max: number): number {
  return Math.floor(Math.random() * (max + 1));
}

export async function runSasapayCommand(
  opts: RunSasapayCommandOptions,
): Promise<Record<string, any>> {
  const { body, spec, request } = opts;

  const merchant = await getMerchantBySasapayTill(db, body.MerchantCode);
  if (!merchant) {
    throw new PayloadError({ statusCode: 400, payload: sasapayError('Invalid Merchant Account') });
  }

  const amount = Number(body.Amount);
  const fee = PaymentsUtils.calculateTransactionFee(amount);
  const total = amount + fee;

  const scenario = await resolveSasapayResult(db, request, {
    flow: spec.flow,
    amount,
    reference: body.MerchantTransactionReference,
  });
  const isSuccess = scenario.status === 'SUCCESS';

  const ctx: SasaPayContext = {
    body,
    merchant,
    transactionId: generateUlid(),
    transactionCode: PaymentsUtils.generateTransactionCode('SWEJ18'),
    thirdPartyTransactionCode: PaymentsUtils.generateTransactionCode(),
    checkoutRequestId: uuid7(),
    conversationId: uuid7(),
    requestId: `${spec.requestIdPrefix}${randInt(100_000_000)}`,
    newBalance: 0,
    fee,
    total,
    isSuccess,
    scenarioCode: scenario.code,
    scenarioDescription: scenario.description,
    scenarioStatus: scenario.status,
    transactionDate: PaymentsUtils.generateTimestamp(),
  };

  try {
    await db.transaction(async (tx) => {
      if (isSuccess) {
        const [applied, balStr] = await applySasapayBalanceDelta(tx, merchant.merchant_id, -total);
        if (!applied) {
          throw new PayloadError({ statusCode: 400, payload: sasapayError('Insufficient Funds') });
        }
        ctx.newBalance = Number(balStr);
      } else {
        ctx.newBalance = Number(merchant.merchant_balance);
      }
      const record = opts.buildPersistenceRecord(ctx);
      await insertSasapayTransaction(tx, record as any);
    });
  } catch (exc) {
    if (exc instanceof PayloadError) throw exc;
    request.log.error({ err: exc }, `${spec.flow} persistence failed`);
    throw new PayloadError({
      statusCode: 500,
      payload: sasapayError('Transaction failed to process. Please try again.', { code: '500' }),
    });
  }

  const callbackPayload = opts.buildCallbackPayload(ctx);
  const webhookUrl = body.CallBackURL ? String(body.CallBackURL) : DEFAULT_SASAPAY_CALLBACK;
  scheduleCallback(request, {
    provider: 'sasapay',
    flow: spec.flow,
    eventType: 'result',
    url: webhookUrl,
    payload: callbackPayload,
    transactionId: ctx.transactionId,
  });

  const response: Record<string, any> = {
    status: true,
    detail: 'Success. Request accepted for processing',
    [`${spec.requestIdPrefix}RequestID`]: ctx.requestId,
    ConversationID: ctx.conversationId,
    OriginatorConversationID: body.MerchantTransactionReference,
    TransactionCharges: fee,
    ResponseCode: '0',
    ResponseDescription: 'Success. Request accepted for processing',
  };
  if (opts.responseExtras) Object.assign(response, opts.responseExtras(ctx));
  return response;
}
