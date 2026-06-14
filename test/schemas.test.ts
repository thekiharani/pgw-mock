/** Ports tests/test_schemas.py — direct Zod schema validation. */
import { describe, expect, it } from 'vitest';

import {
  B2BRequest,
  C2BSimulateRequest,
  STKPushRequest,
  StandingOrderRequest,
} from '../src/schemas/mpesa.js';
import { C2BRequest as SasaC2B } from '../src/schemas/sasapay.js';
import { BusinessOnboardingRequest, PersonalOnboardingRequest } from '../src/schemas/waas.js';

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
