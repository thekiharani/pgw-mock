import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { validateBasicAuth } from '@/auth/basic.js';
import { validateBearerToken } from '@/auth/bearer.js';
import { requireClientCredentialsGrant } from '@/auth/grant.js';
import { settings } from '@/config.js';
import { DEFAULT_SASAPAY_CALLBACK } from '@/constants.js';
import { db } from '@/db/client.js';
import { PayloadError } from '@/errors.js';
import { getMerchantByCode } from '@/actions/index.js';
import {
  findWaasOnboardingByMerchantAndMobile,
  getWaasOnboardingByRequestId,
  insertWaasOnboardingRequest,
  updateWaasOnboardingStatus,
} from '@/actions/waasQueries.js';
import {
  BusinessConfirmationRequest,
  BusinessKycRequest,
  BusinessOnboardingRequest,
  PersonalConfirmationRequest,
  PersonalKycRequest,
  PersonalOnboardingRequest,
} from '@/schemas/waas.js';
import { decimalString, digitsString, nonEmptyStr, shortCodeStr } from '@/schemas/common.js';
import { deliverCallback, scheduleCallback } from '@/services/callbacks.js';
import { handleConfirmation } from '@/services/waasConfirmation.js';
import { registerToken } from '@/services/tokens.js';
import { enqueueBackgroundTask } from '@/utils/background.js';
import { generateOtp, maskAccountNumber, maskMsisdn, maskValue } from '@/utils/waas.js';
import { generateToken, uuid7 } from '@/utils/generators.js';
import {
  BANKS,
  BUSINESS_TYPES,
  BUSINESS_TYPE_BY_ID,
  COUNTRIES,
  INDUSTRIES,
  PRODUCTS,
  SUB_INDUSTRIES,
  SUB_REGIONS,
  responsePayload,
} from '@/utils/waasReferenceData.js';
import { ensureOnboarded, ensureWallet, recordTransaction } from '@/routes/sasapay/waasWallet.js';
import { pendingPayments } from '@/routes/stores.js';

const bearer = { onRequest: validateBearerToken } as const;
const isoNaive = (d: Date | null | undefined): string | null =>
  d
    ? d
        .toISOString()
        .replace('Z', '')
        .replace(/\.000$/, '')
    : null;

const WAAS_VERIFICATION_CODE = '1234';
const WAAS_VERIFICATION_TTL_MINUTES = 5;

const optionalDigits = (min: number, max: number) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx): string | null => {
      if (v === null || v === undefined || v === '') return null;
      const raw = String(v).trim();
      if (!/^\d+$/.test(raw)) {
        ctx.addIssue({ code: 'custom', message: 'senderAccountNumber must contain digits only' });
        return z.NEVER;
      }
      if (raw.length < min || raw.length > max) {
        ctx.addIssue({
          code: 'custom',
          message: `senderAccountNumber must be between ${min} and ${max} digits`,
        });
        return z.NEVER;
      }
      return raw;
    });

const WalletSendRequest = z
  .object({
    merchantCode: shortCodeStr,
    senderAccountNumber: digitsString('accountNumber', 4, 20),
    receiverAccountNumber: digitsString('accountNumber', 4, 20),
    amount: decimalString('amount'),
    currency: nonEmptyStr().nullish().default('KES'),
    reason: nonEmptyStr().nullish(),
    reference: nonEmptyStr().nullish(),
  })
  .strict();

const WalletTopupRequest = z
  .object({
    merchantCode: shortCodeStr,
    accountNumber: digitsString('accountNumber', 4, 20),
    amount: decimalString('amount'),
    currency: nonEmptyStr().nullish().default('KES'),
    source: nonEmptyStr().nullish(),
    reference: nonEmptyStr().nullish(),
  })
  .strict();

const baseWaasPayment = {
  merchantCode: shortCodeStr,
  amount: decimalString('amount'),
  currencyCode: nonEmptyStr().nullish().default('KES'),
  callbackUrl: nonEmptyStr().nullish(),
  transactionReference: nonEmptyStr().nullish(),
  merchantTransactionReference: nonEmptyStr().nullish(),
  transactionDesc: nonEmptyStr().nullish(),
};

const WaasRequestPaymentRequest = z
  .object({
    ...baseWaasPayment,
    senderAccountNumber: optionalDigits(4, 20),
    customerMobile: optionalDigits(4, 20),
  })
  .passthrough();

const WaasProcessPaymentRequest = z
  .object({
    merchantCode: shortCodeStr,
    checkoutRequestId: nonEmptyStr(),
    verificationCode: nonEmptyStr(),
  })
  .passthrough();

const WaasMerchantTransferRequest = z
  .object({
    ...baseWaasPayment,
    senderAccountNumber: digitsString('senderAccountNumber', 4, 20),
    receiverMerchantCode: shortCodeStr,
  })
  .passthrough();

const WaasSendMoneyRequest = z
  .object({
    ...baseWaasPayment,
    senderAccountNumber: digitsString('phoneNumber', 4, 20),
    receiverNumber: digitsString('phoneNumber', 4, 20),
    networkCode: nonEmptyStr().nullish().default('63902'),
  })
  .passthrough();

const WaasPayBillRequest = z
  .object({
    ...baseWaasPayment,
    senderAccountNumber: digitsString('senderAccountNumber', 4, 20),
    billerMerchantCode: shortCodeStr.nullish(),
    accountReference: nonEmptyStr().nullish(),
    paybillNumber: shortCodeStr.nullish(),
  })
  .passthrough();

function paymentReference(body: any): string {
  return body.transactionReference || body.merchantTransactionReference || uuid7();
}

export async function waasV2Routes(app: FastifyInstance): Promise<void> {
  app.get('/auth/token/', { onRequest: validateBasicAuth }, async (request) => {
    requireClientCredentialsGrant(request, 'sasapay');
    const scope = 'onboarding kyc reference-data wallet payments';
    const token = await generateToken(request.authMerchantId);
    await registerToken(db, token, {
      provider: 'sasapay-waas',
      expiresIn: 3600,
      scope,
      meta: { merchantId: request.authMerchantId ?? null },
    });
    return {
      status: true,
      responseCode: '0',
      detail: 'SUCCESS',
      access_token: token,
      expires_in: 3600,
      token_type: 'Bearer',
      scope,
    };
  });

  app.get('/countries/', bearer, async () =>
    responsePayload('Countries fetched successfully.', COUNTRIES),
  );
  app.get('/countries/sub-regions/', bearer, async (request) => {
    const callingCode = (request.query as Record<string, any>).callingCode;
    if (!callingCode) {
      throw new PayloadError({
        statusCode: 400,
        payload: {
          status: false,
          responseCode: '400',
          message: 'callingCode query parameter is required',
        },
      });
    }
    return responsePayload(
      'Sub-regions fetched successfully.',
      SUB_REGIONS[String(callingCode)] ?? [],
    );
  });
  app.get('/industries/', bearer, async () =>
    responsePayload('Industries fetched successfully.', INDUSTRIES),
  );
  app.get('/sub-industries/', bearer, async (request) => {
    const industryId = (request.query as Record<string, any>).industryId;
    if (industryId === undefined || industryId === null) {
      throw new PayloadError({
        statusCode: 400,
        payload: {
          status: false,
          responseCode: '400',
          message: 'industryId query parameter is required',
        },
      });
    }
    return responsePayload(
      'Sub-industries fetched successfully.',
      SUB_INDUSTRIES[String(industryId)] ?? [],
    );
  });
  app.get('/business-types/', bearer, async () =>
    responsePayload('Business types fetched successfully.', BUSINESS_TYPES),
  );
  app.get('/products/', bearer, async () =>
    responsePayload('Products fetched successfully.', PRODUCTS),
  );
  app.get('/banks/', bearer, async () => responsePayload('Banks fetched successfully.', BANKS));

  app.post(
    '/personal-onboarding/',
    { ...bearer, schema: { body: PersonalOnboardingRequest } },
    async (request) => {
      const body = request.body as any;
      const merchant = await getMerchantByCode(db, body.merchantCode);
      if (!merchant) {
        throw new PayloadError({
          statusCode: 400,
          payload: { status: false, responseCode: '400', message: 'Invalid Merchant Account' },
        });
      }
      const parts = [body.firstName, body.middleName, body.lastName];
      const displayName = parts.filter((p) => p).join(' ');
      const requestId = uuid7();
      const otp = generateOtp();
      const mobile = String(body.mobileNumber);

      try {
        await insertWaasOnboardingRequest(db, {
          request_id: requestId,
          type: 'personal',
          merchant_code: body.merchantCode,
          mobile_number: mobile,
          callback_url: body.callbackUrl ? String(body.callbackUrl) : null,
          display_name: displayName,
          account_number: mobile,
          otp,
          status: 'STAGED',
          payload: body,
        });
      } catch {
        throw new PayloadError({
          statusCode: 500,
          payload: {
            status: false,
            responseCode: '500',
            message: 'Failed to stage onboarding request',
          },
        });
      }

      return {
        status: true,
        responseCode: '0',
        message: `Confirmation code has been sent to ${maskMsisdn(mobile)}`,
        requestId,
      };
    },
  );

  app.post(
    '/personal-onboarding/confirmation/',
    { ...bearer, schema: { body: PersonalConfirmationRequest } },
    async (request) => {
      const body = request.body as any;
      return handleConfirmation({
        merchantCode: body.merchantCode,
        requestId: body.requestId,
        otp: String(body.otp),
        recordType: 'personal',
        request,
        buildResponse: (record) => {
          const accountNumber = record.accountNumber || record.mobileNumber;
          const displayName = record.displayName || maskValue(String(accountNumber), 3, 3);
          return {
            status: true,
            responseCode: '0',
            message: 'Registration successful',
            data: {
              merchantCode: record.merchantCode,
              accountNumber: maskAccountNumber(accountNumber),
              displayName,
              accountStatus: 'ACTIVE',
              accountBalance: 0,
            },
          };
        },
      });
    },
  );

  app.post(
    '/personal-onboarding/kyc/',
    { ...bearer, schema: { body: PersonalKycRequest } },
    async (request) => {
      const body = request.body as any;
      const merchant = await getMerchantByCode(db, body.merchantCode);
      if (!merchant) {
        throw new PayloadError({
          statusCode: 400,
          payload: { status: false, responseCode: '400', message: 'Invalid Merchant Account' },
        });
      }

      const record = await findWaasOnboardingByMerchantAndMobile(
        db,
        body.merchantCode,
        String(body.customerMobileNumber),
        'personal',
      );

      if (record) {
        try {
          await updateWaasOnboardingStatus(db, record.id, 'KYC_UPLOADED');
        } catch {
          throw new PayloadError({
            statusCode: 500,
            payload: {
              status: false,
              responseCode: '500',
              message: 'Failed to update onboarding status',
            },
          });
        }

        if (record.callbackUrl) {
          scheduleCallback(request, {
            provider: 'sasapay-waas',
            flow: 'personal_kyc',
            eventType: 'approval',
            url: record.callbackUrl,
            payload: {
              merchantCode: body.merchantCode,
              displayName: record.displayName,
              accountNumber: maskAccountNumber(record.accountNumber || record.mobileNumber),
              accountStatus: 'APPROVED',
              description: 'Onboarding process completed successfully.',
            },
          });
        }
      }

      return { status: true, responseCode: '0', message: 'Documents uploaded.' };
    },
  );

  app.post(
    '/business-onboarding/',
    { ...bearer, schema: { body: BusinessOnboardingRequest } },
    async (request) => {
      const body = request.body as any;
      const merchant = await getMerchantByCode(db, body.merchantCode);
      if (!merchant) {
        throw new PayloadError({
          statusCode: 400,
          payload: { status: false, responseCode: '400', message: 'Invalid Merchant Account' },
        });
      }
      const requestId = uuid7();
      const otp = generateOtp();
      const mobile = String(body.mobileNumber);

      try {
        await insertWaasOnboardingRequest(db, {
          request_id: requestId,
          type: 'business',
          merchant_code: body.merchantCode,
          mobile_number: mobile,
          callback_url: body.callbackUrl ? String(body.callbackUrl) : null,
          display_name: body.businessName,
          account_number: '',
          otp,
          status: 'STAGED',
          payload: body,
          directors: body.directors ?? [],
        });
      } catch {
        throw new PayloadError({
          statusCode: 500,
          payload: {
            status: false,
            responseCode: '500',
            message: 'Failed to stage onboarding request',
          },
        });
      }

      return {
        status: true,
        responseCode: '0',
        message: `Confirmation code has been sent to ${maskMsisdn(mobile)}`,
        requestId,
      };
    },
  );

  app.post(
    '/business-onboarding/confirmation/',
    { ...bearer, schema: { body: BusinessConfirmationRequest } },
    async (request) => {
      const body = request.body as any;
      return handleConfirmation({
        merchantCode: body.merchantCode,
        requestId: body.requestId,
        otp: String(body.otp),
        recordType: 'business',
        request,
        buildResponse: (record) => ({
          status: true,
          responseCode: '0',
          message:
            'Your business account request has been received successfully and is awaiting approval',
          data: {
            requestId: record.id,
            merchantCode: record.merchantCode,
            accountNumber: '',
            displayName: record.displayName,
            accountStatus: 'AWAITING_KYC_UPLOAD',
            accountBalance: 0.0,
          },
        }),
      });
    },
  );

  app.post(
    '/business-onboarding/kyc/',
    { ...bearer, schema: { body: BusinessKycRequest } },
    async (request) => {
      const body = request.body as any;
      const merchant = await getMerchantByCode(db, body.merchantCode);
      if (!merchant) {
        throw new PayloadError({
          statusCode: 400,
          payload: { status: false, responseCode: '400', message: 'Invalid Merchant Account' },
        });
      }

      const record = await getWaasOnboardingByRequestId(db, body.requestId);
      if (!record || record.merchantCode !== body.merchantCode || record.type !== 'business') {
        throw new PayloadError({
          statusCode: 400,
          payload: { status: false, responseCode: '400', message: 'Invalid requestId' },
        });
      }

      validateBusinessKycDocuments(body, (record.payload as Record<string, any>) ?? null);

      try {
        await updateWaasOnboardingStatus(db, body.requestId, 'KYC_UPLOADED');
      } catch {
        throw new PayloadError({
          statusCode: 500,
          payload: {
            status: false,
            responseCode: '500',
            message: 'Failed to update onboarding status',
          },
        });
      }

      if (record.callbackUrl) {
        scheduleCallback(request, {
          provider: 'sasapay-waas',
          flow: 'business_kyc',
          eventType: 'approval',
          url: record.callbackUrl,
          payload: {
            merchantCode: body.merchantCode,
            displayName: record.displayName,
            accountNumber: record.accountNumber ? maskAccountNumber(record.accountNumber) : '',
            accountStatus: 'APPROVED',
            description: 'Business onboarding process completed successfully.',
          },
        });
      }

      return { status: true, responseCode: '0', message: 'Business KYC uploaded.' };
    },
  );

  app.get('/onboarding/requests/:request_id', bearer, async (request) => {
    const requestId = String((request.params as Record<string, string>).request_id);
    const includeOtp = ['1', 'true', 'yes'].includes(
      String((request.query as Record<string, any>).includeOtp ?? '').toLowerCase(),
    );
    const record = await getWaasOnboardingByRequestId(db, requestId);
    if (!record) {
      throw new PayloadError({
        statusCode: 404,
        payload: { status: false, responseCode: '404', message: 'Onboarding request not found' },
      });
    }
    const data: Record<string, any> = {
      requestId: record.id,
      type: record.type,
      merchantCode: record.merchantCode,
      mobileNumber: record.mobileNumber,
      callbackUrl: record.callbackUrl,
      displayName: record.displayName,
      accountNumber: record.accountNumber,
      status: record.status,
      payload: record.payload,
      directors: record.directors,
      createdAt: isoNaive(record.createdAt),
      updatedAt: isoNaive(record.updatedAt),
    };
    if (includeOtp) data.otp = record.otp;
    return { status: true, responseCode: '0', message: 'Onboarding request found', data };
  });

  app.get('/wallets/:account_number/balance/', bearer, async (request) => {
    const accountNumber = String((request.params as Record<string, string>).account_number);
    await ensureOnboarded(accountNumber);
    const wallet = ensureWallet(accountNumber);
    return {
      status: true,
      responseCode: '0',
      message: 'Balance fetched successfully.',
      data: { accountNumber, balance: wallet.balance, currency: wallet.currency },
    };
  });

  app.get('/wallets/:account_number/statement/', bearer, async (request) => {
    const accountNumber = String((request.params as Record<string, string>).account_number);
    const limit = Number((request.query as Record<string, any>).limit ?? 10);
    await ensureOnboarded(accountNumber);
    const wallet = ensureWallet(accountNumber);
    const transactions = [...wallet.transactions].reverse().slice(0, limit);
    return {
      status: true,
      responseCode: '0',
      message: 'Statement fetched successfully.',
      data: { accountNumber, balance: wallet.balance, currency: wallet.currency, transactions },
    };
  });

  app.post(
    '/wallets/transactions/send/',
    { ...bearer, schema: { body: WalletSendRequest } },
    async (request) => {
      const body = request.body as any;
      await ensureOnboarded(body.senderAccountNumber);
      const senderWallet = ensureWallet(body.senderAccountNumber);
      const amount = Number(body.amount);
      if (senderWallet.balance < amount) {
        throw new PayloadError({
          statusCode: 400,
          payload: { status: false, responseCode: '400', message: 'Insufficient wallet balance' },
        });
      }
      const reference = body.reference || uuid7();
      const debit = recordTransaction(body.senderAccountNumber, {
        direction: 'DEBIT',
        amount,
        counterparty: body.receiverAccountNumber,
        reason: body.reason || 'Wallet transfer',
        reference,
      });
      recordTransaction(body.receiverAccountNumber, {
        direction: 'CREDIT',
        amount,
        counterparty: body.senderAccountNumber,
        reason: body.reason || 'Wallet transfer',
        reference,
      });
      return {
        status: true,
        responseCode: '0',
        message: 'Wallet transfer processed successfully.',
        data: {
          transactionId: debit.transactionId,
          reference,
          senderAccountNumber: body.senderAccountNumber,
          receiverAccountNumber: body.receiverAccountNumber,
          amount,
          senderBalanceAfter: senderWallet.balance,
        },
      };
    },
  );

  app.post(
    '/wallets/transactions/topup/',
    { ...bearer, schema: { body: WalletTopupRequest } },
    async (request) => {
      const body = request.body as any;
      await ensureOnboarded(body.accountNumber);
      const amount = Number(body.amount);
      const reference = body.reference || uuid7();
      const entry = recordTransaction(body.accountNumber, {
        direction: 'CREDIT',
        amount,
        counterparty: body.source || 'External top-up',
        reason: 'Wallet top-up',
        reference,
      });
      return {
        status: true,
        responseCode: '0',
        message: 'Top-up processed successfully.',
        data: {
          transactionId: entry.transactionId,
          reference,
          accountNumber: body.accountNumber,
          amount,
          balanceAfter: entry.balanceAfter,
        },
      };
    },
  );

  app.post(
    '/payments/request-payment/',
    { ...bearer, schema: { body: WaasRequestPaymentRequest } },
    async (request) => {
      const body = request.body as any;
      const sender = body.senderAccountNumber || body.customerMobile;
      if (!sender) throw conflict('senderAccountNumber or customerMobile is required');
      await ensureOnboarded(sender);
      const checkoutRequestId = uuid7();
      const paymentRequestId = uuid7();
      const reference = paymentReference(body);
      const callbackUrl = body.callbackUrl ? String(body.callbackUrl) : DEFAULT_SASAPAY_CALLBACK;

      pendingPayments.set(checkoutRequestId, {
        merchantCode: body.merchantCode,
        senderAccountNumber: sender,
        amount: Number(body.amount),
        currencyCode: body.currencyCode,
        reference,
        verificationCode: WAAS_VERIFICATION_CODE,
        expiresAt: new Date(Date.now() + WAAS_VERIFICATION_TTL_MINUTES * 60_000).toISOString(),
        callbackUrl,
        paymentRequestId,
        processed: false,
        transactionDesc: body.transactionDesc ?? null,
      });

      return success('OTP sent. Share the code to complete transaction.', {
        CheckoutRequestID: checkoutRequestId,
        MerchantRequestID: reference,
        PaymentRequestID: paymentRequestId,
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing',
        CustomerMessage: 'Enter the verification code to authorize the wallet debit.',
      });
    },
  );

  app.post(
    '/payments/process-payment/',
    { ...bearer, schema: { body: WaasProcessPaymentRequest } },
    async (request) => {
      const body = request.body as any;
      const pending = pendingPayments.get(body.checkoutRequestId);
      if (!pending) throw conflict('Checkout request does not exist');
      if (pending.processed) throw conflict('Checkout request has already been processed');
      if (pending.merchantCode !== body.merchantCode) {
        throw conflict('Merchant code does not match the original request');
      }
      if (new Date(pending.expiresAt) < new Date()) throw conflict('Verification code has expired');
      if (String(body.verificationCode) !== String(pending.verificationCode)) {
        throw conflict('Invalid verification code');
      }

      const sender = pending.senderAccountNumber;
      const amount = Number(pending.amount);
      const senderWallet = ensureWallet(sender);
      if (senderWallet.balance < amount) throw conflict('Insufficient wallet balance');

      const reference = pending.reference;
      const debit = recordTransaction(sender, {
        direction: 'DEBIT',
        amount,
        counterparty: pending.merchantCode,
        reason: pending.transactionDesc || 'WAAS C2B payment',
        reference,
      });
      pending.processed = true;
      pending.processedAt = new Date().toISOString();

      const payload = {
        MerchantRequestID: reference,
        CheckoutRequestID: body.checkoutRequestId,
        PaymentRequestID: pending.paymentRequestId,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        TransactionCode: debit.transactionId,
        MerchantCode: body.merchantCode,
        CustomerMobile: sender,
        TransAmount: amount,
        OrgAccountBalance: senderWallet.balance,
        TransactionDate: debit.timestamp,
      };
      enqueueBackgroundTask(request, () =>
        deliverPaymentCallback(
          pending.callbackUrl,
          payload,
          'waas-request-payment',
          debit.transactionId,
        ),
      );

      return success('Payment processed successfully.', {
        CheckoutRequestID: body.checkoutRequestId,
        MerchantCode: body.merchantCode,
        TransactionCode: debit.transactionId,
        ResponseCode: '0',
        ResponseDescription: 'Success. Payment processed successfully.',
        CustomerMessage: 'Payment processed successfully.',
      });
    },
  );

  app.post(
    '/payments/merchant-transfers/',
    { ...bearer, schema: { body: WaasMerchantTransferRequest } },
    async (request) => {
      const body = request.body as any;
      await ensureOnboarded(body.senderAccountNumber);
      const amount = Number(body.amount);
      const senderWallet = ensureWallet(body.senderAccountNumber);
      if (senderWallet.balance < amount) throw conflict('Insufficient wallet balance');
      const reference = paymentReference(body);
      const debit = recordTransaction(body.senderAccountNumber, {
        direction: 'DEBIT',
        amount,
        counterparty: body.receiverMerchantCode,
        reason: body.transactionDesc || 'WAAS merchant transfer',
        reference,
      });
      const callbackUrl = body.callbackUrl ? String(body.callbackUrl) : DEFAULT_SASAPAY_CALLBACK;
      const payload = {
        MerchantRequestID: reference,
        TransactionCode: debit.transactionId,
        ResultCode: 0,
        ResultDesc: 'Merchant transfer processed successfully.',
        MerchantCode: body.merchantCode,
        ReceiverMerchantCode: body.receiverMerchantCode,
        SenderAccountNumber: body.senderAccountNumber,
        TransAmount: amount,
        OrgAccountBalance: senderWallet.balance,
        TransactionDate: debit.timestamp,
      };
      enqueueBackgroundTask(request, () =>
        deliverPaymentCallback(callbackUrl, payload, 'waas-merchant-transfer', debit.transactionId),
      );
      return success('Merchant transfer accepted for processing.', {
        TransactionCode: debit.transactionId,
        MerchantRequestID: reference,
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing.',
        senderBalanceAfter: senderWallet.balance,
      });
    },
  );

  app.post(
    '/payments/send-money/',
    { ...bearer, schema: { body: WaasSendMoneyRequest } },
    async (request) => {
      const body = request.body as any;
      await ensureOnboarded(body.senderAccountNumber);
      const amount = Number(body.amount);
      const senderWallet = ensureWallet(body.senderAccountNumber);
      if (senderWallet.balance < amount) throw conflict('Insufficient wallet balance');
      const reference = paymentReference(body);
      const debit = recordTransaction(body.senderAccountNumber, {
        direction: 'DEBIT',
        amount,
        counterparty: body.receiverNumber,
        reason: body.transactionDesc || 'WAAS send money',
        reference,
      });
      const callbackUrl = body.callbackUrl ? String(body.callbackUrl) : DEFAULT_SASAPAY_CALLBACK;
      const payload = {
        MerchantRequestID: reference,
        TransactionCode: debit.transactionId,
        ResultCode: 0,
        ResultDesc: 'Send money processed successfully.',
        MerchantCode: body.merchantCode,
        SenderAccountNumber: body.senderAccountNumber,
        ReceiverNumber: body.receiverNumber,
        NetworkCode: body.networkCode,
        TransAmount: amount,
        OrgAccountBalance: senderWallet.balance,
        TransactionDate: debit.timestamp,
      };
      enqueueBackgroundTask(request, () =>
        deliverPaymentCallback(callbackUrl, payload, 'waas-send-money', debit.transactionId),
      );
      return success('Send money accepted for processing.', {
        TransactionCode: debit.transactionId,
        MerchantRequestID: reference,
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing.',
        senderBalanceAfter: senderWallet.balance,
      });
    },
  );

  app.post(
    '/payments/pay-bills/',
    { ...bearer, schema: { body: WaasPayBillRequest } },
    async (request) => {
      const body = request.body as any;
      await ensureOnboarded(body.senderAccountNumber);
      const biller = body.billerMerchantCode || body.paybillNumber;
      if (!biller) throw conflict('billerMerchantCode or paybillNumber is required');
      const amount = Number(body.amount);
      const senderWallet = ensureWallet(body.senderAccountNumber);
      if (senderWallet.balance < amount) throw conflict('Insufficient wallet balance');
      const reference = paymentReference(body);
      const debit = recordTransaction(body.senderAccountNumber, {
        direction: 'DEBIT',
        amount,
        counterparty: biller,
        reason: body.transactionDesc || 'WAAS pay bill',
        reference,
      });
      const callbackUrl = body.callbackUrl ? String(body.callbackUrl) : DEFAULT_SASAPAY_CALLBACK;
      const payload = {
        MerchantRequestID: reference,
        TransactionCode: debit.transactionId,
        ResultCode: 0,
        ResultDesc: 'Bill payment processed successfully.',
        MerchantCode: body.merchantCode,
        BillerMerchantCode: biller,
        AccountReference: body.accountReference ?? null,
        SenderAccountNumber: body.senderAccountNumber,
        TransAmount: amount,
        OrgAccountBalance: senderWallet.balance,
        TransactionDate: debit.timestamp,
      };
      enqueueBackgroundTask(request, () =>
        deliverPaymentCallback(callbackUrl, payload, 'waas-pay-bills', debit.transactionId),
      );
      return success('Bill payment accepted for processing.', {
        TransactionCode: debit.transactionId,
        MerchantRequestID: reference,
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing.',
        senderBalanceAfter: senderWallet.balance,
      });
    },
  );

  // Official WaaS endpoints. Methods + GET query params are taken from the SDK
  // (SasaPayClient WaaS methods); bodies validate the merchantCode the SDK sends
  // and pass the rest through. Responses are generic envelopes pending the docs.
  const WaasMerchantBody = z.object({ merchantCode: shortCodeStr }).passthrough();
  const WaasReferenceBody = z.object({}).passthrough();
  const WaasMerchantBalanceQuery = z.object({ merchantCode: shortCodeStr });
  const WaasNearestAgentQuery = z.object({ Longitude: nonEmptyStr(), Latitude: nonEmptyStr() });
  const WaasPassthroughQuery = z.object({}).passthrough();

  app.get('/customers/', { ...bearer, schema: { querystring: WaasPassthroughQuery } }, async () =>
    responsePayload('Customers fetched successfully.', []),
  );
  app.post('/customer-details/', { ...bearer, schema: { body: WaasMerchantBody } }, async () =>
    responsePayload('Customer details fetched successfully.', []),
  );
  app.post(
    '/customer-details/update/',
    { ...bearer, schema: { body: WaasMerchantBody } },
    async () => responsePayload('Customer details updated successfully.', []),
  );
  app.post('/sub-wallets/', { ...bearer, schema: { body: WaasMerchantBody } }, async () =>
    responsePayload('Sub-wallet created successfully.', []),
  );
  app.get(
    '/transactions/',
    { ...bearer, schema: { querystring: WaasPassthroughQuery } },
    async () => responsePayload('Transactions fetched successfully.', []),
  );
  app.post('/transactions/status/', { ...bearer, schema: { body: WaasReferenceBody } }, async () =>
    responsePayload('Transaction status fetched successfully.', []),
  );
  app.post('/transactions/verify/', { ...bearer, schema: { body: WaasReferenceBody } }, async () =>
    responsePayload('Transaction verified successfully.', []),
  );
  app.get(
    '/merchant-balances/',
    { ...bearer, schema: { querystring: WaasMerchantBalanceQuery } },
    async (request) => {
      const { merchantCode } = request.query as { merchantCode: string };
      return {
        status: true,
        responseCode: '0',
        message: 'Merchant balances fetched successfully.',
        merchantCode,
        data: [],
      };
    },
  );
  app.get('/channel-codes/', bearer, async () =>
    responsePayload('Channel codes fetched successfully.', []),
  );
  app.get(
    '/nearest-agent/',
    { ...bearer, schema: { querystring: WaasNearestAgentQuery } },
    async (request) => {
      const { Longitude, Latitude } = request.query as { Longitude: string; Latitude: string };
      return {
        status: true,
        responseCode: '0',
        message: 'Nearest agents fetched successfully.',
        Longitude,
        Latitude,
        data: [],
      };
    },
  );
  app.post('/utilities/', { ...bearer, schema: { body: WaasMerchantBody } }, async () =>
    responsePayload('Utility payment processed successfully.', []),
  );
}

function success(detail: string, extras: Record<string, any>): Record<string, any> {
  return { status: true, responseCode: '0', message: detail, ...extras };
}

function conflict(message: string): PayloadError {
  return new PayloadError({
    statusCode: 400,
    payload: { status: false, responseCode: '400', message },
  });
}

async function deliverPaymentCallback(
  url: string,
  payload: Record<string, any>,
  flow: string,
  transactionId: string | null,
): Promise<void> {
  await deliverCallback({
    provider: 'sasapay',
    flow,
    eventType: 'gateway',
    url,
    payload,
    transactionId,
  });
}

function validateBusinessKycDocuments(
  body: any,
  onboardingPayload: Record<string, any> | null,
): void {
  if (settings.RELAXED_WAAS_KYC) return;

  const missing: string[] = [];
  for (const field of [
    'businessKraPin',
    'businessRegistrationCertificate',
    'proofOfAddressDocument',
    'proofOfBankDocument',
  ]) {
    if (!body[field]) missing.push(field);
  }

  const payload = onboardingPayload ?? {};
  const businessTypeId = payload.businessTypeId;
  const businessType =
    businessTypeId !== null && businessTypeId !== undefined
      ? BUSINESS_TYPE_BY_ID.get(Number(businessTypeId))
      : undefined;

  if (businessType?.requiresBoardResolution && !body.boardResolution)
    missing.push('boardResolution');
  if (businessType?.requiresCr12 && !body.cr12Document) missing.push('cr12Document');

  if (!body.directorsKyc) {
    for (const field of ['directorIdCardFront', 'directorIdCardBack', 'directorKraPin']) {
      if (!body[field]) missing.push(field);
    }
  }

  if (missing.length) {
    const unique = [...new Set(missing)].sort();
    throw new PayloadError({
      statusCode: 400,
      payload: {
        status: false,
        responseCode: '400',
        message: 'Missing required KYC documents',
        errors: unique.map((field) => ({ field, message: 'This document is required' })),
      },
    });
  }
}
