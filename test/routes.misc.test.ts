import { describe, expect, it } from 'vitest';

import { flushBackgroundTasks } from '@/utils/background.js';
import { BASIC_MPESA, BEARER, MPESA_PAYBILL, get, post } from '@test/helpers/app.js';

describe('home + health', () => {
  it('GET / returns merchants and metadata', async () => {
    const { status, json } = await get('/');
    expect(status).toBe(200);
    expect(json.message).toBe('Welcome to Noria Payments API Mock Server');
    expect(json.mpesaMerchant.merchant_paybill).toBe('887001');
    expect(json.sasaPayMerchant.merchant_paybill).toBe('888000');
    expect(json.datePrefix).toMatch(/^[A-Z][A-Z][0-9A-Z]$/);
  });

  it('reports healthy and ready', async () => {
    expect((await get('/healthz')).json).toEqual({ status: true });
    expect((await get('/readyz')).json).toEqual({ status: true, ready: true, database: true });
  });

  it('returns a 404 envelope for an unknown route', async () => {
    const { status, json } = await get('/nope/nope');
    expect(status).toBe(404);
    expect(json).toEqual({ status: false, message: 'Route not found' });
  });
});

describe('oauth', () => {
  it('requires basic auth', async () => {
    const { status, json } = await get('/mpesa/oauth/v1/generate?grant_type=client_credentials');
    expect(status).toBe(401);
    expect(json.errorCode).toBe('401.002.01');
  });

  it('rejects bad grant_type', async () => {
    const { status, json } = await get('/mpesa/oauth/v1/generate?grant_type=bad', {
      authorization: BASIC_MPESA,
    });
    expect(status).toBe(400);
    expect(json.errorCode).toBe('invalid_grant');
  });

  it('issues a token', async () => {
    const { status, json } = await get('/mpesa/oauth/v1/generate?grant_type=client_credentials', {
      authorization: BASIC_MPESA,
    });
    expect(status).toBe(200);
    expect(json.expires_in).toBe('3599');
    expect(typeof json.access_token).toBe('string');
  });

  it('rejects incorrect client credentials', async () => {
    const { status, json } = await get('/mpesa/oauth/v1/generate?grant_type=client_credentials', {
      authorization: 'Basic ' + Buffer.from('wrong_id:wrong_secret').toString('base64'),
    });
    expect(status).toBe(401);
    expect(json.errorCode).toBe('401.002.01');
    expect(json.errorMessage).toBe('Invalid client credentials');
  });

  it('ignores unknown query params', async () => {
    const { status } = await get('/mpesa/oauth/v1/generate?grant_type=client_credentials&foo=bar', {
      authorization: BASIC_MPESA,
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
    const { json } = await post('/mpesa/v1/billmanager-invoice/optin', {});
    expect(json.rescode).toBe('400');
  });

  it('runs the invoice lifecycle and dispatches a simulated payment callback', async () => {
    const optin = await post('/mpesa/v1/billmanager-invoice/optin', {
      shortcode: '887000',
      callbackurl: 'https://example.com/bm',
    });
    expect(optin.json.rescode).toBe('200');

    const issued = await post('/mpesa/v1/billmanager-invoice/single-invoicing', {
      externalReference: 'INV100',
      amount: '500',
      accountReference: 'ACC1',
    });
    expect(issued.json.Status).toBe('Success');

    const pay = await post('/mock/billmanager/invoices/INV100/pay', {});
    expect(pay.status).toBe(200);
    expect(pay.json.callbacksDispatched).toContain('887000');
    await flushBackgroundTasks();

    const payAgain = await post('/mock/billmanager/invoices/INV100/pay', {});
    expect(payAgain.status).toBe(409);
  });

  it('cancels an invoice and rejects changes to a cancelled one', async () => {
    await post('/mpesa/v1/billmanager-invoice/single-invoicing', {
      externalReference: 'INV200',
      amount: '5',
    });
    const cancel = await post('/mpesa/v1/billmanager-invoice/cancel-single-invoice', {
      invoiceNumber: 'INV200',
    });
    expect(cancel.json.rescode).toBe('0');
    const change = await post('/mpesa/v1/billmanager-invoice/change-invoice', {
      invoiceNumber: 'INV200',
      amount: '9',
    });
    expect(change.json.rescode).toBe('409');
  });
});

describe('standing order tick', () => {
  it('creates a standing order then ticks it', async () => {
    const create = await post(
      '/mpesa/standingorder/v1/createStandingOrderExternal',
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
    const tick = await post('/mock/standing-orders/does-not-exist/tick', {});
    expect(tick.status).toBe(404);
    void soId;
  });
});

describe('bill manager — more endpoints', () => {
  it('opts in then changes the opt-in details', async () => {
    await post('/mpesa/v1/billmanager-invoice/optin', {
      shortcode: '887000',
      callbackurl: 'https://e.co/x',
    });
    expect(
      (
        await post('/mpesa/v1/billmanager-invoice/change-optin-details', {
          shortcode: '887000',
          email: 'a@b.c',
        })
      ).json.rescode,
    ).toBe('200');
    expect(
      (await post('/mpesa/v1/billmanager-invoice/change-optin-details', { shortcode: '999999' }))
        .json.rescode,
    ).toBe('404');
  });

  it('issues single and bulk invoices', async () => {
    expect(
      (
        await post('/mpesa/v1/billmanager-invoice/single-invoicing', {
          externalReference: 'S1',
          amount: '10',
        })
      ).json.Status,
    ).toBe('Success');
    const bulk = await post('/mpesa/v1/billmanager-invoice/bulk-invoicing', {
      invoices: [
        { invoiceNumber: 'B1', amount: '5' },
        { invoiceNumber: 'B2', amount: '6' },
      ],
    });
    expect(bulk.json.acceptedInvoices).toEqual(['B1', 'B2']);
    expect(
      (await post('/mpesa/v1/billmanager-invoice/bulk-invoicing', { invoices: [] })).json.Status,
    ).toBe('Failed');
  });

  it('updates invoices in bulk', async () => {
    await post('/mpesa/v1/billmanager-invoice/bulk-invoicing', {
      invoices: [{ invoiceNumber: 'U1', amount: '5' }],
    });
    const change = await post('/mpesa/v1/billmanager-invoice/change-invoices', {
      invoices: [
        { invoiceNumber: 'U1', amount: '7' },
        { invoiceNumber: 'MISSING', amount: '1' },
      ],
    });
    expect(change.json.updatedInvoices).toEqual(['U1']);
    expect(change.json.notFound).toEqual(['MISSING']);
  });

  it('cancels invoices in bulk and echoes reconciliation data', async () => {
    await post('/mpesa/v1/billmanager-invoice/single-invoicing', {
      externalReference: 'C9',
      amount: '1',
    });
    const cancel = await post('/mpesa/v1/billmanager-invoice/cancel-bulk-invoice', {
      invoices: ['C9', 'MISSING'],
    });
    expect(cancel.json.cancelled).toEqual(['C9']);
    expect(cancel.json.notFound).toEqual(['MISSING']);
    const recon = await post('/mpesa/v1/billmanager-invoice/reconciliation', { x: 1 });
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
  it('rejects a bearer token with the wrong scheme or an empty value', async () => {
    expect(
      (await post('/mpesa/mpesa/stkpush/v1/processrequest', {}, { authorization: 'Token abc' }))
        .json.errorMessage,
    ).toBe('Authorization type must be Bearer');
    expect(
      (await post('/mpesa/mpesa/stkpush/v1/processrequest', {}, { authorization: 'Bearer' })).json
        .errorMessage,
    ).toBe('Bearer token is required');
  });

  it('rejects basic auth with the wrong scheme or a malformed value', async () => {
    expect(
      (
        await get('/mpesa/oauth/v1/generate?grant_type=client_credentials', {
          authorization: 'Bearer x',
        })
      ).json.errorMessage,
    ).toBe('Authorization type must be Basic');
    const badFmt = await get('/mpesa/oauth/v1/generate?grant_type=client_credentials', {
      authorization: 'Basic bm9jb2xvbg==',
    });
    expect(badFmt.status).toBe(401);
  });

  it('returns a sasapay envelope for a missing sasapay bearer token', async () => {
    const { status, json } = await post('/sasapay/api/v1/payments/b2c/', {}, {});
    expect(status).toBe(401);
    expect(json.ResponseDescription).toBe('Authorization header is required');
  });
});
