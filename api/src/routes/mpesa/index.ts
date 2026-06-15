import type { FastifyInstance } from 'fastify';

import { validateBearerToken } from '@/auth/bearer.js';
import { settings } from '@/config.js';
import { db } from '@/db/client.js';
import { PayloadError } from '@/errors.js';
import {
  applyMpesaBalanceDelta,
  getMerchantByMpesaPaybill,
  getMpesaReversalByOriginalTransactionId,
  getMpesaTransactionByCheckoutRequestId,
  getMpesaTransactionByCode,
  insertMpesaTransaction,
  updateMerchantMpesaMeta,
} from '@/actions/mpesaQueries.js';
import {
  AccountBalanceRequest,
  B2BRequest,
  B2CRequest,
  C2BRegisterURLRequest,
  C2BSimulateRequest,
  QRCodeRequest,
  ReversalRequest,
  STKPushQueryRequest,
  STKPushRequest,
  TaxRemitRequest,
  TransactionStatusRequest,
} from '@/schemas/mpesa.js';
import { deliverCallback, scheduleCallback } from '@/services/callbacks.js';
import { enforceCapability } from '@/services/capabilities.js';
import {
  type MpesaCommandSpec,
  mpesaError,
  mpesaResultEnvelope,
  runMpesaCommand,
} from '@/services/mpesaCommand.js';
import { isTimeoutResult, resolveMpesaResult } from '@/services/scenarios.js';
import { enqueueBackgroundTask } from '@/utils/background.js';
import { pyFloat } from '@/utils/format.js';
import { uuid7 } from '@/utils/generators.js';
import { PaymentsUtils } from '@/utils/payments.js';

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

export async function mpesaCoreRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', validateBearerToken);

  app.post('/stkpush/v1/processrequest', { schema: { body: STKPushRequest } }, async (request) => {
    const body = request.body as any;
    const amount = body.Amount;
    const partyB = body.BusinessShortCode || body.PartyB;
    const customerPhone = body.PhoneNumber || body.PartyA;
    const callbackUrl = String(body.CallBackURL);
    const accountReference = body.AccountReference;

    const merchantRequestId = uuid7();
    const checkoutRequestId = `ws_CO_${uuid7()}`;

    if (settings.STRICT_PROVIDER_VALIDATION) {
      const missing = [
        'BusinessShortCode',
        'Password',
        'Timestamp',
        'TransactionType',
        'PhoneNumber',
      ].filter((f) => !body[f]);
      if (missing.length) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            ResponseCode: '400',
            CheckoutRequestID: checkoutRequestId,
            MerchantRequestID: merchantRequestId,
            ResponseDescription: `Missing required fields: ${missing.join(', ')}`,
          },
        });
      }
    }
    if (settings.MPESA_PASSKEY) {
      if (!body.Password || !body.Timestamp) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            ResponseCode: '400',
            CheckoutRequestID: checkoutRequestId,
            MerchantRequestID: merchantRequestId,
            ResponseDescription: 'Password and Timestamp are required',
          },
        });
      }
      const expected = Buffer.from(`${partyB}${settings.MPESA_PASSKEY}${body.Timestamp}`).toString(
        'base64',
      );
      if (body.Password !== expected) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            ResponseCode: '400',
            CheckoutRequestID: checkoutRequestId,
            MerchantRequestID: merchantRequestId,
            ResponseDescription: 'Invalid STK Password',
          },
        });
      }
    }

    const merchant = await getMerchantByMpesaPaybill(db, String(partyB));
    if (!merchant) {
      throw new PayloadError({
        statusCode: 400,
        payload: {
          ResponseCode: '400',
          CheckoutRequestID: checkoutRequestId,
          MerchantRequestID: merchantRequestId,
          ResponseDescription: 'Invalid Merchant Paybill',
        },
      });
    }

    enforceCapability(merchant, 'stk_push', {
      transactionType: body.TransactionType || 'CustomerPayBillOnline',
    });

    const scenario = await resolveMpesaResult(db, request, {
      flow: 'stk',
      amount,
      reference: accountReference,
    });
    const resultCode = scenario.code;
    const resultDescription = scenario.description;
    const resultStatus = scenario.status;
    const isSuccess = resultCode === '0';
    const mpesaCode = PaymentsUtils.generateTransactionCode();
    const transactionId = uuid7();
    const txTime = PaymentsUtils.generateTimestamp();
    const senderName = PaymentsUtils.getRandomName();

    let newBalance: number;
    try {
      await db.transaction(async (tx) => {
        if (isSuccess) {
          const [, balStr] = await applyMpesaBalanceDelta(tx, merchant.merchant_id, Number(amount));
          newBalance = Number(balStr);
        } else {
          newBalance = Number(merchant.merchant_balance);
        }
        await insertMpesaTransaction(tx, {
          id: transactionId,
          transaction_code: mpesaCode,
          merchant_id: merchant.merchant_id,
          merchant_request_id: merchantRequestId,
          merchant_reference: accountReference,
          checkout_request_id: checkoutRequestId,
          result_code: resultCode,
          result_description: resultDescription,
          gateway: 'MPESA',
          destination: 'MPESA',
          sender_name: senderName,
          sender_account_number: String(customerPhone),
          recipient_name: merchant.merchant_name,
          recipient_account_number: String(partyB),
          amount,
          fees: 0,
          merchant_balance: newBalance,
          type: 'CREDIT',
          sub_type: 'CHARGE',
          category: 'C2B',
          status: resultStatus,
          meta: { payload: body },
        });
      });
    } catch {
      throw new PayloadError({
        statusCode: 500,
        payload: {
          ResponseCode: '500',
          CheckoutRequestID: checkoutRequestId,
          MerchantRequestID: merchantRequestId,
          ResponseDescription: 'Transaction failed to process',
        },
      });
    }

    const stkCallback: Record<string, any> = {
      ResultCode: Number(resultCode),
      ResultDesc: resultDescription,
      CheckoutRequestID: checkoutRequestId,
      MerchantRequestID: merchantRequestId,
    };
    if (isSuccess) {
      stkCallback.CallbackMetadata = {
        Item: [
          { Name: 'Amount', Value: amount },
          { Name: 'MpesaReceiptNumber', Value: mpesaCode },
          { Name: 'Balance', Value: newBalance! },
          { Name: 'TransactionDate', Value: txTime },
          { Name: 'PhoneNumber', Value: customerPhone },
        ],
      };
    }
    const stkWebhookData = { Body: { stkCallback } };

    let c2bWebhookData: Record<string, any> | null = null;
    if (isSuccess) {
      c2bWebhookData = {
        MSISDN: customerPhone,
        TransID: mpesaCode,
        FirstName: senderName.split(' ')[0],
        TransTime: txTime,
        TransAmount: amount,
        BillRefNumber: accountReference,
        InvoiceNumber: accountReference,
        TransactionType:
          body.TransactionType !== 'CustomerBuyGoodsOnline' ? 'Pay Bill' : 'Buy Goods',
        BusinessShortCode: String(partyB),
        OrgAccountBalance: newBalance!,
        ThirdPartyTransID: '',
        source: 'demo',
      };
    }

    const confirmationUrl =
      merchant.merchant_meta?.mpesa?.c2b_confirmation ||
      `${settings.PAYMENTS_SERVICE_URL}/m/confirmation`;

    enqueueBackgroundTask(request, async () => {
      await deliverCallback({
        provider: 'mpesa',
        flow: 'stk',
        eventType: 'stk_callback',
        url: callbackUrl,
        payload: stkWebhookData,
        transactionId,
      });
      if (c2bWebhookData) {
        await sleep(settings.MOCK_CALLBACK_DELAY_SECONDS);
        await deliverCallback({
          provider: 'mpesa',
          flow: 'stk',
          eventType: 'c2b_confirmation',
          url: confirmationUrl,
          payload: c2bWebhookData,
          transactionId,
        });
      }
    });

    return {
      MerchantRequestID: merchantRequestId,
      CheckoutRequestID: checkoutRequestId,
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: 'Success. Request accepted for processing',
    };
  });

  app.post('/stkpushquery/v1/query', { schema: { body: STKPushQueryRequest } }, async (request) => {
    const body = request.body as any;
    const checkoutRequestId = body.CheckoutRequestID;

    if (settings.STRICT_PROVIDER_VALIDATION) {
      const missing = ['BusinessShortCode', 'Password', 'Timestamp'].filter((f) => !body[f]);
      if (missing.length) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            ResponseCode: '400',
            CheckoutRequestID: checkoutRequestId,
            MerchantRequestID: '',
            ResponseDescription: `Missing required fields: ${missing.join(', ')}`,
          },
        });
      }
    }

    const transaction = await getMpesaTransactionByCheckoutRequestId(db, String(checkoutRequestId));
    if (!transaction) {
      throw new PayloadError({
        statusCode: 400,
        payload: {
          ResponseCode: '1',
          ResponseDescription: 'The transaction is being processed',
          MerchantRequestID: '',
          CheckoutRequestID: checkoutRequestId,
          ResultCode: '1',
          ResultDesc: 'The transaction is being processed',
        },
      });
    }

    return {
      ResponseCode: '0',
      ResponseDescription: 'The service request has been accepted successfully',
      MerchantRequestID: transaction.merchant_request_id,
      CheckoutRequestID: transaction.checkout_request_id,
      ResultCode: String(transaction.result_code ?? 0),
      ResultDesc:
        transaction.result_description || 'The service request is processed successfully.',
    };
  });

  const handleRegisterUrl = async (request: any) => {
    const body = request.body as any;
    const shortCode = body.ShortCode;
    const responseType = body.ResponseType;
    const confirmationUrl = String(body.ConfirmationURL);
    const validationUrl = body.ValidationURL ? String(body.ValidationURL) : null;

    const originatorConversationId = uuid7();
    const merchant = await getMerchantByMpesaPaybill(db, String(shortCode));
    if (!merchant) {
      throw new PayloadError({
        statusCode: 400,
        payload: {
          OriginatorConversationID: originatorConversationId,
          ResponseCode: '400',
          ResponseDescription: 'Invalid ShortCode',
        },
      });
    }

    enforceCapability(merchant, 'c2b_register_url');

    const currentMeta = merchant.merchant_meta ?? {};
    const existingMpesaMeta = currentMeta.mpesa ?? {};
    if (settings.STRICT_PROVIDER_VALIDATION) {
      if (!responseType) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            OriginatorConversationID: originatorConversationId,
            ResponseCode: '400',
            ResponseDescription: 'ResponseType is required',
          },
        });
      }
      if (
        !confirmationUrl.startsWith('https://') ||
        (validationUrl && !validationUrl.startsWith('https://'))
      ) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            OriginatorConversationID: originatorConversationId,
            ResponseCode: '400',
            ResponseDescription: 'ConfirmationURL and ValidationURL must use HTTPS',
          },
        });
      }
      if (existingMpesaMeta.c2b_confirmation) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            OriginatorConversationID: originatorConversationId,
            ResponseCode: '400',
            ResponseDescription: 'C2B URLs are already registered',
          },
        });
      }
    }

    const updatedMeta = {
      ...currentMeta,
      mpesa: {
        ...existingMpesaMeta,
        c2b_confirmation: confirmationUrl,
        c2b_validation: validationUrl,
        response_type: responseType,
      },
    };

    try {
      await updateMerchantMpesaMeta(db, merchant.merchant_id, updatedMeta);
    } catch {
      throw new PayloadError({
        statusCode: 500,
        payload: {
          OriginatorConversationID: originatorConversationId,
          ResponseCode: '500',
          ResponseDescription: 'Failed to register URLs',
        },
      });
    }

    return {
      OriginatorConversationID: originatorConversationId,
      ResponseCode: '0',
      ResponseDescription: 'success',
    };
  };
  app.post('/c2b/v1/registerurl', { schema: { body: C2BRegisterURLRequest } }, handleRegisterUrl);
  app.post('/c2b/v2/registerurl', { schema: { body: C2BRegisterURLRequest } }, handleRegisterUrl);

  app.post('/c2b/v1/simulate', { schema: { body: C2BSimulateRequest } }, async (request) => {
    const body = request.body as any;
    const shortCode = body.ShortCode;
    const amount = body.Amount;
    const msisdn = body.Msisdn;
    const billRefNumber = body.BillRefNumber ?? null;
    const originatorConversationId = uuid7();

    if (settings.STRICT_PROVIDER_VALIDATION && !body.CommandID) {
      throw new PayloadError({
        statusCode: 400,
        payload: {
          OriginatorConversationID: originatorConversationId,
          ResponseCode: '400',
          ResponseDescription: 'CommandID is required',
        },
      });
    }

    const merchant = await getMerchantByMpesaPaybill(db, String(shortCode));
    if (!merchant) {
      throw new PayloadError({
        statusCode: 400,
        payload: {
          OriginatorConversationID: originatorConversationId,
          ResponseCode: '400',
          ResponseDescription: 'Invalid Merchant Paybill',
        },
      });
    }

    enforceCapability(merchant, 'c2b_simulate', {
      commandId: body.CommandID || 'CustomerPayBillOnline',
    });

    const scenario = await resolveMpesaResult(db, request, {
      flow: 'c2b',
      amount,
      reference: billRefNumber,
    });
    const resultCode = scenario.code;
    const resultDescription = scenario.description;
    const resultStatus = scenario.status;
    const isSuccess = resultCode === '0';
    const transId = PaymentsUtils.generateTransactionCode();
    const transactionId = uuid7();
    const senderName = PaymentsUtils.getRandomName();

    let newBalance: number;
    try {
      await db.transaction(async (tx) => {
        if (isSuccess) {
          const [, balStr] = await applyMpesaBalanceDelta(tx, merchant.merchant_id, Number(amount));
          newBalance = Number(balStr);
        } else {
          newBalance = Number(merchant.merchant_balance);
        }
        await insertMpesaTransaction(tx, {
          id: transactionId,
          transaction_code: transId,
          merchant_id: merchant.merchant_id,
          merchant_request_id: originatorConversationId,
          merchant_reference: billRefNumber,
          checkout_request_id: null,
          result_code: resultCode,
          result_description: resultDescription,
          gateway: 'MPESA',
          destination: 'MPESA',
          sender_name: senderName,
          sender_account_number: String(msisdn),
          recipient_name: merchant.merchant_name,
          recipient_account_number: String(shortCode),
          amount,
          fees: 0,
          merchant_balance: newBalance,
          type: 'CREDIT',
          sub_type: 'CHARGE',
          category: 'C2B',
          status: resultStatus,
          meta: { payload: body },
        });
      });
    } catch {
      throw new PayloadError({
        statusCode: 500,
        payload: {
          OriginatorConversationID: originatorConversationId,
          ResponseCode: '500',
          ResponseDescription: 'Transaction failed to process',
        },
      });
    }

    const transactionType = body.CommandID === 'CustomerBuyGoodsOnline' ? 'Buy Goods' : 'Pay Bill';
    const transTime = PaymentsUtils.generateTimestamp();
    const transAmount = Number(amount).toFixed(2);
    const webhookData: Record<string, any> = {
      MSISDN: msisdn,
      TransID: transId,
      FirstName: senderName.split(' ')[0],
      TransTime: transTime,
      TransAmount: transAmount,
      BillRefNumber: billRefNumber,
      InvoiceNumber: billRefNumber,
      TransactionType: transactionType,
      BusinessShortCode: String(shortCode),
      OrgAccountBalance: newBalance!,
      ThirdPartyTransID: '',
      source: 'demo',
    };
    const validationData = {
      TransactionType: transactionType,
      TransID: transId,
      TransTime: transTime,
      TransAmount: transAmount,
      BusinessShortCode: String(shortCode),
      BillRefNumber: billRefNumber,
      InvoiceNumber: billRefNumber,
      MSISDN: msisdn,
      FirstName: senderName.split(' ')[0],
      ResultCode: isSuccess ? 0 : Number(resultCode),
      ResultDesc: resultDescription,
    };

    const mpesaMeta = merchant.merchant_meta?.mpesa ?? {};
    const confirmationUrl =
      mpesaMeta.c2b_confirmation || `${settings.PAYMENTS_SERVICE_URL}/m/confirmation`;
    const validationUrl = mpesaMeta.c2b_validation ?? null;
    const confirmationData = isSuccess ? webhookData : null;

    enqueueBackgroundTask(request, async () => {
      let validationAccepted = true;
      if (validationUrl && validationData) {
        const validationResult = await deliverCallback({
          provider: 'mpesa',
          flow: 'c2b',
          eventType: 'validation',
          url: validationUrl,
          payload: validationData,
          transactionId,
        });
        const responseBody = validationResult.responseBody ?? {};
        const rc = 'ResultCode' in responseBody ? String(responseBody.ResultCode).trim() : '';
        if (rc && rc !== '0') validationAccepted = false;
      }
      if (confirmationData && validationAccepted) {
        await deliverCallback({
          provider: 'mpesa',
          flow: 'c2b',
          eventType: 'confirmation',
          url: confirmationUrl,
          payload: confirmationData,
          transactionId,
        });
      }
    });

    return {
      OriginatorConversationID: originatorConversationId,
      ResponseCode: '0',
      ResponseDescription: 'Accept the service request successfully.',
    };
  });

  const B2C_SPEC: MpesaCommandSpec = {
    flow: 'b2c',
    partyAAttr: 'PartyA',
    invalidPartyAMessage: 'Invalid Merchant Paybill',
    requiredStrictFields: ['InitiatorName', 'SecurityCredential', 'CommandID', 'Remarks'],
    transactionCategory: 'B2C',
    transactionType: 'DEBIT',
    capabilityOperation: 'b2c',
    transactionSubType: 'CHARGE',
    requiresBalance: true,
    balanceDeltaSign: -1,
    referenceAttr: 'Occasion',
  };
  app.post('/b2c/v1/paymentrequest', { schema: { body: B2CRequest } }, async (request) => {
    const body = request.body as any;
    return runMpesaCommand({
      body,
      spec: B2C_SPEC,
      request,
      buildPersistenceRecord: (ctx) => ({
        id: ctx.transactionId,
        transaction_code: ctx.transactionCode,
        merchant_id: ctx.merchant.merchant_id,
        merchant_request_id: ctx.originatorConversationId,
        merchant_reference: null,
        checkout_request_id: ctx.conversationId,
        result_code: ctx.scenarioCode,
        result_description: ctx.scenarioDescription,
        gateway: 'MPESA',
        destination: 'MPESA',
        sender_name: ctx.merchant.merchant_name,
        sender_account_number: String(body.PartyA),
        recipient_name: PaymentsUtils.getRandomName(),
        recipient_account_number: String(body.PartyB),
        amount: body.Amount,
        fees: 0,
        merchant_balance: ctx.newBalance,
        type: B2C_SPEC.transactionType,
        sub_type: 'CHARGE',
        category: B2C_SPEC.transactionCategory,
        status: ctx.scenarioStatus,
        meta: { payload: body },
      }),
      buildCallbackPayload: (ctx) => {
        const queueTimeoutUrl = body.QueueTimeOutURL ? String(body.QueueTimeOutURL) : '';
        if (!ctx.isSuccess) {
          return mpesaResultEnvelope(ctx, {
            queueTimeoutUrl,
            extra: { sender: `${ctx.merchant.merchant_name} - ${body.PartyA}` },
          });
        }
        const receiverName = PaymentsUtils.getRandomName();
        return mpesaResultEnvelope(ctx, {
          queueTimeoutUrl,
          resultParameters: [
            { Key: 'TransactionAmount', Value: body.Amount },
            { Key: 'TransactionReceipt', Value: ctx.transactionCode },
            { Key: 'ReceiverPartyPublicName', Value: `${body.PartyB} - ${receiverName}` },
            { Key: 'TransactionCompletedDateTime', Value: PaymentsUtils.formatB2cDates() },
            { Key: 'B2CUtilityAccountAvailableFunds', Value: ctx.newBalance / 2 },
            { Key: 'B2CWorkingAccountAvailableFunds', Value: ctx.newBalance / 4 },
            { Key: 'B2CRecipientIsRegisteredCustomer', Value: 'Y' },
            { Key: 'B2CChargesPaidAccountAvailableFunds', Value: ctx.newBalance / 4 },
          ],
          extra: { sender: `${ctx.merchant.merchant_name} - ${body.PartyA}` },
        });
      },
      callbackUrl: () => String(body.ResultURL),
      queueTimeoutUrl: () => (body.QueueTimeOutURL ? String(body.QueueTimeOutURL) : null),
    });
  });

  const B2B_SPEC: MpesaCommandSpec = {
    flow: 'b2b',
    partyAAttr: 'PartyA',
    invalidPartyAMessage: 'Invalid Merchant Paybill',
    requiredStrictFields: [
      'Initiator',
      'SecurityCredential',
      'CommandID',
      'SenderIdentifierType',
      'RecieverIdentifierType',
      'AccountReference',
      'Remarks',
    ],
    transactionCategory: 'B2B',
    transactionType: 'DEBIT',
    capabilityOperation: 'b2b',
    transactionSubType: 'CHARGE',
    requiresBalance: true,
    balanceDeltaSign: -1,
    referenceAttr: 'AccountReference',
  };
  app.post('/b2b/v1/paymentrequest', { schema: { body: B2BRequest } }, async (request) => {
    const body = request.body as any;
    return runMpesaCommand({
      body,
      spec: B2B_SPEC,
      request,
      buildPersistenceRecord: (ctx) => ({
        id: ctx.transactionId,
        transaction_code: ctx.transactionCode,
        merchant_id: ctx.merchant.merchant_id,
        merchant_request_id: ctx.originatorConversationId,
        merchant_reference: body.AccountReference ?? null,
        checkout_request_id: ctx.conversationId,
        result_code: ctx.scenarioCode,
        result_description: ctx.scenarioDescription,
        gateway: 'MPESA',
        destination: 'MPESA',
        sender_name: ctx.merchant.merchant_name,
        sender_account_number: String(body.PartyA),
        recipient_name: PaymentsUtils.getRandomMerchantName(),
        recipient_account_number: String(body.PartyB),
        amount: body.Amount,
        fees: 0,
        merchant_balance: ctx.newBalance,
        type: B2B_SPEC.transactionType,
        sub_type: 'CHARGE',
        category: B2B_SPEC.transactionCategory,
        status: ctx.scenarioStatus,
        meta: { payload: body },
      }),
      buildCallbackPayload: (ctx) => {
        const queueTimeoutUrl = body.QueueTimeOutURL ? String(body.QueueTimeOutURL) : '';
        const referenceItems = [
          { Key: 'BillReferenceNumber', Value: body.AccountReference || '19008' },
          { Key: 'QueueTimeoutURL', Value: queueTimeoutUrl },
        ];
        if (!ctx.isSuccess) {
          return mpesaResultEnvelope(ctx, {
            queueTimeoutUrl,
            referenceItems,
            extra: { sender: `${ctx.merchant.merchant_name} - ${body.PartyA}` },
          });
        }
        const merchantName = PaymentsUtils.getRandomMerchantName();
        const nb = ctx.newBalance;
        const debitAccountBalance = `{Amount={CurrencyCode=KES, MinimumAmount=${pyFloat(nb / 2)}, BasicAmount=${pyFloat(nb)}}}`;
        const initiatorAccountBalance = `{Amount={CurrencyCode=KES, MinimumAmount=${pyFloat(nb)}, BasicAmount=${pyFloat(nb / 2)}}}`;
        return mpesaResultEnvelope(ctx, {
          queueTimeoutUrl,
          referenceItems,
          resultParameters: [
            { Key: 'DebitAccountBalance', Value: debitAccountBalance },
            { Key: 'Amount', Value: body.Amount },
            {
              Key: 'DebitPartyAffectedAccountBalance',
              Value: `Working Account|KES|${pyFloat(nb / 4)}|${pyFloat(nb / 4)}|${pyFloat(nb / 4)}|0.00`,
            },
            { Key: 'TransCompletedTime', Value: PaymentsUtils.formatB2cDates() },
            { Key: 'DebitPartyCharges', Value: '' },
            { Key: 'ReceiverPartyPublicName', Value: `${body.PartyB} - ${merchantName}` },
            { Key: 'Currency', Value: 'KES' },
            { Key: 'InitiatorAccountCurrentBalance', Value: initiatorAccountBalance },
          ],
          extra: { sender: `${ctx.merchant.merchant_name} - ${body.PartyA}` },
        });
      },
      callbackUrl: () => String(body.ResultURL),
      queueTimeoutUrl: () => (body.QueueTimeOutURL ? String(body.QueueTimeOutURL) : null),
    });
  });

  const TAX_SPEC: MpesaCommandSpec = {
    flow: 'tax_remit',
    partyAAttr: 'PartyA',
    invalidPartyAMessage: 'Invalid Merchant Paybill',
    requiredStrictFields: [
      'Initiator',
      'SecurityCredential',
      'CommandID',
      'SenderIdentifierType',
      'RecieverIdentifierType',
      'Remarks',
    ],
    transactionCategory: 'TAX_REMIT',
    transactionType: 'DEBIT',
    capabilityOperation: 'b2b',
    transactionSubType: 'CHARGE',
    requiresBalance: true,
    balanceDeltaSign: -1,
    referenceAttr: 'AccountReference',
  };
  app.post('/b2b/v1/remittax', { schema: { body: TaxRemitRequest } }, async (request) => {
    const body = request.body as any;
    return runMpesaCommand({
      body,
      spec: TAX_SPEC,
      request,
      buildPersistenceRecord: (ctx) => ({
        id: ctx.transactionId,
        transaction_code: ctx.transactionCode,
        merchant_id: ctx.merchant.merchant_id,
        merchant_request_id: ctx.originatorConversationId,
        merchant_reference: body.AccountReference ?? null,
        checkout_request_id: ctx.conversationId,
        result_code: ctx.scenarioCode,
        result_description: ctx.scenarioDescription,
        gateway: 'MPESA',
        destination: 'KRA',
        sender_name: ctx.merchant.merchant_name,
        sender_account_number: String(body.PartyA),
        recipient_name: 'Kenya Revenue Authority',
        recipient_account_number: String(body.PartyB),
        amount: body.Amount,
        fees: 0,
        merchant_balance: ctx.newBalance,
        type: TAX_SPEC.transactionType,
        sub_type: 'CHARGE',
        category: TAX_SPEC.transactionCategory,
        status: ctx.scenarioStatus,
        meta: { payload: body },
      }),
      buildCallbackPayload: (ctx) => {
        const queueTimeoutUrl = body.QueueTimeOutURL ? String(body.QueueTimeOutURL) : '';
        if (!ctx.isSuccess) {
          return mpesaResultEnvelope(ctx, { queueTimeoutUrl });
        }
        return mpesaResultEnvelope(ctx, {
          queueTimeoutUrl,
          resultParameters: [
            { Key: 'Amount', Value: body.Amount },
            { Key: 'ReceiverPartyPublicName', Value: 'KRA' },
            { Key: 'BusinessShortCode', Value: String(body.PartyB) },
          ],
        });
      },
      callbackUrl: () => String(body.ResultURL),
      queueTimeoutUrl: () => (body.QueueTimeOutURL ? String(body.QueueTimeOutURL) : null),
    });
  });

  const REVERSAL_STRICT = [
    'Initiator',
    'SecurityCredential',
    'CommandID',
    'ReceiverIdentifierType',
    'Remarks',
  ];
  app.post('/reversal/v1/request', { schema: { body: ReversalRequest } }, async (request) => {
    const body = request.body as any;
    if (settings.STRICT_PROVIDER_VALIDATION) {
      const missing = REVERSAL_STRICT.filter((f) => !body[f]);
      if (missing.length) {
        throw new PayloadError({
          statusCode: 400,
          payload: mpesaError(`Missing required fields: ${missing.join(', ')}`),
        });
      }
    }

    const original = await getMpesaTransactionByCode(db, String(body.TransactionID));
    if (!original) {
      throw new PayloadError({
        statusCode: 400,
        payload: mpesaError('Original transaction not found'),
      });
    }
    const direction = original.type === 'DEBIT' ? 1 : -1;
    const spec: MpesaCommandSpec = {
      flow: 'reversal',
      partyAAttr: 'ReceiverParty',
      invalidPartyAMessage: 'Invalid ReceiverParty',
      requiredStrictFields: REVERSAL_STRICT,
      transactionCategory: 'REVERSAL',
      transactionType: direction > 0 ? 'CREDIT' : 'DEBIT',
      capabilityOperation: 'reversal',
      transactionSubType: 'REVERSAL',
      balanceDeltaSign: direction,
      referenceAttr: 'TransactionID',
    };

    return runMpesaCommand({
      body,
      spec,
      request,
      extraPreconditions: async (ctx, exec) => {
        const existing = await getMpesaReversalByOriginalTransactionId(
          exec,
          ctx.merchant.merchant_id,
          String(body.TransactionID),
        );
        if (existing) {
          throw new PayloadError({
            statusCode: 400,
            payload: mpesaError('Transaction has already been reversed', {
              conversationId: ctx.conversationId,
              originatorId: ctx.originatorConversationId,
            }),
          });
        }
      },
      buildPersistenceRecord: (ctx) => ({
        id: ctx.transactionId,
        transaction_code: ctx.transactionCode,
        merchant_id: ctx.merchant.merchant_id,
        merchant_request_id: ctx.originatorConversationId,
        merchant_reference: String(body.TransactionID),
        checkout_request_id: ctx.conversationId,
        result_code: ctx.scenarioCode,
        result_description: ctx.scenarioDescription,
        gateway: 'MPESA',
        destination: 'MPESA',
        sender_name: ctx.merchant.merchant_name,
        sender_account_number: String(body.ReceiverParty),
        recipient_name: null,
        recipient_account_number: null,
        amount: body.Amount,
        fees: 0,
        merchant_balance: ctx.newBalance,
        type: spec.transactionType,
        sub_type: 'REVERSAL',
        category: 'REVERSAL',
        status: ctx.scenarioStatus,
        meta: { payload: body },
      }),
      buildCallbackPayload: (ctx) =>
        mpesaResultEnvelope(ctx, {
          queueTimeoutUrl: body.QueueTimeOutURL ? String(body.QueueTimeOutURL) : '',
        }),
      callbackUrl: () => String(body.ResultURL),
      queueTimeoutUrl: () => (body.QueueTimeOutURL ? String(body.QueueTimeOutURL) : null),
    });
  });

  const AB_STRICT = ['Initiator', 'SecurityCredential', 'CommandID', 'IdentifierType', 'Remarks'];
  app.post(
    '/accountbalance/v1/query',
    { schema: { body: AccountBalanceRequest } },
    async (request) => {
      const body = request.body as any;
      const conversationId = `AG_${uuid7()}`;
      const originatorConversationId = uuid7();
      const txCode = PaymentsUtils.generateTransactionCode();

      if (settings.STRICT_PROVIDER_VALIDATION) {
        const missing = AB_STRICT.filter((f) => !body[f]);
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

      const merchant = await getMerchantByMpesaPaybill(db, String(body.PartyA));
      if (!merchant) {
        throw new PayloadError({
          statusCode: 400,
          payload: mpesaError('Invalid PartyA', {
            conversationId,
            originatorId: originatorConversationId,
          }),
        });
      }

      enforceCapability(merchant, 'account_balance');

      const scenario = await resolveMpesaResult(db, request, { flow: 'account_balance' });
      const queueTimeoutUrl = body.QueueTimeOutURL ? String(body.QueueTimeOutURL) : '';
      const balance = Number(merchant.merchant_balance);
      const isSuccess = scenario.code === '0';

      const webhookData: Record<string, any> = {
        Result: {
          ResultType: 0,
          ResultCode: Number(scenario.code),
          ResultDesc: scenario.description,
          OriginatorConversationID: originatorConversationId,
          ConversationID: conversationId,
          TransactionID: txCode,
          ReferenceData: { ReferenceItem: { Key: 'QueueTimeoutURL', Value: queueTimeoutUrl } },
        },
        source: 'demo',
      };
      if (isSuccess) {
        webhookData.Result.ResultParameters = {
          ResultParameter: [
            {
              Key: 'AccountBalance',
              Value:
                `Working Account|KES|${balance.toFixed(2)}|${balance.toFixed(2)}|0.00|0.00` +
                `&Float Account|KES|0.00|0.00|0.00|0.00` +
                `&Utility Account|KES|${(balance / 2).toFixed(2)}|${(balance / 2).toFixed(2)}|0.00|0.00`,
            },
            { Key: 'BOCompletedTime', Value: PaymentsUtils.formatB2cDates() },
          ],
        };
      }

      const callbackUrl =
        isTimeoutResult(scenario.code) && queueTimeoutUrl
          ? queueTimeoutUrl
          : String(body.ResultURL);
      scheduleCallback(request, {
        provider: 'mpesa',
        flow: 'account_balance',
        eventType: 'result',
        url: callbackUrl,
        payload: webhookData,
      });

      return {
        OriginatorConversationID: originatorConversationId,
        ConversationID: conversationId,
        ResponseCode: '0',
        ResponseDescription: 'Accept the service request successfully.',
      };
    },
  );

  const TS_STRICT = ['Initiator', 'SecurityCredential', 'CommandID', 'IdentifierType', 'Remarks'];
  app.post(
    '/transactionstatus/v1/query',
    { schema: { body: TransactionStatusRequest } },
    async (request) => {
      const body = request.body as any;
      const conversationId = `AG_${uuid7()}`;
      const originatorConversationId = uuid7();

      if (settings.STRICT_PROVIDER_VALIDATION) {
        const missing = TS_STRICT.filter((f) => !body[f]);
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

      const merchant = await getMerchantByMpesaPaybill(db, String(body.PartyA));
      if (!merchant) {
        throw new PayloadError({
          statusCode: 400,
          payload: mpesaError('Invalid PartyA', {
            conversationId,
            originatorId: originatorConversationId,
          }),
        });
      }

      enforceCapability(merchant, 'transaction_status');

      const transaction = body.TransactionID
        ? await getMpesaTransactionByCode(db, String(body.TransactionID))
        : null;
      if (!transaction) {
        throw new PayloadError({
          statusCode: 400,
          payload: mpesaError('Transaction not found', {
            conversationId,
            originatorId: originatorConversationId,
          }),
        });
      }

      const scenario = await resolveMpesaResult(db, request, {
        flow: 'transaction_status',
        reference: String(body.TransactionID),
      });
      let resultCode = String(transaction.resultCode || scenario.code);
      let resultDesc = transaction.resultDescription || scenario.description;
      if (transaction.status === 'PENDING') {
        resultCode = '1';
        resultDesc = 'The transaction is being processed';
      } else if (scenario.status === 'TIMEOUT') {
        resultCode = scenario.code;
        resultDesc = scenario.description;
      }

      const balance = Number(merchant.merchant_balance);
      const receiverName = transaction.recipientName || PaymentsUtils.getRandomName();
      const queueTimeoutUrl = body.QueueTimeOutURL ? String(body.QueueTimeOutURL) : '';

      const webhookData = {
        Result: {
          ResultType: 0,
          ResultCode: /^\d+$/.test(resultCode) ? Number(resultCode) : resultCode,
          ResultDesc: resultDesc,
          OriginatorConversationID: originatorConversationId,
          ConversationID: conversationId,
          TransactionID: transaction.transactionCode,
          ResultParameters: {
            ResultParameter: [
              {
                Key: 'DebitAccountBalance',
                Value: `{Amount={CurrencyCode=KES, MinimumAmount=${pyFloat(balance / 2)}, BasicAmount=${pyFloat(balance)}}}`,
              },
              { Key: 'Amount', Value: String(transaction.amount) },
              {
                Key: 'DebitPartyAffectedAccountBalance',
                Value: `Working Account|KES|${pyFloat(balance / 4)}|${pyFloat(balance / 4)}|${pyFloat(balance / 4)}|0.00`,
              },
              { Key: 'TransCompletedTime', Value: PaymentsUtils.formatB2cDates() },
              { Key: 'DebitPartyCharges', Value: '' },
              { Key: 'ReceiverPartyPublicName', Value: `${body.PartyA} - ${receiverName}` },
              { Key: 'Currency', Value: 'KES' },
              {
                Key: 'InitiatorAccountCurrentBalance',
                Value: `{Amount={CurrencyCode=KES, MinimumAmount=${pyFloat(balance)}, BasicAmount=${pyFloat(balance / 2)}}}`,
              },
            ],
          },
          ReferenceData: {
            ReferenceItem: [
              { Key: 'Occasion', Value: body.Occasion || '' },
              { Key: 'QueueTimeoutURL', Value: queueTimeoutUrl },
            ],
          },
        },
        source: 'demo',
      };

      const callbackUrl =
        isTimeoutResult(resultCode) && queueTimeoutUrl ? queueTimeoutUrl : String(body.ResultURL);
      scheduleCallback(request, {
        provider: 'mpesa',
        flow: 'transaction_status',
        eventType: 'result',
        url: callbackUrl,
        payload: webhookData,
        transactionId: transaction.id,
      });

      return {
        OriginatorConversationID: originatorConversationId,
        ConversationID: conversationId,
        ResponseCode: '0',
        ResponseDescription: 'Accept the service request successfully.',
      };
    },
  );

  app.post('/qrcode/v1/generate', { schema: { body: QRCodeRequest } }, async (request) => {
    const body = request.body as any;
    const merchantName = body.MerchantName;
    const merchantShortCode = body.CPI || body.MerchantShortCode;
    const amount = body.Amount;
    const qrType = body.QRType ?? null;
    const trxCode = body.TrxCode || (qrType === 'BUYGOODS' ? 'BG' : 'PB');

    if (merchantShortCode) {
      const merchant = await getMerchantByMpesaPaybill(db, String(merchantShortCode));
      if (merchant) enforceCapability(merchant, 'qr_code');
    }

    const requestId = uuid7().replace(/-/g, '').toUpperCase().slice(0, 16);
    const reference = body.RefNo || requestId;
    const qrPayload = `${trxCode}|${merchantShortCode}|${amount}|${merchantName}|${reference}|${body.Size || ''}`;
    const qrCode = Buffer.from(qrPayload).toString('base64');

    return {
      ResponseCode: '00',
      RequestID: requestId,
      ResponseDescription: 'The service request is processed successfully.',
      QRCode: qrCode,
      QRType: qrType,
      TrxCode: trxCode,
      RefNo: reference,
    };
  });

  app.post('/pulltransactions/v1/query', async (request) => {
    const body = request.body as any;
    return {
      ResponseRefID: uuid7().replace(/-/g, '').toUpperCase().slice(0, 16),
      ResponseCode: '1000',
      ResponseMessage: 'Success',
      ShortCode: body?.ShortCode ?? null,
      Response: [],
    };
  });
}
