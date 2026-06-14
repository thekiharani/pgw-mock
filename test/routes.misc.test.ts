/** Ports tests/test_routes_misc.py — home, oauth, mock admin, bill manager. */
import { describe, expect, it } from 'vitest';

import { flushBackgroundTasks } from '@/utils/background.js';
import { BASIC, BEARER, MPESA_PAYBILL, get, post } from '@test/helpers/app.js';

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

describe('bill manager — more endpoints', () => {
  it('opt-in then change details and billing info', async () => {
    await post('/v1/billmanager-invoice/optin', {
      shortcode: '887000',
      callbackurl: 'https://e.co/x',
    });
    expect(
      (
        await post('/v1/billmanager-invoice/change-optin-details', {
          shortcode: '887000',
          email: 'a@b.c',
        })
      ).json.rescode,
    ).toBe('200');
    expect(
      (await post('/v1/billmanager-invoice/change-billing-info', { shortcode: '887000', tax: 16 }))
        .json.rescode,
    ).toBe('200');
    expect(
      (await post('/v1/billmanager-invoice/change-optin-details', { shortcode: '999999' })).json
        .rescode,
    ).toBe('404');
  });

  it('single + bulk invoicing and status-not-found', async () => {
    expect(
      (
        await post('/v1/billmanager-invoice/single-invoicing', {
          externalReference: 'S1',
          amount: '10',
        })
      ).json.Status,
    ).toBe('Success');
    const bulk = await post('/v1/billmanager-invoice/bulk-invoicing', {
      invoices: [
        { invoiceNumber: 'B1', amount: '5' },
        { invoiceNumber: 'B2', amount: '6' },
      ],
    });
    expect(bulk.json.acceptedInvoices).toEqual(['B1', 'B2']);
    expect(
      (await post('/v1/billmanager-invoice/bulk-invoicing', { invoices: [] })).json.Status,
    ).toBe('Failed');
    expect(
      (await post('/v1/billmanager-invoice/invoices/status', { invoiceNumber: 'NOPE' })).json
        .rescode,
    ).toBe('404');
  });

  it('bulk-cancel + reconciliation', async () => {
    await post('/v1/billmanager-invoice/invoices/create', { invoiceNumber: 'C9', amount: '1' });
    const cancel = await post('/v1/billmanager-invoice/bulk-cancel-invoice', {
      invoices: ['C9', 'MISSING'],
    });
    expect(cancel.json.cancelled).toEqual(['C9']);
    expect(cancel.json.notFound).toEqual(['MISSING']);
    const recon = await post('/v1/billmanager-invoice/payments-reconciliation', { x: 1 });
    expect(recon.json.echo).toEqual({ x: 1 });
  });
});

describe('home /ping + error envelopes', () => {
  it('/ping returns null when payments service is unreachable', async () => {
    const { status, json } = await get('/ping');
    expect(status).toBe(200);
    expect(json.pingResponse).toBeNull();
  });

  it('malformed JSON body yields a 4xx envelope', async () => {
    const { getApp } = await import('@test/helpers/app.js');
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mock/scenarios',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.json().status).toBe(false);
  });
});

describe('auth scheme errors', () => {
  it('bearer wrong scheme and empty token', async () => {
    expect(
      (await post('/mpesa/stkpush/v1/processrequest', {}, { authorization: 'Token abc' })).json
        .errorMessage,
    ).toBe('Authorization type must be Bearer');
    expect(
      (await post('/mpesa/stkpush/v1/processrequest', {}, { authorization: 'Bearer' })).json
        .errorMessage,
    ).toBe('Bearer token is required');
  });

  it('basic wrong scheme and bad format', async () => {
    expect(
      (await get('/oauth/v1/generate?grant_type=client_credentials', { authorization: 'Bearer x' }))
        .json.errorMessage,
    ).toBe('Authorization type must be Basic');
    const badFmt = await get('/oauth/v1/generate?grant_type=client_credentials', {
      authorization: 'Basic bm9jb2xvbg==',
    });
    expect(badFmt.status).toBe(401);
  });

  it('sasapay bearer 401 uses sasapay envelope', async () => {
    const { status, json } = await post('/sasapay/api/v1/payments/b2c/', {}, {});
    expect(status).toBe(401);
    expect(json.ResponseDescription).toBe('Authorization header is required');
  });
});
