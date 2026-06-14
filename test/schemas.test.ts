/** Ports tests/test_schemas.py — direct Zod schema validation. */
import { describe, expect, it } from 'vitest';

import {
  B2BRequest,
  C2BSimulateRequest,
  STKPushRequest,
  StandingOrderRequest,
} from '@/schemas/mpesa.js';
import { C2BRequest as SasaC2B } from '@/schemas/sasapay.js';
import {
  BusinessKycRequest,
  BusinessOnboardingRequest,
  PersonalConfirmationRequest,
  PersonalOnboardingRequest,
} from '@/schemas/waas.js';

describe('STKPushRequest', () => {
  it('normalizes amount and accepts valid payload', () => {
    const r = STKPushRequest.safeParse({
      BusinessShortCode: '887000',
      Amount: '1500.00',
      PartyA: '254712345678',
      CallBackURL: 'https://example.com/cb',
      AccountReference: 'ORDER1',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.Amount).toBe('1500');
  });

  it('rejects unknown fields (strict)', () => {
    const r = STKPushRequest.safeParse({
      PartyA: '887000',
      Amount: '10',
      CallBackURL: 'https://x.io',
      AccountReference: 'A',
      BusinessShortCode: '887000',
      Bogus: 1,
    });
    expect(r.success).toBe(false);
  });

  it('requires BusinessShortCode or PartyB', () => {
    const r = STKPushRequest.safeParse({
      Amount: '10',
      PartyA: '254712345678',
      CallBackURL: 'https://x.io',
      AccountReference: 'A',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid timestamp', () => {
    const r = STKPushRequest.safeParse({
      BusinessShortCode: '887000',
      Timestamp: 'nope',
      Amount: '10',
      PartyA: '254712345678',
      CallBackURL: 'https://x.io',
      AccountReference: 'A',
    });
    expect(r.success).toBe(false);
  });
});

describe('C2BSimulateRequest', () => {
  it('rejects unsupported CommandID', () => {
    const r = C2BSimulateRequest.safeParse({
      ShortCode: '886000',
      CommandID: 'Nope',
      Amount: '10',
      Msisdn: '254712345678',
    });
    expect(r.success).toBe(false);
  });
  it('normalizes msisdn-only digits', () => {
    const r = C2BSimulateRequest.safeParse({
      ShortCode: '886000',
      Amount: '10',
      Msisdn: 'abc',
    });
    expect(r.success).toBe(false);
  });
});

describe('B2BRequest identifier types', () => {
  it('accepts 1/2/4 and rejects others', () => {
    const base = {
      Amount: '10',
      PartyA: '887000',
      PartyB: '886000',
      ResultURL: 'https://x.io',
    };
    expect(B2BRequest.safeParse({ ...base, SenderIdentifierType: '4' }).success).toBe(true);
    expect(B2BRequest.safeParse({ ...base, SenderIdentifierType: '9' }).success).toBe(false);
  });
});

describe('StandingOrderRequest', () => {
  it('validates frequency and dates', () => {
    const base = {
      StandingOrderName: 'SO',
      StartDate: '20260101',
      EndDate: '20260201',
      BusinessShortCode: '887000',
      TransactionType: 'Standing Order Customer Pay Bill',
      Amount: '100',
      PartyA: '254712345678',
      CallBackURL: 'https://x.io',
      AccountReference: 'A',
      Frequency: '2',
    };
    expect(StandingOrderRequest.safeParse(base).success).toBe(true);
    expect(StandingOrderRequest.safeParse({ ...base, Frequency: '9' }).success).toBe(false);
    expect(StandingOrderRequest.safeParse({ ...base, StartDate: '2026-01-01' }).success).toBe(
      false,
    );
  });
});

describe('SasaPay C2BRequest', () => {
  it('accepts optional zero transaction fee', () => {
    const r = SasaC2B.safeParse({
      MerchantCode: '888000',
      NetworkCode: '1',
      PhoneNumber: '254712345678',
      Amount: '500',
      Currency: 'KES',
      AccountReference: 'INV1',
      CallBackURL: 'https://x.io',
      TransactionFee: '0',
    });
    expect(r.success).toBe(true);
  });
  it('rejects non-3-letter currency', () => {
    const r = SasaC2B.safeParse({
      MerchantCode: '888000',
      NetworkCode: '1',
      PhoneNumber: '254712345678',
      Amount: '500',
      Currency: 'KENYA',
      AccountReference: 'INV1',
      CallBackURL: 'https://x.io',
    });
    expect(r.success).toBe(false);
  });
});

describe('WaaS onboarding', () => {
  it('personal onboarding accepts minimal payload', () => {
    const r = PersonalOnboardingRequest.safeParse({
      merchantCode: '888000',
      firstName: 'Jane',
      lastName: 'Doe',
      mobileNumber: '254712345678',
    });
    expect(r.success).toBe(true);
  });
  it('business onboarding rejects bad lookup id', () => {
    const r = BusinessOnboardingRequest.safeParse({
      merchantCode: '888000',
      businessName: 'Acme',
      mobileNumber: '254712345678',
      businessTypeId: 999,
    });
    expect(r.success).toBe(false);
  });
  it('business onboarding accepts valid lookup ids', () => {
    const r = BusinessOnboardingRequest.safeParse({
      merchantCode: '888000',
      businessName: 'Acme',
      mobileNumber: '254712345678',
      businessTypeId: 3,
      countryId: 1,
      industryId: 62,
    });
    expect(r.success).toBe(true);
  });
});

describe('WaaS schema branches', () => {
  const baseBiz = {
    merchantCode: '888000',
    businessName: 'Acme',
    mobileNumber: '254712345678',
  };

  it('rejects each invalid lookup id', () => {
    for (const field of [
      'productType',
      'countryId',
      'subregionId',
      'industryId',
      'subIndustryId',
    ]) {
      expect(BusinessOnboardingRequest.safeParse({ ...baseBiz, [field]: 99999 }).success).toBe(
        false,
      );
    }
  });

  it('rejects non-integer lookup id', () => {
    expect(BusinessOnboardingRequest.safeParse({ ...baseBiz, countryId: 'abc' }).success).toBe(
      false,
    );
  });

  it('accepts string lookup ids and full valid set', () => {
    const r = BusinessOnboardingRequest.safeParse({
      ...baseBiz,
      productType: '1',
      countryId: '1',
      subregionId: '101',
      industryId: '62',
      subIndustryId: '6201',
      businessTypeId: '3',
      bankId: 5,
      bankCode: '01',
      bankAccountNumber: '123',
      estimatedMonthlyTransactionAmount: '1000.50',
      estimatedMonthlyTransactionCount: '40',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.estimatedMonthlyTransactionAmount).toBe('1000.5');
  });

  it('rejects negative estimated amount/count and bad count', () => {
    expect(
      BusinessOnboardingRequest.safeParse({ ...baseBiz, estimatedMonthlyTransactionAmount: '-1' })
        .success,
    ).toBe(false);
    expect(
      BusinessOnboardingRequest.safeParse({ ...baseBiz, estimatedMonthlyTransactionCount: '-1' })
        .success,
    ).toBe(false);
    expect(
      BusinessOnboardingRequest.safeParse({ ...baseBiz, estimatedMonthlyTransactionCount: '1.5' })
        .success,
    ).toBe(false);
  });

  it('validates director mobile numbers and passthrough extras', () => {
    const ok = BusinessOnboardingRequest.safeParse({
      ...baseBiz,
      directors: [{ firstName: 'A', mobileNumber: '254712345678', extraField: 'kept' }],
    });
    expect(ok.success).toBe(true);
    const bad = BusinessOnboardingRequest.safeParse({
      ...baseBiz,
      directors: [{ mobileNumber: 'abc' }],
    });
    expect(bad.success).toBe(false);
  });

  it('personal confirmation requires 4-digit otp', () => {
    expect(
      PersonalConfirmationRequest.safeParse({ merchantCode: '888000', requestId: 'r', otp: '12' })
        .success,
    ).toBe(false);
    expect(
      PersonalConfirmationRequest.safeParse({ merchantCode: '888000', requestId: 'r', otp: 1234 })
        .success,
    ).toBe(true);
  });

  it('business kyc accepts directorsKyc passthrough and rejects unknown top-level field', () => {
    expect(
      BusinessKycRequest.safeParse({
        merchantCode: '888000',
        requestId: 'r',
        directorsKyc: [{ directorKraPin: 'x', extra: 1 }],
      }).success,
    ).toBe(true);
    expect(
      BusinessKycRequest.safeParse({ merchantCode: '888000', requestId: 'r', bogus: 1 }).success,
    ).toBe(false);
  });

  it('personal onboarding rejects bad email and unknown field', () => {
    expect(
      PersonalOnboardingRequest.safeParse({
        merchantCode: '888000',
        firstName: 'J',
        lastName: 'D',
        mobileNumber: '254712345678',
        email: 'not-an-email',
      }).success,
    ).toBe(false);
  });
});
