import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db/client.js';
import { merchants } from '@/db/schema.js';
import { flushBackgroundTasks } from '@/utils/background.js';
import {
  BEARER,
  BROKE_MPESA_PAYBILL,
  MPESA_COLLECTION_PAYBILL,
  MPESA_DISBURSEMENT_PAYBILL,
  MPESA_PAYBILL,
  MPESA_TILL,
  get,
  post,
} from '@test/helpers/app.js';

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
  it('succeeds for a valid request', async () => {
    const { status, json } = await post('/mpesa/mpesa/stkpush/v1/processrequest', stkBody(), auth);
    expect(status).toBe(200);
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
  });

  it('rejects missing required fields in strict mode', async () => {
    const { status, json } = await post(
      '/mpesa/mpesa/stkpush/v1/processrequest',
      stkBody({ Password: undefined, Timestamp: undefined }),
      auth,
    );
    expect(status).toBe(400);
    expect(json.ResponseDescription).toContain('Missing required fields');
  });

  it('rejects an unknown merchant paybill', async () => {
    const { status, json } = await post(
      '/mpesa/mpesa/stkpush/v1/processrequest',
      stkBody({ BusinessShortCode: '999999', PartyA: '999999' }),
      auth,
    );
    expect(status).toBe(400);
    expect(json.ResponseDescription).toBe('Invalid Merchant Paybill');
  });

  it('fails the callback based on the amount', async () => {
    const { json } = await post(
      '/mpesa/mpesa/stkpush/v1/processrequest',
      stkBody({ Amount: '1' }),
      auth,
    );
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    const stk = deliveries.find((d: any) => d.eventType === 'stk_callback');
    expect(stk.payload.Body.stkCallback.ResultCode).toBe(1);
  });

  it('applies a result code from a request header override', async () => {
    await post('/mpesa/mpesa/stkpush/v1/processrequest', stkBody(), {
      ...auth,
      'x-mock-result-code': '1032',
    });
    await flushBackgroundTasks();
    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    const stk = deliveries.find((d: any) => d.eventType === 'stk_callback');
    expect(stk.payload.Body.stkCallback.ResultCode).toBe(1032);
  });

  it('applies a persisted scenario override', async () => {
    await post('/mock/scenarios', {
      provider: 'mpesa',
      flow: 'stk',
      selectorType: 'reference',
      selectorValue: 'FAILME',
      resultCode: '17',
    });
    await post(
      '/mpesa/mpesa/stkpush/v1/processrequest',
      stkBody({ AccountReference: 'FAILME' }),
      auth,
    );
    await flushBackgroundTasks();
    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    const stk = deliveries.find((d: any) => d.eventType === 'stk_callback');
    expect(stk.payload.Body.stkCallback.ResultCode).toBe(17);
  });

  it('debits merchant balance on success', async () => {
    const before = await balanceOf(MPESA_PAYBILL);
    await post('/mpesa/mpesa/stkpush/v1/processrequest', stkBody({ Amount: '2000' }), auth);
    await flushBackgroundTasks();
    expect(await balanceOf(MPESA_PAYBILL)).toBe(before + 2000);
  });
});

describe('STK push query', () => {
  it('returns a processing result for an unknown request', async () => {
    const { status, json } = await post(
      '/mpesa/mpesa/stkpushquery/v1/query',
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

  it('finds the request after an STK push', async () => {
    const stk = await post('/mpesa/mpesa/stkpush/v1/processrequest', stkBody(), auth);
    await flushBackgroundTasks();
    const { status, json } = await post(
      '/mpesa/mpesa/stkpushquery/v1/query',
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
  it('registers URLs then simulates a payment', async () => {
    const reg = await post(
      '/mpesa/mpesa/c2b/v1/registerurl',
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
      '/mpesa/mpesa/c2b/v1/registerurl',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        ResponseType: 'Completed',
        ConfirmationURL: 'https://example.com/conf',
      },
      auth,
    );
    expect(again.json.ResponseDescription).toBe('C2B URLs are already registered');

    const sim = await post(
      '/mpesa/mpesa/c2b/v1/simulate',
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
      '/mpesa/mpesa/c2b/v1/registerurl',
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
      '/mpesa/mpesa/c2b/v1/simulate',
      { ShortCode: MPESA_COLLECTION_PAYBILL, Amount: '100', Msisdn: '254712345678' },
      auth,
    );
    expect(json.ResponseDescription).toBe('CommandID is required');
  });

  it('buy goods command rejected on paybill kind', async () => {
    const { status, json } = await post(
      '/mpesa/mpesa/c2b/v1/simulate',
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
  it('processes a B2C payment and debits the balance', async () => {
    const before = await balanceOf(MPESA_DISBURSEMENT_PAYBILL);
    const { status, json } = await post(
      '/mpesa/mpesa/b2c/v1/paymentrequest',
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

  it('rejects a B2C payment from a merchant with insufficient funds', async () => {
    const { status, json } = await post(
      '/mpesa/mpesa/b2c/v1/paymentrequest',
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

  it('processes a B2B payment', async () => {
    const { json } = await post(
      '/mpesa/mpesa/b2b/v1/paymentrequest',
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

  it('remits tax to KRA', async () => {
    const { json } = await post(
      '/mpesa/mpesa/b2b/v1/remittax',
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
  it('rejects a reversal when the original transaction is not found', async () => {
    const { status, json } = await post(
      '/mpesa/mpesa/reversal/v1/request',
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
      '/mpesa/mpesa/b2c/v1/paymentrequest',
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
    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    const b2cCb = deliveries.find((d: any) => d.flow === 'b2c');
    const txCode = b2cCb.payload.Result.TransactionID;
    void b2c;

    const rev = await post(
      '/mpesa/mpesa/reversal/v1/request',
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
      '/mpesa/mpesa/reversal/v1/request',
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
  it('rejects a status query for an unknown transaction', async () => {
    const { status, json } = await post(
      '/mpesa/mpesa/transactionstatus/v1/query',
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

  it('returns an account balance', async () => {
    const { json } = await post(
      '/mpesa/mpesa/accountbalance/v1/query',
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

  it('generates a QR code', async () => {
    const { json } = await post(
      '/mpesa/mpesa/qrcode/v1/generate',
      { MerchantName: 'Shop', MerchantShortCode: MPESA_PAYBILL, Amount: '50', QRType: 'PAYBILL' },
      auth,
    );
    expect(json.ResponseCode).toBe('00');
    expect(json.TrxCode).toBe('PB');
    expect(typeof json.QRCode).toBe('string');
  });
});

describe('b2b express + mirrored /mpesa namespace', () => {
  it('issues a USSD push request', async () => {
    const { json } = await post(
      '/mpesa/v1/ussdpush/get-msisdn',
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

  it('is also reachable under /mpesa/mpesa', async () => {
    const { status, json } = await post('/mpesa/mpesa/stkpush/v1/processrequest', stkBody(), auth);
    expect(status).toBe(200);
    expect(json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
  });
});

describe('till buy goods', () => {
  it('stk buy goods works on a TILL', async () => {
    const { json } = await post(
      '/mpesa/mpesa/stkpush/v1/processrequest',
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
