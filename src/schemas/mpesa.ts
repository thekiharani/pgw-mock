/** M-Pesa/Daraja request schemas. Mirrors app/schemas/mpesa.py. */
import { z } from 'zod';

import {
  decimalString,
  digitsString,
  httpUrl,
  nonEmptyStr,
  normalizeNonEmpty,
  shortCodeStr,
} from '@/schemas/common.js';

export const STK_TRANSACTION_TYPES = new Set(['CustomerPayBillOnline', 'CustomerBuyGoodsOnline']);
export const C2B_COMMAND_IDS = new Set(['CustomerPayBillOnline', 'CustomerBuyGoodsOnline']);
export const B2C_COMMAND_IDS = new Set(['BusinessPayment', 'SalaryPayment', 'PromotionPayment']);
export const B2B_COMMAND_IDS = new Set([
  'BusinessToBusinessTransfer',
  'BusinessPayBill',
  'BusinessBuyGoods',
  'BusinessAccountTransfer',
  'MerchantToMerchantTransfer',
  'BusinessTopUp',
  'MerchantServicesMMFAccountTransfer',
  'AgencyFloatAdvance',
]);
export const REVERSAL_COMMAND_IDS = new Set(['TransactionReversal']);
export const TRANSACTION_STATUS_COMMAND_IDS = new Set(['TransactionStatusQuery']);
export const ACCOUNT_BALANCE_COMMAND_IDS = new Set(['AccountBalance']);
export const TAX_REMIT_COMMAND_IDS = new Set(['PayTaxToKRA']);
export const STANDING_ORDER_FREQUENCIES = new Set(['1', '2', '3', '4', '5', '6']);
export const IDENTIFIER_TYPES = new Set(['1', '2', '4']);
export const QR_TRX_CODES = new Set(['BG', 'WA', 'PB', 'SM', 'SB']);

// --- field builders -------------------------------------------------------

/** Optional command-id field: null/absent passes; otherwise must be in `allowed`. */
function optionalCommandId(allowed: Set<string>) {
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx): string | null => {
      if (v === null || v === undefined) return null;
      let raw: string;
      try {
        raw = normalizeNonEmpty(v, 'CommandID');
      } catch (e) {
        ctx.addIssue({ code: 'custom', message: (e as Error).message });
        return z.NEVER;
      }
      if (!allowed.has(raw)) {
        ctx.addIssue({ code: 'custom', message: 'CommandID is not supported' });
        return z.NEVER;
      }
      return raw;
    });
}

/** Optional identifier-type field ("1"|"2"|"4"). */
function optionalIdentifierType(message: string) {
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx): string | null => {
      if (v === null || v === undefined) return null;
      const raw = String(v).trim();
      if (!IDENTIFIER_TYPES.has(raw)) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return raw;
    });
}

function timestampField() {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform((v, ctx): string | null => {
      if (v === null || v === undefined) return null;
      const raw = String(v).trim();
      // YYYYMMDDHHMMSS
      if (!/^\d{14}$/.test(raw) || Number.isNaN(parseDateTime(raw))) {
        ctx.addIssue({ code: 'custom', message: 'Timestamp must use YYYYMMDDHHMMSS format' });
        return z.NEVER;
      }
      return raw;
    });
}

function parseDateTime(raw: string): number {
  const y = +raw.slice(0, 4);
  const mo = +raw.slice(4, 6);
  const d = +raw.slice(6, 8);
  const h = +raw.slice(8, 10);
  const mi = +raw.slice(10, 12);
  const s = +raw.slice(12, 14);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return NaN;
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

function parseDate8(raw: string): number {
  if (!/^\d{8}$/.test(raw)) return NaN;
  const y = +raw.slice(0, 4);
  const mo = +raw.slice(4, 6);
  const d = +raw.slice(6, 8);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  return Date.UTC(y, mo - 1, d);
}

// --- schemas --------------------------------------------------------------

export const STKPushRequest = z
  .object({
    BusinessShortCode: shortCodeStr.nullish(),
    Password: nonEmptyStr().nullish(),
    Timestamp: timestampField(),
    TransactionType: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v, ctx): string | null => {
        if (v === null || v === undefined) return null;
        let raw: string;
        try {
          raw = normalizeNonEmpty(v, 'TransactionType');
        } catch (e) {
          ctx.addIssue({ code: 'custom', message: (e as Error).message });
          return z.NEVER;
        }
        if (!STK_TRANSACTION_TYPES.has(raw)) {
          ctx.addIssue({ code: 'custom', message: 'TransactionType is not supported' });
          return z.NEVER;
        }
        return raw;
      }),
    Amount: decimalString('Amount'),
    PartyA: shortCodeStr,
    PartyB: shortCodeStr.nullish(),
    PhoneNumber: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v, ctx): string | null => {
        if (v === null || v === undefined) return null;
        try {
          return digitsImpl(v, 'PhoneNumber', 10, 15);
        } catch (e) {
          ctx.addIssue({ code: 'custom', message: (e as Error).message });
          return z.NEVER;
        }
      }),
    CallBackURL: httpUrl,
    AccountReference: nonEmptyStr(),
    TransactionDesc: nonEmptyStr().nullish(),
  })
  .strict()
  .refine((d) => d.BusinessShortCode || d.PartyB, {
    message: 'Either BusinessShortCode or PartyB must be provided',
  });

export const STKPushQueryRequest = z
  .object({
    BusinessShortCode: shortCodeStr.nullish(),
    Password: nonEmptyStr().nullish(),
    Timestamp: timestampField(),
    CheckoutRequestID: nonEmptyStr(),
  })
  .strict();

export const C2BSimulateRequest = z
  .object({
    ShortCode: shortCodeStr,
    CommandID: optionalCommandIdWithMembership(C2B_COMMAND_IDS),
    Amount: decimalString('Amount'),
    Msisdn: digitsString('Msisdn', 10, 15),
    BillRefNumber: nonEmptyStr().nullish(),
  })
  .strict();

export const C2BRegisterURLRequest = z
  .object({
    ShortCode: shortCodeStr,
    ResponseType: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v, ctx): string | null => {
        if (v === null || v === undefined) return null;
        let raw: string;
        try {
          raw = normalizeNonEmpty(v, 'ResponseType');
        } catch (e) {
          ctx.addIssue({ code: 'custom', message: (e as Error).message });
          return z.NEVER;
        }
        if (!['Completed', 'Cancelled'].includes(raw)) {
          ctx.addIssue({ code: 'custom', message: 'ResponseType must be Completed or Cancelled' });
          return z.NEVER;
        }
        return raw;
      }),
    ConfirmationURL: httpUrl,
    ValidationURL: httpUrl.nullish(),
  })
  .strict();

export const B2CRequest = z
  .object({
    InitiatorName: nonEmptyStr().nullish(),
    SecurityCredential: nonEmptyStr().nullish(),
    CommandID: optionalCommandIdWithMembership(B2C_COMMAND_IDS),
    Amount: decimalString('Amount'),
    PartyA: shortCodeStr,
    PartyB: digitsString('PartyB', 10, 15),
    Remarks: nonEmptyStr().nullish(),
    QueueTimeOutURL: httpUrl.nullish(),
    ResultURL: httpUrl,
    Occasion: nonEmptyStr().nullish(),
  })
  .strict();

export const B2BRequest = z
  .object({
    Initiator: nonEmptyStr().nullish(),
    SecurityCredential: nonEmptyStr().nullish(),
    CommandID: optionalCommandIdWithMembership(B2B_COMMAND_IDS),
    SenderIdentifierType: optionalIdentifierType('Identifier type is not supported'),
    RecieverIdentifierType: optionalIdentifierType('Identifier type is not supported'),
    Amount: decimalString('Amount'),
    PartyA: shortCodeStr,
    PartyB: shortCodeStr,
    AccountReference: nonEmptyStr().nullish(),
    Remarks: nonEmptyStr().nullish(),
    QueueTimeOutURL: httpUrl.nullish(),
    ResultURL: httpUrl,
  })
  .strict();

export const ReversalRequest = z
  .object({
    Initiator: nonEmptyStr().nullish(),
    SecurityCredential: nonEmptyStr().nullish(),
    CommandID: optionalCommandIdWithMembership(REVERSAL_COMMAND_IDS),
    TransactionID: nonEmptyStr(),
    Amount: decimalString('Amount'),
    ReceiverParty: shortCodeStr,
    ReceiverIdentifierType: optionalIdentifierType('ReceiverIdentifierType is not supported'),
    ResultURL: httpUrl,
    QueueTimeOutURL: httpUrl.nullish(),
    Remarks: nonEmptyStr().nullish(),
    Occasion: nonEmptyStr().nullish(),
  })
  .strict();

export const TransactionStatusRequest = z
  .object({
    Initiator: nonEmptyStr().nullish(),
    SecurityCredential: nonEmptyStr().nullish(),
    CommandID: optionalCommandIdWithMembership(TRANSACTION_STATUS_COMMAND_IDS),
    TransactionID: nonEmptyStr().nullish(),
    PartyA: shortCodeStr,
    IdentifierType: optionalIdentifierType('IdentifierType is not supported'),
    ResultURL: httpUrl,
    QueueTimeOutURL: httpUrl.nullish(),
    Remarks: nonEmptyStr().nullish(),
    Occasion: nonEmptyStr().nullish(),
  })
  .strict();

export const AccountBalanceRequest = z
  .object({
    Initiator: nonEmptyStr().nullish(),
    SecurityCredential: nonEmptyStr().nullish(),
    CommandID: optionalCommandIdWithMembership(ACCOUNT_BALANCE_COMMAND_IDS),
    PartyA: shortCodeStr,
    IdentifierType: optionalIdentifierType('IdentifierType is not supported'),
    Remarks: nonEmptyStr().nullish(),
    ResultURL: httpUrl,
    QueueTimeOutURL: httpUrl.nullish(),
  })
  .strict();

export const QRCodeRequest = z
  .object({
    MerchantName: nonEmptyStr(),
    MerchantShortCode: shortCodeStr.nullish(),
    RefNo: nonEmptyStr().nullish(),
    Amount: decimalString('Amount'),
    QRType: z.enum(['BUYGOODS', 'PAYBILL']).nullish(),
    TrxCode: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v, ctx): string | null => {
        if (v === null || v === undefined) return null;
        let raw: string;
        try {
          raw = normalizeNonEmpty(v, 'TrxCode').toUpperCase();
        } catch (e) {
          ctx.addIssue({ code: 'custom', message: (e as Error).message });
          return z.NEVER;
        }
        if (!QR_TRX_CODES.has(raw)) {
          ctx.addIssue({ code: 'custom', message: 'TrxCode is not supported' });
          return z.NEVER;
        }
        return raw;
      }),
    CPI: shortCodeStr.nullish(),
    Size: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v, ctx): string | null => {
        if (v === null || v === undefined) return null;
        const raw = String(v).trim();
        if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
          ctx.addIssue({ code: 'custom', message: 'Size must be a positive number' });
          return z.NEVER;
        }
        return raw;
      }),
  })
  .strict()
  .refine((d) => d.MerchantShortCode || d.CPI, {
    message: 'Either MerchantShortCode or CPI must be provided',
  });

export const TaxRemitRequest = z
  .object({
    Initiator: nonEmptyStr().nullish(),
    SecurityCredential: nonEmptyStr().nullish(),
    CommandID: optionalCommandIdWithMembership(TAX_REMIT_COMMAND_IDS),
    SenderIdentifierType: optionalIdentifierType('Identifier type is not supported'),
    RecieverIdentifierType: optionalIdentifierType('Identifier type is not supported'),
    Amount: decimalString('Amount'),
    PartyA: shortCodeStr,
    PartyB: shortCodeStr,
    AccountReference: nonEmptyStr().nullish(),
    Remarks: nonEmptyStr().nullish(),
    QueueTimeOutURL: httpUrl.nullish(),
    ResultURL: httpUrl,
  })
  .strict();

export const B2BExpressCheckoutRequest = z
  .object({
    primaryShortCode: shortCodeStr,
    receiverShortCode: shortCodeStr,
    amount: decimalString('amount'),
    paymentRef: nonEmptyStr(),
    callbackUrl: httpUrl,
    partnerName: nonEmptyStr(),
    RequestRefID: nonEmptyStr(),
  })
  .strict();

export const StandingOrderRequest = z
  .object({
    StandingOrderName: nonEmptyStr(),
    StartDate: z.union([z.string(), z.number()]).transform((v, ctx): string => {
      const raw = String(v).trim();
      if (Number.isNaN(parseDate8(raw))) {
        ctx.addIssue({ code: 'custom', message: 'Date must use YYYYMMDD format' });
        return z.NEVER;
      }
      return raw;
    }),
    EndDate: z.union([z.string(), z.number()]).transform((v, ctx): string => {
      const raw = String(v).trim();
      if (Number.isNaN(parseDate8(raw))) {
        ctx.addIssue({ code: 'custom', message: 'Date must use YYYYMMDD format' });
        return z.NEVER;
      }
      return raw;
    }),
    BusinessShortCode: shortCodeStr,
    TransactionType: z.union([z.string(), z.number()]).transform((v, ctx): string => {
      let raw: string;
      try {
        raw = normalizeNonEmpty(v, 'TransactionType');
      } catch (e) {
        ctx.addIssue({ code: 'custom', message: (e as Error).message });
        return z.NEVER;
      }
      const valid = ['Standing Order Customer Pay Bill', 'Standing Order Customer Pay Merchant'];
      if (!valid.includes(raw)) {
        ctx.addIssue({
          code: 'custom',
          message: 'TransactionType must be one of ' + [...valid].sort().join(', '),
        });
        return z.NEVER;
      }
      return raw;
    }),
    ReceiverPartyIdentifierType: z.union([z.string(), z.number()]).nullish().default('4'),
    Amount: decimalString('Amount'),
    PartyA: digitsString('PartyA', 10, 15),
    CallBackURL: httpUrl,
    AccountReference: nonEmptyStr(),
    TransactionDesc: nonEmptyStr().nullish(),
    Frequency: z.union([z.string(), z.number()]).transform((v, ctx): string => {
      const raw = String(v).trim();
      if (!STANDING_ORDER_FREQUENCIES.has(raw)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Frequency must be one of ' + [...STANDING_ORDER_FREQUENCIES].sort().join(', '),
        });
        return z.NEVER;
      }
      return raw;
    }),
  })
  .strict();

// Helper that wraps optionalCommandId with explicit membership set.
function optionalCommandIdWithMembership(allowed: Set<string>) {
  return optionalCommandId(allowed);
}

function digitsImpl(v: unknown, field: string, min: number, max: number): string {
  const raw = String(v).trim();
  if (!/^\d+$/.test(raw)) throw new Error(`${field} must contain digits only`);
  if (raw.length < min || raw.length > max) {
    throw new Error(`${field} must be between ${min} and ${max} digits`);
  }
  return raw;
}

export type STKPushBody = z.infer<typeof STKPushRequest>;
export type STKPushQueryBody = z.infer<typeof STKPushQueryRequest>;
export type C2BSimulateBody = z.infer<typeof C2BSimulateRequest>;
export type C2BRegisterURLBody = z.infer<typeof C2BRegisterURLRequest>;
export type B2CBody = z.infer<typeof B2CRequest>;
export type B2BBody = z.infer<typeof B2BRequest>;
export type ReversalBody = z.infer<typeof ReversalRequest>;
export type TransactionStatusBody = z.infer<typeof TransactionStatusRequest>;
export type AccountBalanceBody = z.infer<typeof AccountBalanceRequest>;
export type QRCodeBody = z.infer<typeof QRCodeRequest>;
export type TaxRemitBody = z.infer<typeof TaxRemitRequest>;
export type B2BExpressBody = z.infer<typeof B2BExpressCheckoutRequest>;
export type StandingOrderBody = z.infer<typeof StandingOrderRequest>;
