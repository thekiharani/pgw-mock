/** Ports tests/test_routes_sasapay.py (broad coverage). */
import { describe, expect, it } from 'vitest';

import { flushBackgroundTasks } from '@/utils/background.js';
import {
  BASIC,
  BEARER_SASAPAY,
  BROKE_SASAPAY_TILL,
  SASAPAY_TILL,
  get,
  post,
} from '@test/helpers/app.js';

const auth = { authorization: BEARER_SASAPAY };

describe('sasapay auth token', () => {
  it('issues a JWT bearer token', async () => {
    const { status, json } = await get(
      '/sasapay/api/v1/auth/token/?grant_type=client_credentials',
      {
        authorization: BASIC,
      },
    );
    expect(status).toBe(200);
    expect(json.token_type).toBe('Bearer');
    expect(json.access_token.split('.')).toHaveLength(3);
    expect(json.scope).toBe('merchants C2B B2B B2C');
  });

  it('requires basic auth', async () => {
    const { status } = await get('/sasapay/api/v1/auth/token/?grant_type=client_credentials');
    expect(status).toBe(401);
  });
});

describe('sasapay C2B', () => {
  const c2b = (over: Record<string, any> = {}) => ({
    MerchantCode: SASAPAY_TILL,
    NetworkCode: '1',
    PhoneNumber: '254712345678',
    Amount: '500',
    Currency: 'KES',
    AccountReference: 'INV1',
    CallBackURL: 'https://example.com/cb',
    ...over,
  });

  it('non-wallet success schedules gateway + ipn callbacks', async () => {
    const { status, json } = await post('/sasapay/api/v1/payments/request-payment/', c2b(), auth);
    expect(status).toBe(200);
    expect(json.detail).toBe('Success. Request accepted for processing');
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    expect(deliveries.some((d: any) => d.flow === 'c2b' && d.eventType === 'gateway')).toBe(true);
    expect(deliveries.some((d: any) => d.flow === 'c2b' && d.eventType === 'ipn')).toBe(true);
  });

  it('invalid merchant', async () => {
    const { status, json } = await post(
      '/sasapay/api/v1/payments/request-payment/',
      c2b({ MerchantCode: '777777' }),
      auth,
    );
    expect(status).toBe(400);
    expect(json.ResponseDescription).toBe('Invalid Merchant Account');
  });

  it('wallet flow issues OTP then process-payment succeeds', async () => {
    const req = await post(
      '/sasapay/api/v1/payments/request-payment/',
      c2b({ NetworkCode: '0' }),
      auth,
    );
    expect(req.json.detail).toBe('OTP sent. Share the code to complete transaction');
    const checkout = req.json.CheckoutRequestID;

    const bad = await post(
      '/sasapay/api/v1/payments/process-payment/',
      { MerchantCode: SASAPAY_TILL, CheckoutRequestID: checkout, VerificationCode: '9999' },
      auth,
    );
    expect(bad.status).toBe(400);
    expect(bad.json.ResponseDescription).toBe('Invalid verification code');

    const ok = await post(
      '/sasapay/api/v1/payments/process-payment/',
      { MerchantCode: SASAPAY_TILL, CheckoutRequestID: checkout, VerificationCode: '1234' },
      auth,
    );
    expect(ok.status).toBe(200);
    expect(ok.json.ResponseCode).toBe('0');
    await flushBackgroundTasks();

    const again = await post(
      '/sasapay/api/v1/payments/process-payment/',
      { MerchantCode: SASAPAY_TILL, CheckoutRequestID: checkout, VerificationCode: '1234' },
      auth,
    );
    expect(again.json.ResponseDescription).toBe('Checkout request has already been processed');
  });

  it('failure amount yields failed scenario', async () => {
    const { json } = await post(
      '/sasapay/api/v1/payments/request-payment/',
      c2b({ Amount: '11000' }),
      auth,
    );
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    const gw = deliveries.find((d: any) => d.flow === 'c2b' && d.eventType === 'gateway');
    expect(String(gw.payload.ResultCode)).toBe('400');
  });
});

describe('sasapay B2C / B2B / bulk', () => {
  it('b2c success', async () => {
    const { json } = await post(
      '/sasapay/api/v1/payments/b2c/',
      {
        MerchantCode: SASAPAY_TILL,
        Amount: '500',
        Currency: 'KES',
        MerchantTransactionReference: 'MTR1',
        ReceiverNumber: '254712345678',
        Channel: '63902',
        Reason: 'pay',
        CallBackURL: 'https://example.com/cb',
      },
      auth,
    );
    expect(json.ResponseCode).toBe('0');
    expect(json.B2CRequestID).toMatch(/^B2C/);
    await flushBackgroundTasks();
  });

  it('b2c insufficient funds on broke till', async () => {
    const { status, json } = await post(
      '/sasapay/api/v1/payments/b2c/',
      {
        MerchantCode: BROKE_SASAPAY_TILL,
        Amount: '500',
        Currency: 'KES',
        MerchantTransactionReference: 'MTR2',
        ReceiverNumber: '254712345678',
        Channel: '63902',
        Reason: 'pay',
        CallBackURL: 'https://example.com/cb',
      },
      auth,
    );
    expect(status).toBe(400);
    expect(json.ResponseDescription).toBe('Insufficient Funds');
  });

  it('b2b success', async () => {
    const { json } = await post(
      '/sasapay/api/v1/payments/b2b/',
      {
        MerchantCode: SASAPAY_TILL,
        MerchantTransactionReference: 'MTR3',
        Currency: 'KES',
        Amount: '500',
        ReceiverMerchantCode: '600000',
        ReceiverAccountType: 'PAYBILL',
        NetworkCode: '0',
        Reason: 'b2b',
        CallBackURL: 'https://example.com/cb',
      },
      auth,
    );
    expect(json.ResponseCode).toBe('0');
    expect(json.B2BRequestID).toMatch(/^B2B/);
    await flushBackgroundTasks();
  });

  it('bulk success and insufficient', async () => {
    const ok = await post(
      '/sasapay/api/v1/payments/bulk/',
      {
        MerchantCode: SASAPAY_TILL,
        MerchantTransactionReference: 'BULK1',
        Currency: 'KES',
        CallBackURL: 'https://example.com/cb',
        Recipients: [
          { receiverNumber: '254712345678', amount: '100', channel: '63902' },
          { receiverNumber: '254712345679', amount: '200', channel: '63902' },
        ],
      },
      auth,
    );
    expect(ok.json.ResponseCode).toBe('0');
    expect(ok.json.RecipientCount).toBe(2);
    await flushBackgroundTasks();

    const broke = await post(
      '/sasapay/api/v1/payments/bulk/',
      {
        MerchantCode: BROKE_SASAPAY_TILL,
        MerchantTransactionReference: 'BULK2',
        Currency: 'KES',
        CallBackURL: 'https://example.com/cb',
        Recipients: [{ receiverNumber: '254712345678', amount: '100', channel: '63902' }],
      },
      auth,
    );
    expect(broke.status).toBe(400);
    expect(broke.json.ResponseDescription).toBe('Insufficient Funds');
  });
});

describe('sasapay status / channels / account verify', () => {
  it('transaction status after a c2b', async () => {
    await post(
      '/sasapay/api/v1/payments/request-payment/',
      {
        MerchantCode: SASAPAY_TILL,
        NetworkCode: '1',
        PhoneNumber: '254712345678',
        Amount: '500',
        Currency: 'KES',
        AccountReference: 'STAT1',
        CallBackURL: 'https://example.com/cb',
      },
      auth,
    );
    await flushBackgroundTasks();
    const { status, json } = await post(
      '/sasapay/api/v1/transactions/status-query/',
      { MerchantCode: SASAPAY_TILL, MerchantTransactionReference: 'STAT1' },
      auth,
    );
    expect(status).toBe(200);
    expect(json.data.MerchantReference).toBe('STAT1');
  });

  it('transaction status not found', async () => {
    const { status, json } = await post(
      '/sasapay/api/v1/transactions/status/',
      { MerchantCode: SASAPAY_TILL, TransactionCode: 'NOPE' },
      auth,
    );
    expect(status).toBe(400);
    expect(json.message).toBe('Transaction does not exist');
  });

  it('channels list', async () => {
    const { json } = await get('/sasapay/api/v1/channels/', auth);
    expect(json.responseCode).toBe('0');
    expect(json.data[0]).toEqual({ channelCode: '00', channelName: 'SasaPay' });
  });

  it('account verify', async () => {
    const { json } = await post(
      '/sasapay/api/v1/accounts/verify/',
      { MerchantCode: SASAPAY_TILL, AccountNumber: '12345678', Channel: '63902' },
      auth,
    );
    expect(json.responseCode).toBe('0');
    expect(json.data.accountStatus).toBe('ACTIVE');
    expect(json.data.channel).toBe('MPESA');
  });
});
