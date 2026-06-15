import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/client.js';
import { transactions } from '@/db/schema.js';
import { flushBackgroundTasks } from '@/utils/background.js';
import { postWebhook } from '@/utils/webhooks.js';
import { BEARER, MPESA_COLLECTION_PAYBILL, get, post } from '@test/helpers/app.js';

const auth = { authorization: BEARER };
const mockedWebhook = vi.mocked(postWebhook);
const defaultImpl = mockedWebhook.getMockImplementation();

afterEach(() => {
  if (defaultImpl) mockedWebhook.mockImplementation(defaultImpl);
});

describe('C2B validation gate', () => {
  it('a validation URL that rejects (ResultCode != 0) suppresses the confirmation callback', async () => {
    const validationUrl = 'https://example.com/validate';

    mockedWebhook.mockImplementation(async (url: string) => ({
      message: `Webhook sent to ${url}`,
      status: 200,
      attempts: 1,
      body: url === validationUrl ? { ResultCode: '1', ResultDesc: 'Rejected' } : null,
    }));

    await post(
      '/mpesa/mpesa/c2b/v1/registerurl',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        ResponseType: 'Completed',
        ConfirmationURL: 'https://example.com/confirm',
        ValidationURL: validationUrl,
      },
      auth,
    );

    await post(
      '/mpesa/mpesa/c2b/v1/simulate',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        CommandID: 'CustomerPayBillOnline',
        Amount: '100',
        Msisdn: '254712345678',
        BillRefNumber: 'VR1',
      },
      auth,
    );
    await flushBackgroundTasks();

    const deliveries = (await get('/mock/callback-deliveries')).json.data;
    const c2b = deliveries.filter((d: any) => d.flow === 'c2b');
    expect(c2b.some((d: any) => d.eventType === 'validation')).toBe(true);
    expect(c2b.some((d: any) => d.eventType === 'confirmation')).toBe(false);
  });

  it('a validation URL that accepts lets the confirmation through', async () => {
    await post(
      '/mpesa/mpesa/c2b/v1/registerurl',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        ResponseType: 'Completed',
        ConfirmationURL: 'https://example.com/confirm',
        ValidationURL: 'https://example.com/validate',
      },
      auth,
    );
    await post(
      '/mpesa/mpesa/c2b/v1/simulate',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        CommandID: 'CustomerPayBillOnline',
        Amount: '100',
        Msisdn: '254712345678',
        BillRefNumber: 'VR2',
      },
      auth,
    );
    await flushBackgroundTasks();
    const c2b = (await get('/mock/callback-deliveries')).json.data.filter(
      (d: any) => d.flow === 'c2b',
    );
    expect(c2b.some((d: any) => d.eventType === 'confirmation')).toBe(true);
  });
});

describe('transaction status — success envelope', () => {
  it('reflects a completed transaction and delivers a Result callback', async () => {
    await post(
      '/mpesa/mpesa/c2b/v1/simulate',
      {
        ShortCode: MPESA_COLLECTION_PAYBILL,
        CommandID: 'CustomerPayBillOnline',
        Amount: '100',
        Msisdn: '254712345678',
        BillRefNumber: 'TS1',
      },
      auth,
    );
    await flushBackgroundTasks();

    const rows = await db
      .select({ code: transactions.transactionCode })
      .from(transactions)
      .where(eq(transactions.merchantReference, 'TS1'))
      .limit(1);
    const code = rows[0]!.code;

    const res = await post(
      '/mpesa/mpesa/transactionstatus/v1/query',
      {
        Initiator: 'init',
        SecurityCredential: 'sec',
        CommandID: 'TransactionStatusQuery',
        IdentifierType: '4',
        Remarks: 'ts',
        TransactionID: code,
        PartyA: MPESA_COLLECTION_PAYBILL,
        ResultURL: 'https://example.com/r',
      },
      auth,
    );
    expect(res.status).toBe(200);
    expect(res.json.ResponseCode).toBe('0');
    await flushBackgroundTasks();

    const ts = (await get('/mock/callback-deliveries')).json.data.find(
      (d: any) => d.flow === 'transaction_status',
    );
    expect(ts).toBeTruthy();
    expect(ts.payload.Result.TransactionID).toBe(code);
    expect(ts.payload.Result.ResultParameters.ResultParameter.length).toBeGreaterThan(0);
  });
});
