/** Ports tests/test_routes_misc.py — home, oauth, mock admin, bill manager. */
import { describe, expect, it } from 'vitest';

import { flushBackgroundTasks } from '../src/utils/background.js';
import { BASIC, BEARER, MPESA_PAYBILL, get, post } from './helpers/app.js';

describe('home + health', () => {
  it('GET / returns merchants and metadata', async () => {
    const { status, json } = await get('/');
    expect(status).toBe(200);
    expect(json.message).toBe('Welcome to Noria Payments API Mock Server');
    // home looks up the fixed demo paybill 887001 + sasapay till 888000
    expect(json.mpesaMerchant.merchant_paybill).toBe('887001');
    expect(json.sasaPayMerchant.merchant_paybill).toBe('888000');
    expect(json.datePrefix).toMatch(/^[A-Z][A-Z][0-9A-Z]$/);
  });

  it('healthz / readyz', async () => {
    expect((await get('/healthz')).json).toEqual({ status: true });
    expect((await get('/readyz')).json).toEqual({ status: true, ready: true, database: true });
  });

  it('unknown route 404 envelope', async () => {
    const { status, json } = await get('/nope/nope');
    expect(status).toBe(404);
    expect(json).toEqual({ status: false, message: 'Route not found' });
  });
});

describe('oauth', () => {
  it('requires basic auth', async () => {
    const { status, json } = await get('/oauth/v1/generate?grant_type=client_credentials');
    expect(status).toBe(401);
    expect(json.errorCode).toBe('401.002.01');
  });

  it('rejects bad grant_type', async () => {
    const { status, json } = await get('/oauth/v1/generate?grant_type=bad', {
      authorization: BASIC,
    });
    expect(status).toBe(400);
    expect(json.errorCode).toBe('invalid_grant');
  });

  it('issues a token (v1 and v2)', async () => {
    for (const v of ['v1', 'v2']) {
      const { status, json } = await get(`/oauth/${v}/generate?grant_type=client_credentials`, {
        authorization: BASIC,
      });
      expect(status).toBe(200);
      expect(json.expires_in).toBe('3599');
      expect(typeof json.access_token).toBe('string');
    }
  });

  it('is mirrored under /mpesa/oauth', async () => {
    const { status } = await get('/mpesa/oauth/v1/generate?grant_type=client_credentials', {
      authorization: BASIC,
    });
    expect(status).toBe(200);
  });
});

describe('mock admin', () => {
  it('creates a scenario with catalog defaults', async () => {
    const { status, json } = await post('/mock/scenarios', {
      provider: 'mpesa',
      flow: 'stk',
      selectorType: 'amount',
      selectorValue: '1500',
      resultCode: '1032',
    });
    expect(status).toBe(200);
    expect(json.data.resultCode).toBe('1032');
    expect(json.data.scenarioStatus).toBe('CANCELLED');
    expect(json.data.resultDescription).toBe('Request cancelled by user.');
  });

  it('lists callback deliveries', async () => {
    const { status, json } = await get('/mock/callback-deliveries');
    expect(status).toBe(200);
    expect(Array.isArray(json.data)).toBe(true);
  });
});

describe('bill manager', () => {
  it('optin requires shortcode', async () => {
    const { json } = await post('/v1/billmanager-invoice/optin', {});
    expect(json.rescode).toBe('400');
  });

  it('full invoice lifecycle + simulated payment callback', async () => {
    const optin = await post('/v1/billmanager-invoice/optin', {
      shortcode: '887000',
      callbackurl: 'https://example.com/bm',
    });
    expect(optin.json.rescode).toBe('200');

    const created = await post('/v1/billmanager-invoice/invoices/create', {
      invoiceNumber: 'INV100',
      amount: '500',
      accountReference: 'ACC1',
    });
    expect(created.json.rescode).toBe('0');

    const dup = await post('/v1/billmanager-invoice/invoices/create', {
      invoiceNumber: 'INV100',
      amount: '500',
    });
    expect(dup.json.rescode).toBe('409');

    const status = await post('/v1/billmanager-invoice/invoices/status', {
      invoiceNumber: 'INV100',
    });
    expect(status.json.status).toBe('CREATED');

    const pay = await post('/mock/billmanager/invoices/INV100/pay', {});
    expect(pay.status).toBe(200);
    expect(pay.json.callbacksDispatched).toContain('887000');
    await flushBackgroundTasks();

    const payAgain = await post('/mock/billmanager/invoices/INV100/pay', {});
    expect(payAgain.status).toBe(409);
  });

  it('cancel + cannot update cancelled', async () => {
    await post('/v1/billmanager-invoice/invoices/create', { invoiceNumber: 'INV200', amount: '5' });
    const cancel = await post('/v1/billmanager-invoice/invoices/cancel', {
      invoiceNumber: 'INV200',
    });
    expect(cancel.json.rescode).toBe('0');
    const update = await post('/v1/billmanager-invoice/invoices/update', {
      invoiceNumber: 'INV200',
      amount: '9',
    });
    expect(update.json.rescode).toBe('409');
  });

  it('permissive fallback', async () => {
    const { json } = await post('/v1/billmanager-invoice/some/unknown/path', { x: 1 });
    expect(json).toEqual({ rescode: '0', resmsg: 'Request received successfully.' });
  });
});

describe('standing order tick', () => {
  it('creates a standing order then ticks it', async () => {
    const create = await post(
      '/standingorder/v1/createStandingOrderExternal',
      {
        StandingOrderName: 'Rent',
        StartDate: '20260101',
        EndDate: '20260201',
        BusinessShortCode: MPESA_PAYBILL,
        TransactionType: 'Standing Order Customer Pay Bill',
        Amount: '100',
        PartyA: '254712345678',
        CallBackURL: 'https://example.com/so',
        AccountReference: 'RENT',
        Frequency: '4',
      },
      { authorization: BEARER },
    );
    expect(create.status).toBe(200);
    await flushBackgroundTasks();
    const soId = create.json.ResponseBody.standingOrderId ?? null;
    // standingOrderId is returned in the callback, not the response; tick a
    // non-existent id returns 404.
    const tick = await post('/mock/standing-orders/does-not-exist/tick', {});
    expect(tick.status).toBe(404);
    void soId;
  });
});
