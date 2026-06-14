/** Ports tests/test_routes_mpesa.py (broad behavioral coverage). */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '../src/db/client.js';
import { merchants } from '../src/db/schema.js';
import { flushBackgroundTasks } from '../src/utils/background.js';
import {
  BEARER,
  BROKE_MPESA_PAYBILL,
  MPESA_COLLECTION_PAYBILL,
  MPESA_DISBURSEMENT_PAYBILL,
  MPESA_PAYBILL,
  MPESA_TILL,
  get,
  post,
} from './helpers/app.js';

const auth = { authorization: BEARER };

async function balanceOf(paybill: string): Promise<number> {
  const rows = await db
    .select({ bal: merchants.mpesaBalance })
    .from(merchants)
    .where(eq(merchants.mpesaPaybillNumber, paybill));
  return Number(rows[0]!.bal);
}

const stkBody = (over: Record<string, any> = {}) => ({
  BusinessShortCode: MPESA_PAYBILL,
  Password: 'pw',
  Timestamp: '20260101120000',
  TransactionType: 'CustomerPayBillOnline',
  Amount: '1500',
  PartyA: '254712345678',
  PhoneNumber: '254712345678',
  CallBackURL: 'https://example.com/cb',
  AccountReference: 'ORDER1',
  ...over,
});

describe('STK push', () => {
  it('success', async () => {
    const { status, json } = await post('/mpesa/stkpush/v1/processrequest', stkBody(), auth);
    expect(status).toBe(200);
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
  });

  it('strict missing fields', async () => {
    const { status, json } = await post(
      '/mpesa/stkpush/v1/processrequest',
      stkBody({ Password: undefined, Timestamp: undefined }),
      auth,
    );
    expect(status).toBe(400);
    expect(json.ResponseDescription).toContain('Missing required fields');
  });

  it('invalid merchant paybill', async () => {
    const { status, json } = await post(
      '/mpesa/stkpush/v1/processrequest',
      stkBody({ BusinessShortCode: '999999', PartyA: '999999' }),
      auth,
    );
    expect(status).toBe(400);
    expect(json.ResponseDescription).toBe('Invalid Merchant Paybill');
  });

  it('amount-based failure scenario', async () => {
    const { json } = await post('/mpesa/stkpush/v1/processrequest', stkBody({ Amount: '1' }), auth);
    expect(json.ResponseCode).toBe('0'); // request accepted; failure surfaces in callback
    await flushBackgroundTasks();
    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    const stk = deliveries.find((d: any) => d.eventType === 'stk_callback');
    expect(stk.payload.Body.stkCallback.ResultCode).toBe(1);
  });

  it('header override scenario', async () => {
    await post('/mpesa/stkpush/v1/processrequest', stkBody(), {
      ...auth,
      'x-mock-result-code': '1032',
    });
    await flushBackgroundTasks();
    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    const stk = deliveries.find((d: any) => d.eventType === 'stk_callback');
    expect(stk.payload.Body.stkCallback.ResultCode).toBe(1032);
  });

  it('persisted scenario override', async () => {
    await post('/mock/scenarios', {
      provider: 'mpesa',
      flow: 'stk',
      selectorType: 'reference',
      selectorValue: 'FAILME',
      resultCode: '17',
    });
    await post('/mpesa/stkpush/v1/processrequest', stkBody({ AccountReference: 'FAILME' }), auth);
    await flushBackgroundTasks();
    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    const stk = deliveries.find((d: any) => d.eventType === 'stk_callback');
    expect(stk.payload.Body.stkCallback.ResultCode).toBe(17);
  });

  it('debits merchant balance on success', async () => {
    const before = await balanceOf(MPESA_PAYBILL);
    await post('/mpesa/stkpush/v1/processrequest', stkBody({ Amount: '2000' }), auth);
    await flushBackgroundTasks();
    expect(await balanceOf(MPESA_PAYBILL)).toBe(before + 2000);
  });
});

describe('STK push query', () => {
  it('not found returns processing', async () => {
    const { status, json } = await post(
      '/mpesa/stkpushquery/v1/query',
      {
        BusinessShortCode: MPESA_PAYBILL,
        Password: 'pw',
        Timestamp: '20260101120000',
        CheckoutRequestID: 'ws_CO_x',
      },
      auth,
    );
    expect(status).toBe(400);
    expect(json.ResultCode).toBe('1');
  });

  it('found after stk push', async () => {
    const stk = await post('/mpesa/stkpush/v1/processrequest', stkBody(), auth);
    await flushBackgroundTasks();
    const { status, json } = await post(
      '/mpesa/stkpushquery/v1/query',
      {
        BusinessShortCode: MPESA_PAYBILL,
        Password: 'pw',
        Timestamp: '20260101120000',
        CheckoutRequestID: stk.json.CheckoutRequestID,
      },
      auth,
    );
    expect(status).toBe(200);
    expect(json.ResponseCode).toBe('0');
  });
});

describe('C2B', () => {
  it('register url then simulate', async () => {
    const reg = await post(
      '/mpesa/c2b/v1/registerurl',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        ResponseType: 'Completed',
        ConfirmationURL: 'https://example.com/conf',
        ValidationURL: 'https://example.com/val',
      },
      auth,
    );
    expect(reg.json.ResponseCode).toBe('0');

    const again = await post(
      '/mpesa/c2b/v1/registerurl',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        ResponseType: 'Completed',
        ConfirmationURL: 'https://example.com/conf',
      },
      auth,
    );
    expect(again.json.ResponseDescription).toBe('C2B URLs are already registered');

    const sim = await post(
      '/mpesa/c2b/v2/simulate',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        CommandID: 'CustomerPayBillOnline',
        Amount: '100',
        Msisdn: '254712345678',
        BillRefNumber: 'R1',
      },
      auth,
    );
    expect(sim.json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
  });

  it('register url rejects non-https', async () => {
    const { json } = await post(
      '/mpesa/c2b/v1/registerurl',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        ResponseType: 'Completed',
        ConfirmationURL: 'http://insecure.com',
      },
      auth,
    );
    expect(json.ResponseDescription).toBe('ConfirmationURL and ValidationURL must use HTTPS');
  });

  it('simulate requires CommandID under strict', async () => {
    const { json } = await post(
      '/mpesa/c2b/v2/simulate',
      { ShortCode: MPESA_COLLECTION_PAYBILL, Amount: '100', Msisdn: '254712345678' },
      auth,
    );
    expect(json.ResponseDescription).toBe('CommandID is required');
  });

  it('buy goods command rejected on paybill kind', async () => {
    const { status, json } = await post(
      '/mpesa/c2b/v2/simulate',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        CommandID: 'CustomerBuyGoodsOnline',
        Amount: '100',
        Msisdn: '254712345678',
      },
      auth,
    );
    expect(status).toBe(400);
    expect(json.errorMessage).toContain('not valid for PAYBILL');
  });
});

describe('B2C / B2B / tax remit', () => {
  it('b2c success debits balance', async () => {
    const before = await balanceOf(MPESA_DISBURSEMENT_PAYBILL);
    const { status, json } = await post(
      '/mpesa/b2c/v1/paymentrequest',
      {
        InitiatorName: 'init',
        SecurityCredential: 'sec',
        CommandID: 'BusinessPayment',
        Amount: '500',
        PartyA: MPESA_DISBURSEMENT_PAYBILL,
        PartyB: '254712345678',
        Remarks: 'salary',
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    expect(status).toBe(200);
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
    expect(await balanceOf(MPESA_DISBURSEMENT_PAYBILL)).toBe(before - 500);
  });

  it('b2c insufficient funds on broke merchant', async () => {
    const { status, json } = await post(
      '/mpesa/b2c/v1/paymentrequest',
      {
        InitiatorName: 'init',
        SecurityCredential: 'sec',
        CommandID: 'BusinessPayment',
        Amount: '500',
        PartyA: BROKE_MPESA_PAYBILL,
        PartyB: '254712345678',
        Remarks: 'salary',
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    expect(status).toBe(400);
    expect(json.ResponseDescription).toBe('Insufficient funds');
  });

  it('b2b success', async () => {
    const { json } = await post(
      '/mpesa/b2b/v1/paymentrequest',
      {
        Initiator: 'init',
        SecurityCredential: 'sec',
        CommandID: 'BusinessPayBill',
        SenderIdentifierType: '4',
        RecieverIdentifierType: '4',
        AccountReference: 'AR1',
        Amount: '500',
        PartyA: MPESA_DISBURSEMENT_PAYBILL,
        PartyB: MPESA_COLLECTION_PAYBILL,
        Remarks: 'b2b',
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
  });

  it('tax remit success', async () => {
    const { json } = await post(
      '/mpesa/b2b/v1/remittax',
      {
        Initiator: 'init',
        SecurityCredential: 'sec',
        CommandID: 'PayTaxToKRA',
        SenderIdentifierType: '4',
        RecieverIdentifierType: '4',
        Amount: '500',
        PartyA: MPESA_DISBURSEMENT_PAYBILL,
        PartyB: MPESA_COLLECTION_PAYBILL,
        Remarks: 'tax',
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
  });
});

describe('reversal', () => {
  it('original not found', async () => {
    const { status, json } = await post(
      '/mpesa/reversal/v1/request',
      {
        Initiator: 'init',
        SecurityCredential: 'sec',
        CommandID: 'TransactionReversal',
        ReceiverIdentifierType: '4',
        Remarks: 'rev',
        TransactionID: 'NOPE',
        Amount: '100',
        ReceiverParty: MPESA_DISBURSEMENT_PAYBILL,
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    expect(status).toBe(400);
    expect(json.ResponseDescription).toBe('Original transaction not found');
  });

  it('reverses a b2c then blocks double reversal', async () => {
    const b2c = await post(
      '/mpesa/b2c/v1/paymentrequest',
      {
        InitiatorName: 'init',
        SecurityCredential: 'sec',
        CommandID: 'BusinessPayment',
        Amount: '300',
        PartyA: MPESA_DISBURSEMENT_PAYBILL,
        PartyB: '254712345678',
        Remarks: 'salary',
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    await flushBackgroundTasks();
    // grab the transaction code from the scheduled callback
    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    const b2cCb = deliveries.find((d: any) => d.flow === 'b2c');
    const txCode = b2cCb.payload.Result.TransactionID;
    void b2c;

    const rev = await post(
      '/mpesa/reversal/v1/request',
      {
        Initiator: 'init',
        SecurityCredential: 'sec',
        CommandID: 'TransactionReversal',
        ReceiverIdentifierType: '4',
        Remarks: 'rev',
        TransactionID: txCode,
        Amount: '300',
        ReceiverParty: MPESA_DISBURSEMENT_PAYBILL,
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    expect(rev.json.ResponseCode).toBe('0');
    await flushBackgroundTasks();

    const rev2 = await post(
      '/mpesa/reversal/v1/request',
      {
        Initiator: 'init',
        SecurityCredential: 'sec',
        CommandID: 'TransactionReversal',
        ReceiverIdentifierType: '4',
        Remarks: 'rev',
        TransactionID: txCode,
        Amount: '300',
        ReceiverParty: MPESA_DISBURSEMENT_PAYBILL,
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    expect(rev2.status).toBe(400);
    expect(rev2.json.ResponseDescription).toBe('Transaction has already been reversed');
  });
});

describe('transaction status / account balance / qr', () => {
  it('transaction status not found', async () => {
    const { status, json } = await post(
      '/mpesa/transactionstatus/v1/query',
      {
        Initiator: 'init',
        SecurityCredential: 'sec',
        CommandID: 'TransactionStatusQuery',
        IdentifierType: '4',
        Remarks: 'ts',
        TransactionID: 'NOPE',
        PartyA: MPESA_PAYBILL,
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    expect(status).toBe(400);
    expect(json.ResponseDescription).toBe('Transaction not found');
  });

  it('account balance success', async () => {
    const { json } = await post(
      '/mpesa/accountbalance/v1/query',
      {
        Initiator: 'init',
        SecurityCredential: 'sec',
        CommandID: 'AccountBalance',
        IdentifierType: '4',
        Remarks: 'bal',
        PartyA: MPESA_PAYBILL,
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
  });

  it('qr code generate', async () => {
    const { json } = await post(
      '/mpesa/qrcode/v1/generate',
      { MerchantName: 'Shop', MerchantShortCode: MPESA_PAYBILL, Amount: '50', QRType: 'PAYBILL' },
      auth,
    );
    expect(json.ResponseCode).toBe('00');
    expect(json.TrxCode).toBe('PB');
    expect(typeof json.QRCode).toBe('string');
  });
});

describe('b2b express + mirrored /mpesa namespace', () => {
  it('ussd push', async () => {
    const { json } = await post(
      '/v1/ussd-push/get-msisdn',
      {
        primaryShortCode: MPESA_PAYBILL,
        receiverShortCode: MPESA_COLLECTION_PAYBILL,
        amount: '100',
        paymentRef: 'P1',
        callbackUrl: 'https://example.com/cb',
        partnerName: 'Acme',
        RequestRefID: 'R1',
      },
      auth,
    );
    expect(json.code).toBe('0');
    await flushBackgroundTasks();
  });

  it('stk also reachable under /mpesa/mpesa', async () => {
    const { status, json } = await post('/mpesa/mpesa/stkpush/v1/processrequest', stkBody(), auth);
    expect(status).toBe(200);
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
  });
});

describe('till buy goods', () => {
  it('stk buy goods works on a TILL', async () => {
    const { json } = await post(
      '/mpesa/stkpush/v1/processrequest',
      stkBody({
        BusinessShortCode: MPESA_TILL,
        PartyA: MPESA_TILL,
        TransactionType: 'CustomerBuyGoodsOnline',
      }),
      auth,
    );
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
  });
});
