/** SasaPay v1 request schemas. Mirrors app/schemas/sasapay.py. */
import { z } from 'zod';

import {
  channelCodeStr,
  currencyCodeStr,
  decimalString,
  digitsString,
  httpUrl,
  networkCodeStr,
  nonEmptyStr,
  shortCodeStr,
} from '@/schemas/common.js';

export const AuthQuery = z
  .object({
    grant_type: z.literal('client_credentials'),
  })
  .strict();

export const C2BRequest = z
  .object({
    MerchantCode: shortCodeStr,
    NetworkCode: networkCodeStr,
    PhoneNumber: digitsString('PhoneNumber', 10, 15),
    Amount: decimalString('Amount'),
    Currency: currencyCodeStr,
    AccountReference: nonEmptyStr(),
    CallBackURL: httpUrl,
    TransactionDesc: nonEmptyStr().nullish(),
    TransactionFee: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v, ctx): string | null => {
        if (v === null || v === undefined) return null;
        try {
          // allow_zero=True
          return decimalImpl(v, 'TransactionFee', true);
        } catch (e) {
          ctx.addIssue({ code: 'custom', message: (e as Error).message });
          return z.NEVER;
        }
      }),
  })
  .strict();

export const ProcessPaymentRequest = z
  .object({
    MerchantCode: shortCodeStr,
    CheckoutRequestID: nonEmptyStr(),
    VerificationCode: digitsString('VerificationCode', 4, 8),
  })
  .strict();

export const B2CRequest = z
  .object({
    MerchantCode: shortCodeStr,
    Amount: decimalString('Amount'),
    Currency: currencyCodeStr,
    MerchantTransactionReference: nonEmptyStr(),
    ReceiverNumber: digitsString('ReceiverNumber', 10, 15),
    Channel: channelCodeStr,
    Reason: nonEmptyStr(),
    CallBackURL: httpUrl,
  })
  .strict();

export const B2BRequest = z
  .object({
    MerchantCode: shortCodeStr,
    MerchantTransactionReference: nonEmptyStr(),
    Currency: currencyCodeStr,
    Amount: decimalString('Amount'),
    ReceiverMerchantCode: shortCodeStr,
    ReceiverAccountType: z.enum(['PAYBILL', 'TILL']),
    NetworkCode: networkCodeStr,
    Reason: nonEmptyStr(),
    CallBackURL: httpUrl,
    AccountReference: nonEmptyStr().nullish(),
  })
  .strict();

export const TransactionStatusRequest = z
  .object({
    MerchantCode: shortCodeStr,
    MerchantTransactionReference: nonEmptyStr().nullish(),
    TransactionCode: nonEmptyStr().nullish(),
    CheckoutRequestId: nonEmptyStr().nullish(),
    CallbackUrl: httpUrl.nullish(),
  })
  .strict()
  .refine((d) => d.MerchantTransactionReference || d.TransactionCode || d.CheckoutRequestId, {
    message:
      'Either MerchantTransactionReference, TransactionCode or CheckoutRequestId must be provided',
  });

export const BulkPaymentRecipient = z
  .object({
    receiverNumber: digitsString('receiverNumber', 10, 15),
    amount: decimalString('amount'),
    channel: channelCodeStr,
    accountReference: nonEmptyStr().nullish(),
    reason: nonEmptyStr().nullish(),
  })
  .strict();

export const BulkPaymentRequest = z
  .object({
    MerchantCode: shortCodeStr,
    MerchantTransactionReference: nonEmptyStr(),
    Currency: currencyCodeStr,
    CallBackURL: httpUrl,
    Recipients: z
      .array(BulkPaymentRecipient)
      .min(1, 'Recipients must contain at least one entry')
      .max(1000, 'Recipients cannot exceed 1000 entries'),
  })
  .strict();

export const AccountVerifyRequest = z
  .object({
    MerchantCode: shortCodeStr,
    AccountNumber: digitsString('AccountNumber', 4, 20),
    Channel: channelCodeStr,
  })
  .strict();

function decimalImpl(v: unknown, field: string, allowZero: boolean): string {
  // local copy to keep TransactionFee message-perfect
  const raw = String(v).trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(raw)) {
    throw new Error(`${field} must be a valid decimal value`);
  }
  const num = Number(raw);
  if (Number.isNaN(num)) throw new Error(`${field} must be a valid decimal value`);
  if (num < 0 || (num === 0 && !allowZero)) {
    throw new Error(
      `${field} must be ${allowZero ? 'greater than or equal to 0' : 'greater than 0'}`,
    );
  }
  let s = String(num);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

export type SasaC2BBody = z.infer<typeof C2BRequest>;
export type SasaProcessPaymentBody = z.infer<typeof ProcessPaymentRequest>;
export type SasaB2CBody = z.infer<typeof B2CRequest>;
export type SasaB2BBody = z.infer<typeof B2BRequest>;
export type SasaTransactionStatusBody = z.infer<typeof TransactionStatusRequest>;
export type SasaBulkBody = z.infer<typeof BulkPaymentRequest>;
export type SasaAccountVerifyBody = z.infer<typeof AccountVerifyRequest>;
