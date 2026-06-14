/**
 * Shared scaffold for M-Pesa command-style endpoints (B2C, B2B, Reversal,
 * TransactionStatus, AccountBalance, TaxRemit). Mirrors app/services/mpesa_command.py.
 */
import type { FastifyRequest } from 'fastify';

import { settings } from '@/config.js';
import { db } from '@/db/client.js';
import { PayloadError } from '@/errors.js';
import {
  applyMpesaBalanceDelta,
  getMerchantByMpesaPaybill,
  insertMpesaTransaction,
} from '@/actions/mpesaQueries.js';
import { scheduleCallback } from '@/services/callbacks.js';
import { type Operation, enforceCapability } from '@/services/capabilities.js';
import { isTimeoutResult, resolveMpesaResult } from '@/services/scenarios.js';
import { PaymentsUtils } from '@/utils/payments.js';
import { generateUlid, uuid7 } from '@/utils/generators.js';

export function mpesaError(
  description: string,
  opts: {
    conversationId?: string | null;
    originatorId?: string | null;
    code?: string;
    extras?: Record<string, any> | null;
  } = {},
): Record<string, any> {
  const payload: Record<string, any> = {
    ResponseCode: opts.code ?? '400',
    ResponseDescription: description,
  };
  if (opts.originatorId != null) payload.OriginatorConversationID = opts.originatorId;
  if (opts.conversationId != null) payload.ConversationID = opts.conversationId;
  if (opts.extras) Object.assign(payload, opts.extras);
  return payload;
}

export interface MpesaCommandContext {
  body: any;
  merchant: Record<string, any>;
  conversationId: string;
  originatorConversationId: string;
  transactionId: string;
  transactionCode: string;
  scenarioCode: string;
  scenarioDescription: string;
  scenarioStatus: string;
  isSuccess: boolean;
  newBalance: number;
  amount: number;
}

export interface MpesaCommandSpec {
  flow: string;
  partyAAttr: string;
  invalidPartyAMessage: string;
  requiredStrictFields: string[];
  transactionCategory: string;
  transactionType: string;
  capabilityOperation?: Operation;
  transactionSubType?: string;
  requiresBalance?: boolean;
  balanceDeltaSign?: number;
  referenceAttr?: string | null;
}

export interface RunMpesaCommandOptions {
  body: any;
  spec: MpesaCommandSpec;
  request: FastifyRequest;
  buildPersistenceRecord: (ctx: MpesaCommandContext) => Record<string, any>;
  buildCallbackPayload: (ctx: MpesaCommandContext) => Record<string, any>;
  callbackUrl: (ctx: MpesaCommandContext) => string;
  queueTimeoutUrl?: (ctx: MpesaCommandContext) => string | null;
  extraPreconditions?: (ctx: MpesaCommandContext, exec: any) => Promise<void>;
  responseExtras?: (ctx: MpesaCommandContext) => Record<string, any>;
}

export async function runMpesaCommand(opts: RunMpesaCommandOptions): Promise<Record<string, any>> {
  const { body, spec, request } = opts;
  const balanceDeltaSign = spec.balanceDeltaSign ?? -1;
  const capabilityOperation = spec.capabilityOperation ?? 'b2c';

  const conversationId = `AG_${uuid7()}`;
  const originatorConversationId = uuid7();

  // Strict validation
  if (settings.STRICT_PROVIDER_VALIDATION) {
    const missing = spec.requiredStrictFields.filter((f) => !body[f]);
    if (missing.length) {
      throw new PayloadError({
        statusCode: 400,
        payload: mpesaError(`Missing required fields: ${missing.join(', ')}`, {
          conversationId,
          originatorId: originatorConversationId,
        }),
      });
    }
  }
  if (
    settings.MPESA_SECURITY_CREDENTIAL &&
    body.SecurityCredential !== settings.MPESA_SECURITY_CREDENTIAL
  ) {
    throw new PayloadError({
      statusCode: 400,
      payload: mpesaError('Invalid SecurityCredential', {
        conversationId,
        originatorId: originatorConversationId,
      }),
    });
  }

  // Merchant lookup
  const partyAValue = body[spec.partyAAttr];
  const merchant = await getMerchantByMpesaPaybill(db, String(partyAValue));
  if (!merchant) {
    throw new PayloadError({
      statusCode: 400,
      payload: mpesaError(spec.invalidPartyAMessage, {
        conversationId,
        originatorId: originatorConversationId,
      }),
    });
  }

  enforceCapability(merchant, capabilityOperation);

  const amount = Number(body.Amount ?? 0) || 0;
  const referenceValue = spec.referenceAttr ? body[spec.referenceAttr] : null;
  const scenario = await resolveMpesaResult(db, request, {
    flow: spec.flow,
    amount,
    reference: referenceValue ? String(referenceValue) : null,
  });
  const isSuccess = scenario.code === '0';

  const transactionId = generateUlid();
  const transactionCode = PaymentsUtils.generateTransactionCode();

  const delta = isSuccess ? balanceDeltaSign * amount : 0;

  let ctx!: MpesaCommandContext;
  try {
    await db.transaction(async (tx) => {
      let newBalance: number;
      if (delta !== 0) {
        const [applied, balStr] = await applyMpesaBalanceDelta(tx, merchant.merchant_id, delta);
        if (!applied) {
          throw new PayloadError({
            statusCode: 400,
            payload: mpesaError('Insufficient funds', {
              conversationId,
              originatorId: originatorConversationId,
            }),
          });
        }
        newBalance = Number(balStr);
      } else {
        newBalance = Number(merchant.merchant_balance);
      }

      ctx = {
        body,
        merchant,
        conversationId,
        originatorConversationId,
        transactionId,
        transactionCode,
        scenarioCode: scenario.code,
        scenarioDescription: scenario.description,
        scenarioStatus: scenario.status,
        isSuccess,
        newBalance,
        amount,
      };

      if (opts.extraPreconditions) await opts.extraPreconditions(ctx, tx);

      const record = opts.buildPersistenceRecord(ctx);
      await insertMpesaTransaction(tx, record as any);
    });
  } catch (exc) {
    if (exc instanceof PayloadError) throw exc;
    request.log.error({ err: exc }, `${spec.flow} persistence failed`);
    throw new PayloadError({
      statusCode: 500,
      payload: mpesaError('Transaction failed to process', {
        conversationId,
        originatorId: originatorConversationId,
        code: '500',
      }),
    });
  }

  const callbackPayload = opts.buildCallbackPayload(ctx);
  const timeoutUrlValue = opts.queueTimeoutUrl ? opts.queueTimeoutUrl(ctx) : null;
  let targetUrl = opts.callbackUrl(ctx);
  if (isTimeoutResult(scenario.code) && timeoutUrlValue) {
    targetUrl = timeoutUrlValue;
  }

  scheduleCallback(request, {
    provider: 'mpesa',
    flow: spec.flow,
    eventType: 'result',
    url: targetUrl,
    payload: callbackPayload,
    transactionId,
  });

  const response: Record<string, any> = {
    OriginatorConversationID: originatorConversationId,
    ConversationID: conversationId,
    ResponseCode: '0',
    ResponseDescription: 'Accept the service request successfully.',
  };
  if (opts.responseExtras) Object.assign(response, opts.responseExtras(ctx));
  return response;
}

export function mpesaResultEnvelope(
  ctx: MpesaCommandContext,
  opts: {
    queueTimeoutUrl?: string;
    resultParameters?: Array<Record<string, any>> | null;
    referenceItems?: Array<Record<string, any>> | null;
    extra?: Record<string, any> | null;
  } = {},
): Record<string, any> {
  const queueTimeoutUrl = opts.queueTimeoutUrl ?? '';
  const body: Record<string, any> = {
    ResultType: 0,
    ResultCode: /^\d+$/.test(ctx.scenarioCode) ? Number(ctx.scenarioCode) : ctx.scenarioCode,
    ResultDesc: ctx.scenarioDescription,
    OriginatorConversationID: ctx.originatorConversationId,
    ConversationID: ctx.conversationId,
    TransactionID: ctx.transactionCode,
    ReferenceData: {
      ReferenceItem:
        opts.referenceItems !== undefined && opts.referenceItems !== null
          ? opts.referenceItems
          : { Key: 'QueueTimeoutURL', Value: queueTimeoutUrl },
    },
  };
  if (ctx.isSuccess && opts.resultParameters) {
    body.ResultParameters = { ResultParameter: opts.resultParameters };
  }
  const payload: Record<string, any> = { Result: body, source: 'demo' };
  if (opts.extra) Object.assign(payload, opts.extra);
  return payload;
}
