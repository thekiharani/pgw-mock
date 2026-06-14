/** SasaPay WaaS request schemas. Mirrors app/schemas/waas.py. */
import { z } from 'zod';

import {
  decimalString,
  digitsString,
  emailStrLike,
  httpUrl,
  nonEmptyStr,
  shortCodeStr,
} from '@/schemas/common.js';
import {
  VALID_BUSINESS_TYPE_IDS,
  VALID_COUNTRY_IDS,
  VALID_INDUSTRY_IDS,
  VALID_PRODUCT_IDS,
  VALID_SUB_INDUSTRY_IDS,
  VALID_SUB_REGION_IDS,
} from '@/utils/waasReferenceData.js';

/** Optional lookup-id field validated against a set; returns number|null. */
function lookupId(validIds: Set<number>, fieldName: string) {
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx): number | null => {
      if (v === null || v === undefined) return null;
      const raw = String(v).trim();
      const parsed = Number.parseInt(raw, 10);
      if (raw === '' || Number.isNaN(parsed) || String(parsed) !== raw.replace(/^\+/, '')) {
        // mirror int(str(value).strip()) — reject non-integers
        if (!/^[+-]?\d+$/.test(raw)) {
          ctx.addIssue({ code: 'custom', message: `${fieldName} must be a valid lookup id` });
          return z.NEVER;
        }
      }
      if (Number.isNaN(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${fieldName} must be a valid lookup id` });
        return z.NEVER;
      }
      if (!validIds.has(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${fieldName} is not a supported lookup id` });
        return z.NEVER;
      }
      return parsed;
    });
}

export const PersonalOnboardingRequest = z
  .object({
    merchantCode: shortCodeStr,
    firstName: nonEmptyStr(),
    middleName: nonEmptyStr().nullish(),
    lastName: nonEmptyStr(),
    mobileNumber: digitsString('mobileNumber', 10, 15),
    documentType: z.enum(['1', '2', '3']).nullish(),
    documentNumber: nonEmptyStr().nullish(),
    countryCode: nonEmptyStr().nullish(),
    callbackUrl: httpUrl.nullish(),
    email: emailStrLike.nullish(),
  })
  .strict();

export const PersonalConfirmationRequest = z
  .object({
    merchantCode: shortCodeStr,
    requestId: nonEmptyStr(),
    otp: digitsString('otp', 4, 4),
  })
  .strict();

export const PersonalKycRequest = z
  .object({
    merchantCode: shortCodeStr,
    customerMobileNumber: digitsString('customerMobileNumber', 10, 15),
    passportSizePhoto: nonEmptyStr().nullish(),
    documentImageFront: nonEmptyStr().nullish(),
    documentImageBack: nonEmptyStr().nullish(),
  })
  .strict();

const directorMobile = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx): string | null => {
    if (v === null || v === undefined) return null;
    const raw = String(v).trim();
    if (!/^\d+$/.test(raw)) {
      ctx.addIssue({ code: 'custom', message: 'mobileNumber must contain digits only' });
      return z.NEVER;
    }
    if (raw.length < 10 || raw.length > 15) {
      ctx.addIssue({ code: 'custom', message: 'mobileNumber must be between 10 and 15 digits' });
      return z.NEVER;
    }
    return raw;
  });

export const BusinessDirector = z
  .object({
    firstName: nonEmptyStr().nullish(),
    lastName: nonEmptyStr().nullish(),
    idNumber: nonEmptyStr().nullish(),
    mobileNumber: directorMobile,
    directorName: nonEmptyStr().nullish(),
    directorIdnumber: nonEmptyStr().nullish(),
    directorMobileNumber: directorMobile,
    directorKraPin: nonEmptyStr().nullish(),
    directorDocumentType: nonEmptyStr().nullish(),
    directorCountryCode: nonEmptyStr().nullish(),
  })
  .passthrough();

export const BusinessOnboardingRequest = z
  .object({
    merchantCode: shortCodeStr,
    businessName: nonEmptyStr(),
    mobileNumber: digitsString('mobileNumber', 10, 15),
    callbackUrl: httpUrl.nullish(),
    registrationNumber: nonEmptyStr().nullish(),
    kraPin: nonEmptyStr().nullish(),
    email: emailStrLike.nullish(),
    directors: z.array(BusinessDirector).nullish(),
    billNumber: nonEmptyStr().nullish(),
    description: nonEmptyStr().nullish(),
    productType: lookupId(VALID_PRODUCT_IDS, 'productType'),
    countryId: lookupId(VALID_COUNTRY_IDS, 'countryId'),
    subregionId: lookupId(VALID_SUB_REGION_IDS, 'subregionId'),
    industryId: lookupId(VALID_INDUSTRY_IDS, 'industryId'),
    subIndustryId: lookupId(VALID_SUB_INDUSTRY_IDS, 'subIndustryId'),
    bankId: z.union([nonEmptyStr(), z.number()]).nullish(),
    bankCode: z.union([nonEmptyStr(), z.number()]).nullish(),
    bankAccountNumber: nonEmptyStr().nullish(),
    businessTypeId: lookupId(VALID_BUSINESS_TYPE_IDS, 'businessTypeId'),
    referralCode: nonEmptyStr().nullish(),
    dealerNumber: nonEmptyStr().nullish(),
    purpose: nonEmptyStr().nullish(),
    natureOfBusiness: nonEmptyStr().nullish(),
    physicalAddress: nonEmptyStr().nullish(),
    estimatedMonthlyTransactionAmount: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v, ctx): string | null => {
        if (v === null || v === undefined) return null;
        try {
          return decimalImpl(v, 'estimatedMonthlyTransactionAmount', true);
        } catch (e) {
          ctx.addIssue({ code: 'custom', message: (e as Error).message });
          return z.NEVER;
        }
      }),
    estimatedMonthlyTransactionCount: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v, ctx): number | null => {
        if (v === null || v === undefined) return null;
        const raw = String(v).trim();
        if (!/^[+-]?\d+$/.test(raw)) {
          ctx.addIssue({
            code: 'custom',
            message: 'estimatedMonthlyTransactionCount must be a whole number',
          });
          return z.NEVER;
        }
        const count = Number.parseInt(raw, 10);
        if (count < 0) {
          ctx.addIssue({
            code: 'custom',
            message: 'estimatedMonthlyTransactionCount must be greater than or equal to 0',
          });
          return z.NEVER;
        }
        return count;
      }),
  })
  .strict();

export const BusinessConfirmationRequest = z
  .object({
    merchantCode: shortCodeStr,
    requestId: nonEmptyStr(),
    otp: digitsString('otp', 4, 4),
  })
  .strict();

export const BusinessDirectorKyc = z
  .object({
    directorKraPin: nonEmptyStr().nullish(),
    directorKraPinNumber: nonEmptyStr().nullish(),
    directorIdCardFront: nonEmptyStr().nullish(),
    directorIdCardBack: nonEmptyStr().nullish(),
    directorPassportPhoto: nonEmptyStr().nullish(),
  })
  .passthrough();

export const BusinessKycRequest = z
  .object({
    merchantCode: shortCodeStr,
    requestId: nonEmptyStr(),
    businessKraPin: nonEmptyStr().nullish(),
    businessRegistrationCertificate: nonEmptyStr().nullish(),
    boardResolution: nonEmptyStr().nullish(),
    cr12Document: nonEmptyStr().nullish(),
    proofOfAddressDocument: nonEmptyStr().nullish(),
    proofOfBankDocument: nonEmptyStr().nullish(),
    directorsKyc: z.array(BusinessDirectorKyc).nullish(),
    directorKraPinNumber: nonEmptyStr().nullish(),
    directorIdCardFront: nonEmptyStr().nullish(),
    directorIdCardBack: nonEmptyStr().nullish(),
    directorKraPin: nonEmptyStr().nullish(),
  })
  .strict();

function decimalImpl(v: unknown, field: string, allowZero: boolean): string {
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

void decimalString; // (kept import parity with common helpers)

export type PersonalOnboardingBody = z.infer<typeof PersonalOnboardingRequest>;
export type PersonalConfirmationBody = z.infer<typeof PersonalConfirmationRequest>;
export type PersonalKycBody = z.infer<typeof PersonalKycRequest>;
export type BusinessOnboardingBody = z.infer<typeof BusinessOnboardingRequest>;
export type BusinessConfirmationBody = z.infer<typeof BusinessConfirmationRequest>;
export type BusinessKycBody = z.infer<typeof BusinessKycRequest>;
