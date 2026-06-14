import type { FastifyInstance } from 'fastify';

import { validateBasicAuth } from '@/auth/basic.js';
import { validateBearerToken } from '@/auth/bearer.js';
import { requireClientCredentialsGrant } from '@/auth/grant.js';
import { settings } from '@/config.js';
import { DEFAULT_SASAPAY_CALLBACK, TRIGGER_FAILURE_AMOUNTS } from '@/constants.js';
import { db } from '@/db/client.js';
import { PayloadError } from '@/errors.js';
import {
  applySasapayBalanceDelta,
  getMerchantBySasapayTill,
  getSasapayTransactionByCheckoutRequestId,
  getTransactionStatus,
  insertSasapayTransaction,
  updateSasapayTransaction,
} from '@/actions/sasapayQueries.js';
import {
  AccountVerifyRequest,
  B2BRequest,
  B2CRequest,
  BulkPaymentRequest,
  BusinessToBeneficiaryRequest,
  C2BRequest,
  CardPaymentRequest,
  CheckBalanceQuery,
  InternalFundMovementRequest,
  LipaFareRequest,
  MerchantOnboardingRequest,
  PassthroughQuery,
  PreApprovedPaymentRequest,
  ProcessPaymentRequest,
  RegisterIpnUrlRequest,
  RemittancePaymentRequest,
  SubCountiesQuery,
  TransactionReferenceRequest,
  TransactionStatusRequest,
  UtilityBillQueryRequest,
  UtilityPaymentRequest,
} from '@/schemas/sasapay.js';
import { deliverCallback, scheduleCallback } from '@/services/callbacks.js';
import { type SasaPayCommandSpec, runSasapayCommand } from '@/services/sasapayCommand.js';
import { resolveSasapayResult } from '@/services/scenarios.js';
import { enqueueBackgroundTask } from '@/utils/background.js';
import { generateToken, uuid7 } from '@/utils/generators.js';
import { PaymentsUtils } from '@/utils/payments.js';
import { registerToken } from '@/services/tokens.js';

const SASAPAY_WALLET_VERIFICATION_CODE = '1234';
const SASAPAY_WALLET_OTP_TTL_MINUTES = 5;

const randInt = (max: number) => Math.floor(Math.random() * (max + 1));
const isoNaive = (d: Date | null | undefined): string | null =>
  d
    ? d
        .toISOString()
        .replace('Z', '')
        .replace(/\.000$/, '')
    : null;

export async function sasapayV1Routes(app: FastifyInstance): Promise<void> {
  app.get('/auth/token/', { onRequest: validateBasicAuth }, async (request) => {
    requireClientCredentialsGrant(request, 'sasapay');
    const token = await generateToken(request.authMerchantId);
    const scope = 'merchants C2B B2B B2C';
    await registerToken(db, token, {
      provider: 'sasapay-v1',
      expiresIn: 3600,
      scope,
      meta: { merchantId: request.authMerchantId ?? null },
    });
    return {
      status: true,
      detail: 'SUCCESS',
      access_token: token,
      expires_in: 3600,
      token_type: 'Bearer',
      scope,
    };
  });

  app.post(
    '/payments/request-payment/',
    { onRequest: validateBearerToken, schema: { body: C2BRequest } },
    async (request) => {
      const body = request.body as any;
      const merchant = await getMerchantBySasapayTill(db, body.MerchantCode);
      const checkoutRequestId = uuid7();
      if (!merchant) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            status: false,
            ResultCode: '400',
            ResponseDescription: 'Invalid Merchant Account',
          },
        });
      }

      const amount = Number(body.Amount);
      const scenario = await resolveSasapayResult(db, request, {
        flow: 'c2b',
        amount,
        reference: body.AccountReference,
      });
      const calculatedFee =
        Number(body.TransactionFee || 0) || PaymentsUtils.calculateTransactionFee(amount);
      const transactionTotal = amount + calculatedFee;
      const walletFlow = body.NetworkCode === '0';
      const isSuccess = scenario.status === 'SUCCESS';

      const transId = PaymentsUtils.generateTransactionCode('SPEJ18');
      const thirdPartyTransId = PaymentsUtils.generateTransactionCode();
      const senderName = PaymentsUtils.getRandomName();
      const transactionId = uuid7();
      const transactionDate = PaymentsUtils.generateTimestamp();
      const transactionReference = `PR${randInt(100_000_000)}`;

      let newBalance: number;
      if (!walletFlow && isSuccess) {
        newBalance = Number(merchant.merchant_balance) + amount;
      } else {
        newBalance = Number(merchant.merchant_balance) + (isSuccess && walletFlow ? amount : 0);
      }

      const split = senderName.split(' ');
      const gatewayData: Record<string, any> = {
        MerchantRequestID: body.AccountReference,
        CheckoutRequestID: checkoutRequestId,
        PaymentRequestID: transactionId,
        ResultCode: 0,
        ResultDesc: 'Transaction processed successfully.',
        SourceChannel: body.NetworkCode === '0' ? 'SasaPay' : 'M-PESA',
        TransAmount: amount,
        BillRefNumber: body.AccountReference,
        TransactionDate: transactionDate,
        CustomerMobile: String(body.PhoneNumber),
        TransactionCode: transId,
        ThirdPartyTransID: thirdPartyTransId,
      };
      if (TRIGGER_FAILURE_AMOUNTS.has(amount)) {
        gatewayData.ResultCode = 1;
        gatewayData.TransactionCode = `SWEJ18${randInt(1000)}`;
      }
      const ipnData: Record<string, any> = {
        PaymentMethod: 'SasaPay',
        TransactionType: 'C2B',
        TransID: TRIGGER_FAILURE_AMOUNTS.has(amount) ? `SWEJ18${randInt(1000)}` : transId,
        TransTime: transactionDate,
        TransAmount: amount,
        MerchantCode: body.MerchantCode,
        BusinessShortCode: body.MerchantCode,
        BillRefNumber: body.AccountReference,
        InvoiceNumber: '',
        OrgAccountBalance: newBalance,
        ThirdPartyTransID: thirdPartyTransId,
        MSISDN: String(body.PhoneNumber),
        CustomerMobile: String(body.PhoneNumber),
        FirstName: split[0],
        MiddleName: split.length > 1 ? split[1] : '',
        LastName: split.length > 2 ? split[2] : split[split.length - 1],
        FullName: senderName,
        Narration: body.TransactionDesc || '',
        TransactionFee: calculatedFee,
        TotalAmount: transactionTotal,
        Currency: body.Currency,
        ReceiverName: merchant.merchant_name,
      };

      const meta: Record<string, any> = {
        source: walletFlow ? 'SasaPay' : 'M-PESA',
        description: body.TransactionDesc ?? null,
        total: transactionTotal,
        currency: body.Currency,
        networkCode: body.NetworkCode,
        walletFlow,
        payload: body,
        callbackPayloads: { gateway: gatewayData, ipn: ipnData },
        scenario: {
          code: scenario.code,
          description: scenario.description,
          status: scenario.status,
        },
      };
      if (walletFlow) {
        meta.verificationCode = SASAPAY_WALLET_VERIFICATION_CODE;
        meta.verificationExpiresAt = new Date(
          Date.now() + SASAPAY_WALLET_OTP_TTL_MINUTES * 60_000,
        ).toISOString();
        meta.processed = false;
      }

      try {
        await db.transaction(async (tx) => {
          if (isSuccess && !walletFlow) {
            const [, balStr] = await applySasapayBalanceDelta(tx, merchant.merchant_id, amount);
            newBalance = Number(balStr);
            ipnData.OrgAccountBalance = newBalance;
          }
          await insertSasapayTransaction(tx, {
            id: transactionId,
            transaction_code: transId,
            third_party_transaction_code: thirdPartyTransId,
            merchant_id: merchant.merchant_id,
            merchant_request_id: body.AccountReference,
            merchant_reference: body.AccountReference,
            checkout_request_id: checkoutRequestId,
            result_code: scenario.code,
            result_description: scenario.description,
            gateway: 'SASAPAY',
            destination: 'SASAPAY',
            sender_name: senderName,
            sender_account_number: String(body.PhoneNumber),
            recipient_name: merchant.merchant_name,
            recipient_account_number: body.MerchantCode,
            amount,
            fees: calculatedFee,
            merchant_balance: walletFlow ? Number(merchant.merchant_balance) : newBalance,
            type: 'CREDIT',
            sub_type: 'CHARGE',
            category: 'C2B',
            status: walletFlow ? 'PENDING' : scenario.status,
            meta,
          });
        });
      } catch {
        throw new PayloadError({
          statusCode: 500,
          payload: {
            status: false,
            ResponseCode: '500',
            ResponseDescription: 'Transaction failed to process. Please try again.',
          },
        });
      }

      const webhookUrl = body.CallBackURL ? String(body.CallBackURL) : DEFAULT_SASAPAY_CALLBACK;
      if (!walletFlow) {
        gatewayData.ResultCode = isSuccess ? 0 : scenario.code;
        gatewayData.ResultDesc = scenario.description;
        enqueueBackgroundTask(request, () =>
          sendC2bWebhooks(webhookUrl, gatewayData, ipnData, transactionId),
        );
      }

      return {
        status: true,
        detail:
          body.NetworkCode === '0'
            ? 'OTP sent. Share the code to complete transaction'
            : 'Success. Request accepted for processing',
        PaymentGateway: 'SasaPay',
        MerchantRequestID: body.AccountReference,
        CheckoutRequestID: checkoutRequestId,
        TransactionReference: transactionReference,
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing',
        CustomerMessage: 'Instructions for customer payment',
      };
    },
  );

  app.post(
    '/payments/process-payment/',
    { onRequest: validateBearerToken, schema: { body: ProcessPaymentRequest } },
    async (request) => {
      const body = request.body as any;
      const merchant = await getMerchantBySasapayTill(db, body.MerchantCode);
      if (!merchant) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            status: false,
            ResultCode: '400',
            ResponseDescription: 'Invalid Merchant Account',
          },
        });
      }

      const transaction = await getSasapayTransactionByCheckoutRequestId(
        db,
        merchant.merchant_id,
        body.CheckoutRequestID,
      );
      if (!transaction) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            status: false,
            ResponseCode: '400',
            ResponseDescription: 'Checkout request does not exist',
          },
        });
      }

      const meta: Record<string, any> = { ...(transaction.meta ?? {}) };
      if (!meta.walletFlow) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            status: false,
            ResponseCode: '400',
            ResponseDescription: 'Checkout request is not awaiting wallet verification',
          },
        });
      }
      if (transaction.status === 'SUCCESS' || meta.processed) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            status: false,
            ResponseCode: '400',
            ResponseDescription: 'Checkout request has already been processed',
          },
        });
      }

      const expiresAtRaw = meta.verificationExpiresAt;
      const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : new Date();
      if (expiresAt < new Date()) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            status: false,
            ResponseCode: '400',
            ResponseDescription: 'Verification code has expired',
          },
        });
      }
      if (String(body.VerificationCode) !== String(meta.verificationCode)) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            status: false,
            ResponseCode: '400',
            ResponseDescription: 'Invalid verification code',
          },
        });
      }

      const scenarioMeta = meta.scenario ?? {};
      if (scenarioMeta.status && scenarioMeta.status !== 'SUCCESS') {
        meta.processed = true;
        meta.processedAt = new Date().toISOString();
        try {
          await updateSasapayTransaction(db, transaction.id, {
            result_code: String(scenarioMeta.code || '1'),
            result_description: String(scenarioMeta.description || 'Transaction failed.'),
            status: String(scenarioMeta.status || 'FAILED'),
            merchant_balance: Number(merchant.merchant_balance),
            meta,
          });
        } catch {
          throw new PayloadError({
            statusCode: 500,
            payload: {
              status: false,
              ResponseCode: '500',
              ResponseDescription: 'Transaction failed to process. Please try again.',
            },
          });
        }

        const payloads = meta.callbackPayloads ?? {};
        const callbackPayload = payloads.gateway;
        const ipnPayload = payloads.ipn;
        const webhookUrl = String((meta.payload ?? {}).CallBackURL || DEFAULT_SASAPAY_CALLBACK);
        if (callbackPayload && ipnPayload) {
          callbackPayload.ResultCode = scenarioMeta.code || '1';
          callbackPayload.ResultDesc = scenarioMeta.description || 'Transaction failed.';
          enqueueBackgroundTask(request, () =>
            sendC2bWebhooks(webhookUrl, callbackPayload, ipnPayload, transaction.id),
          );
        }

        return {
          status: true,
          detail: 'Payment verification completed with a failed payment result',
          PaymentGateway: 'SasaPay',
          MerchantCode: body.MerchantCode,
          CheckoutRequestID: body.CheckoutRequestID,
          ResponseCode: String(scenarioMeta.code || '1'),
          ResponseDescription: String(scenarioMeta.description || 'Transaction failed.'),
          CustomerMessage: 'Payment failed',
        };
      }

      let newBalance: number;
      meta.processed = true;
      meta.processedAt = new Date().toISOString();
      try {
        const [, balStr] = await applySasapayBalanceDelta(
          db,
          merchant.merchant_id,
          Number(transaction.amount),
        );
        newBalance = Number(balStr);
        await updateSasapayTransaction(db, transaction.id, {
          result_code: '0',
          result_description: 'Transaction processed successfully.',
          status: 'SUCCESS',
          merchant_balance: newBalance,
          meta,
        });
      } catch {
        throw new PayloadError({
          statusCode: 500,
          payload: {
            status: false,
            ResponseCode: '500',
            ResponseDescription: 'Transaction failed to process. Please try again.',
          },
        });
      }

      const payloads = meta.callbackPayloads ?? {};
      const callbackPayload = payloads.gateway;
      const ipnPayload = payloads.ipn;
      const webhookUrl = String((meta.payload ?? {}).CallBackURL || DEFAULT_SASAPAY_CALLBACK);
      if (callbackPayload && ipnPayload) {
        callbackPayload.ResultCode = 0;
        callbackPayload.ResultDesc = 'Transaction processed successfully.';
        ipnPayload.OrgAccountBalance = newBalance;
        enqueueBackgroundTask(request, () =>
          sendC2bWebhooks(webhookUrl, callbackPayload, ipnPayload, transaction.id),
        );
      }

      return {
        status: true,
        detail: 'Success. Payment processed successfully',
        PaymentGateway: 'SasaPay',
        MerchantCode: body.MerchantCode,
        CheckoutRequestID: body.CheckoutRequestID,
        ResponseCode: '0',
        ResponseDescription: 'Success. Payment processed successfully',
        CustomerMessage: 'Payment processed successfully',
      };
    },
  );

  const B2C_SPEC: SasaPayCommandSpec = { flow: 'b2c', category: 'B2C', requestIdPrefix: 'B2C' };
  app.post(
    '/payments/b2c/',
    { onRequest: validateBearerToken, schema: { body: B2CRequest } },
    async (request) => {
      const body = request.body as any;
      return runSasapayCommand({
        body,
        spec: B2C_SPEC,
        request,
        buildPersistenceRecord: (ctx) => {
          const destinationChannel = PaymentsUtils.mapChannelToDestination(body.Channel);
          return {
            id: ctx.transactionId,
            transaction_code: ctx.transactionCode,
            third_party_transaction_code: ctx.thirdPartyTransactionCode,
            merchant_id: ctx.merchant.merchant_id,
            merchant_request_id: body.MerchantTransactionReference,
            merchant_reference: body.MerchantTransactionReference,
            checkout_request_id: ctx.checkoutRequestId,
            result_code: ctx.scenarioCode,
            result_description: ctx.scenarioDescription,
            gateway: 'SASAPAY',
            destination: destinationChannel,
            sender_name: ctx.merchant.merchant_name,
            sender_account_number: body.MerchantCode,
            recipient_name: PaymentsUtils.getRandomName(),
            recipient_account_number: String(body.ReceiverNumber),
            amount: body.Amount,
            fees: ctx.fee,
            merchant_balance: ctx.newBalance,
            type: 'DEBIT',
            sub_type: 'CHARGE',
            category: B2C_SPEC.category,
            status: ctx.scenarioStatus,
            meta: {
              source: 'SASAPAY',
              destination: destinationChannel,
              description: body.Reason,
              total: ctx.total,
              currency: body.Currency,
              channel: body.Channel,
              payload: body,
            },
          };
        },
        buildCallbackPayload: (ctx) => {
          const destinationChannel = PaymentsUtils.mapChannelToDestination(body.Channel);
          return {
            MerchantCode: body.MerchantCode,
            DestinationChannel: destinationChannel,
            SourceChannel: 'SasaPay',
            RecipientName: PaymentsUtils.getRandomName(),
            RecipientAccountNumber: String(body.ReceiverNumber),
            ResultCode: ctx.scenarioCode,
            ResultDesc: ctx.scenarioDescription,
            CheckoutRequestID: ctx.checkoutRequestId,
            SasaPayTransactionCode: ctx.transactionCode,
            SasaPayTransactionID: ctx.transactionId,
            ThirdPartyTransactionCode: ctx.thirdPartyTransactionCode,
            TransactionDate: ctx.transactionDate,
            TransactionAmount: Number(body.Amount),
            TransactionCharge: ctx.fee,
            MerchantRequestID: body.MerchantTransactionReference,
            MerchantTransactionReference: body.MerchantTransactionReference,
            MerchantAccountBalance: ctx.newBalance,
          };
        },
      });
    },
  );

  const B2B_SPEC: SasaPayCommandSpec = { flow: 'b2b', category: 'B2B', requestIdPrefix: 'B2B' };
  const b2bDestination = (body: any) =>
    body.NetworkCode === '0'
      ? `SasaPay - ${body.ReceiverAccountType}`
      : `MPESA - ${body.ReceiverAccountType}`;
  app.post(
    '/payments/b2b/',
    { onRequest: validateBearerToken, schema: { body: B2BRequest } },
    async (request) => {
      const body = request.body as any;
      return runSasapayCommand({
        body,
        spec: B2B_SPEC,
        request,
        buildPersistenceRecord: (ctx) => ({
          id: ctx.transactionId,
          transaction_code: ctx.transactionCode,
          third_party_transaction_code: ctx.thirdPartyTransactionCode,
          merchant_id: ctx.merchant.merchant_id,
          merchant_request_id: body.MerchantTransactionReference,
          merchant_reference: body.MerchantTransactionReference,
          checkout_request_id: ctx.checkoutRequestId,
          result_code: ctx.scenarioCode,
          result_description: ctx.scenarioDescription,
          gateway: 'SASAPAY',
          destination: b2bDestination(body),
          sender_name: ctx.merchant.merchant_name,
          sender_account_number: body.MerchantCode,
          recipient_name: PaymentsUtils.getRandomMerchantName(),
          recipient_account_number: body.ReceiverMerchantCode,
          amount: body.Amount,
          fees: ctx.fee,
          merchant_balance: ctx.newBalance,
          type: 'DEBIT',
          sub_type: 'CHARGE',
          category: B2B_SPEC.category,
          status: ctx.scenarioStatus,
          meta: {
            source: 'SASAPAY',
            destination: body.NetworkCode,
            destinationChannel: b2bDestination(body),
            description: body.Reason,
            total: ctx.total,
            currency: body.Currency,
            accountReference: body.AccountReference ?? null,
            payload: body,
          },
        }),
        buildCallbackPayload: (ctx) => ({
          MerchantCode: body.MerchantCode,
          DestinationChannel: b2bDestination(body),
          SourceChannel: 'SasaPay',
          ResultCode: ctx.scenarioCode,
          ResultDesc: ctx.scenarioDescription,
          RecipientName: PaymentsUtils.getRandomMerchantName(),
          RecipientAccountNumber: body.ReceiverMerchantCode,
          TransactionAmount: Number(body.Amount),
          TransactionCharge: ctx.fee,
          TransactionDate: ctx.transactionDate,
          SasaPayTransactionCode: ctx.transactionCode,
          SasaPayTransactionID: ctx.transactionId,
          ThirdPartyTransactionCode: ctx.thirdPartyTransactionCode,
          CheckoutRequestID: ctx.checkoutRequestId,
          MerchantRequestID: body.MerchantTransactionReference,
          MerchantTransactionReference: body.MerchantTransactionReference,
          MerchantAccountBalance: ctx.newBalance,
        }),
      });
    },
  );

  app.post(
    '/payments/bulk-payments/',
    { onRequest: validateBearerToken, schema: { body: BulkPaymentRequest } },
    async (request) => {
      const body = request.body as any;
      const merchant = await getMerchantBySasapayTill(db, body.MerchantCode);
      if (!merchant) {
        throw new PayloadError({
          statusCode: 400,
          payload: {
            status: false,
            ResponseCode: '400',
            ResponseDescription: 'Invalid Merchant Account',
          },
        });
      }

      const recipients = body.Recipients as any[];
      const totalAmount = recipients.reduce((s, r) => s + Number(r.amount), 0);
      const totalFee = recipients.reduce(
        (s, r) => s + PaymentsUtils.calculateTransactionFee(Number(r.amount)),
        0,
      );
      const totalRequired = totalAmount + totalFee;

      const bulkRequestId = `BULK${randInt(100_000_000)}`;
      const accepted: Array<Record<string, any>> = [];
      let finalBalance = 0;

      try {
        await db.transaction(async (tx) => {
          const [applied, balStr] = await applySasapayBalanceDelta(
            tx,
            merchant.merchant_id,
            -totalRequired,
          );
          if (!applied) {
            throw new PayloadError({
              statusCode: 400,
              payload: {
                status: false,
                ResponseCode: '400',
                ResponseDescription: 'Insufficient Funds',
              },
            });
          }
          finalBalance = Number(balStr);

          for (const recipient of recipients) {
            const amount = Number(recipient.amount);
            const fee = PaymentsUtils.calculateTransactionFee(amount);
            const txId = uuid7();
            const txCode = PaymentsUtils.generateTransactionCode('SWEJ18');
            const tpCode = PaymentsUtils.generateTransactionCode();
            await insertSasapayTransaction(tx, {
              id: txId,
              transaction_code: txCode,
              third_party_transaction_code: tpCode,
              merchant_id: merchant.merchant_id,
              merchant_request_id: body.MerchantTransactionReference,
              merchant_reference: body.MerchantTransactionReference,
              checkout_request_id: uuid7(),
              result_code: '0',
              result_description: 'Transaction processed successfully.',
              gateway: 'SASAPAY',
              destination: PaymentsUtils.mapChannelToDestination(recipient.channel),
              sender_name: merchant.merchant_name,
              sender_account_number: body.MerchantCode,
              recipient_name: PaymentsUtils.getRandomName(),
              recipient_account_number: String(recipient.receiverNumber),
              amount,
              fees: fee,
              merchant_balance: finalBalance,
              type: 'DEBIT',
              sub_type: 'CHARGE',
              category: 'BULK',
              status: 'SUCCESS',
              meta: {
                source: 'SASAPAY',
                bulkRequestId,
                bulkParentReference: body.MerchantTransactionReference,
                channel: recipient.channel,
                reason: recipient.reason ?? null,
                accountReference: recipient.accountReference ?? null,
              },
            });
            accepted.push({
              TransactionId: txId,
              ReceiverNumber: String(recipient.receiverNumber),
              Amount: amount,
              ResultCode: '0',
            });
          }
        });
      } catch (exc) {
        if (exc instanceof PayloadError) throw exc;
        throw new PayloadError({
          statusCode: 500,
          payload: {
            status: false,
            ResponseCode: '500',
            ResponseDescription: 'Bulk payment failed to process.',
          },
        });
      }

      const callbackPayload = {
        BulkRequestID: bulkRequestId,
        MerchantTransactionReference: body.MerchantTransactionReference,
        MerchantCode: body.MerchantCode,
        TotalAmount: totalAmount,
        TotalFees: totalFee,
        MerchantAccountBalance: finalBalance,
        ResultCode: '0',
        ResultDesc: 'Bulk payment processed successfully.',
        Recipients: accepted,
      };
      scheduleCallback(request, {
        provider: 'sasapay',
        flow: 'bulk',
        eventType: 'result',
        url: body.CallBackURL ? String(body.CallBackURL) : DEFAULT_SASAPAY_CALLBACK,
        payload: callbackPayload,
      });

      return {
        status: true,
        detail: 'Bulk payment accepted for processing',
        BulkRequestID: bulkRequestId,
        MerchantTransactionReference: body.MerchantTransactionReference,
        TotalAmount: totalAmount,
        TotalFees: totalFee,
        MerchantAccountBalance: finalBalance,
        RecipientCount: accepted.length,
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing',
        echo: null,
      };
    },
  );

  const txStatusHandler = async (request: any) => {
    const body = request.body as any;
    const merchant = await getMerchantBySasapayTill(db, body.MerchantCode);
    if (!merchant) {
      throw new PayloadError({
        statusCode: 400,
        payload: {
          status: false,
          ResultCode: '400',
          ResponseDescription: 'Invalid Merchant Account',
        },
      });
    }
    const reference =
      body.TransactionCode || body.MerchantTransactionReference || body.CheckoutRequestId;
    const transaction = await getTransactionStatus(db, merchant.merchant_id, String(reference));
    if (!transaction) {
      throw new PayloadError({
        statusCode: 400,
        payload: { status: false, ResultCode: '400', message: 'Transaction does not exist' },
      });
    }

    const isPending = transaction.status === 'PENDING';
    const isFailure = ['FAILED', 'CANCELLED', 'TIMEOUT'].includes(transaction.status);
    let resultCode: string;
    if (isPending) resultCode = '1';
    else if (isFailure) resultCode = String(transaction.resultCode || '400');
    else resultCode = String(transaction.resultCode || '0');

    const txResponse = {
      ResultCode: resultCode,
      ResultDescription: isPending
        ? 'Transaction pending'
        : isFailure
          ? transaction.resultDescription
          : 'Transaction completed successfully',
      TransactionType: transaction.category,
      TransactionDate: isoNaive(transaction.createdAt),
      CheckoutId: transaction.checkoutRequestId,
      MerchantReference: transaction.merchantReference,
      TransactionAmount: String(transaction.amount),
      Paid: !isPending && !isFailure,
      AmountPaid: isPending || isFailure ? 0 : String(transaction.amount),
      PaidDate: isoNaive(transaction.createdAt),
      SourceChannel: transaction.gateway,
      DestinationChannel: transaction.destination,
      TransID: transaction.transactionCode,
      TransactionCode: transaction.transactionCode,
      ThirdPartyTransactionCode: transaction.thirdPartyTransactionCode,
      TransactionStatus: transaction.status,
    };

    if (body.CallbackUrl) {
      scheduleCallback(request, {
        provider: 'sasapay',
        flow: 'transaction_status',
        eventType: 'result',
        url: String(body.CallbackUrl),
        payload: txResponse,
        transactionId: transaction.id,
      });
    }

    return {
      status: true,
      message: `${transaction.category} Transaction Details`,
      data: txResponse,
    };
  };
  app.post(
    '/transactions/status-query/',
    { onRequest: validateBearerToken, schema: { body: TransactionStatusRequest } },
    txStatusHandler,
  );
  app.post(
    '/transactions/status/',
    { onRequest: validateBearerToken, schema: { body: TransactionStatusRequest } },
    txStatusHandler,
  );

  app.get('/payments/channel-codes/', { onRequest: validateBearerToken }, async () => {
    const data = Object.entries(PaymentsUtils.CHANNEL_MAP)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([code, name]) => ({ channelCode: code, channelName: name }));
    return { status: true, responseCode: '0', message: 'Channels fetched successfully.', data };
  });

  app.post(
    '/accounts/account-validation/',
    { onRequest: validateBearerToken, schema: { body: AccountVerifyRequest } },
    async (request) => {
      const body = request.body as any;
      const name = PaymentsUtils.getRandomName();
      const channel = PaymentsUtils.mapChannelToDestination(body.Channel);
      return {
        status: true,
        responseCode: '0',
        detail: 'Success',
        data: {
          merchantCode: body.MerchantCode,
          accountNumber: body.AccountNumber,
          channel,
          channelCode: body.Channel,
          accountName: name,
          accountStatus: 'ACTIVE',
          verificationId: uuid7(),
        },
      };
    },
  );

  // Official SasaPay v1 endpoints. Methods + GET query params are taken from the
  // SDK (SasaPayClient); request bodies validate the SDK-guaranteed fields and
  // pass the rest through. Responses are generic success envelopes pending the docs.
  const bearer = { onRequest: validateBearerToken } as const;
  const v1Stub = (message: string, data?: Record<string, unknown>) => ({
    status: true,
    responseCode: '0',
    message,
    ...(data ? { data } : {}),
  });
  const v1List = (message: string) => ({ status: true, responseCode: '0', message, data: [] });

  app.post(
    '/payments/card-payments/',
    { ...bearer, schema: { body: CardPaymentRequest } },
    async () => v1Stub('Card payment processed successfully.'),
  );
  app.post(
    '/payments/approved/',
    { ...bearer, schema: { body: PreApprovedPaymentRequest } },
    async () => v1Stub('Pre-approved payment processed successfully.'),
  );
  app.post(
    '/remittances/remittance-payments/',
    { ...bearer, schema: { body: RemittancePaymentRequest } },
    async () => v1Stub('Remittance payment processed successfully.'),
  );
  app.post(
    '/transactions/fund-movement/',
    { ...bearer, schema: { body: InternalFundMovementRequest } },
    async () => v1Stub('Fund movement processed successfully.'),
  );
  app.post(
    '/payments/request-payment/status/',
    { ...bearer, schema: { body: TransactionReferenceRequest } },
    async () => v1Stub('Request payment status fetched successfully.'),
  );
  app.get(
    '/payments/check-balance/',
    { ...bearer, schema: { querystring: CheckBalanceQuery } },
    async (request) => {
      const { MerchantCode } = request.query as { MerchantCode: string };
      return v1Stub('Merchant balance fetched successfully.', { MerchantCode });
    },
  );
  app.post(
    '/transactions/verify/',
    { ...bearer, schema: { body: TransactionReferenceRequest } },
    async () => v1Stub('Transaction verified successfully.'),
  );
  app.post(
    '/payments/b2c/beneficiary/',
    { ...bearer, schema: { body: BusinessToBeneficiaryRequest } },
    async () => v1Stub('Business to beneficiary payment processed successfully.'),
  );
  app.post(
    '/payments/register-ipn-url/',
    { ...bearer, schema: { body: RegisterIpnUrlRequest } },
    async () => v1Stub('IPN URL registered successfully.'),
  );
  app.post('/payments/lipa-fare/', { ...bearer, schema: { body: LipaFareRequest } }, async () =>
    v1Stub('Lipa fare processed successfully.'),
  );
  app.post('/utilities/', { ...bearer, schema: { body: UtilityPaymentRequest } }, async () =>
    v1Stub('Utility payment processed successfully.'),
  );
  app.post(
    '/utilities/bill-query',
    { ...bearer, schema: { body: UtilityBillQueryRequest } },
    async () => v1Stub('Utility bill queried successfully.'),
  );
  app.post(
    '/payments/bulk-payments/status/',
    { ...bearer, schema: { body: TransactionReferenceRequest } },
    async () => v1Stub('Bulk payment status fetched successfully.'),
  );
  app.post(
    '/accounts/merchant-onboarding/',
    { ...bearer, schema: { body: MerchantOnboardingRequest } },
    async () => v1Stub('Merchant onboarded successfully.'),
  );
  app.get('/transactions/', { ...bearer, schema: { querystring: PassthroughQuery } }, async () =>
    v1List('Transactions fetched successfully.'),
  );
  app.get('/accounts/business-types/', bearer, async () =>
    v1List('Business types fetched successfully.'),
  );
  app.get('/accounts/countries/', bearer, async () => v1List('Countries fetched successfully.'));
  app.get(
    '/accounts/sub-counties/',
    { ...bearer, schema: { querystring: SubCountiesQuery } },
    async (request) => {
      const { county_id } = request.query as { county_id: string };
      return {
        status: true,
        responseCode: '0',
        message: 'Sub counties fetched successfully.',
        county_id,
        data: [],
      };
    },
  );
  app.get('/accounts/industries/', bearer, async () => v1List('Industries fetched successfully.'));
  app.get(
    '/accounts/available-bill-number/',
    { ...bearer, schema: { querystring: PassthroughQuery } },
    async () => v1List('Available bill number fetched successfully.'),
  );
}

async function sendC2bWebhooks(
  webhookUrl: string,
  gatewayData: Record<string, any>,
  ipnData: Record<string, any>,
  transactionId: string | null,
): Promise<void> {
  await deliverCallback({
    provider: 'sasapay',
    flow: 'c2b',
    eventType: 'gateway',
    url: webhookUrl,
    payload: gatewayData,
    transactionId,
  });
  await new Promise((r) => setTimeout(r, settings.MOCK_CALLBACK_DELAY_SECONDS * 1000));
  await deliverCallback({
    provider: 'sasapay',
    flow: 'c2b',
    eventType: 'ipn',
    url: webhookUrl,
    payload: ipnData,
    transactionId,
  });
}
