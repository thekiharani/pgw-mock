import { describe, expect, it } from 'vitest';

import { flushBackgroundTasks } from '@/utils/background.js';
import { BASIC_SASAPAY, BEARER_WAAS, SASAPAY_TILL, get, post } from '@test/helpers/app.js';

const auth = { authorization: BEARER_WAAS };
const W = '/sasapay/api/v2/waas';

async function otpFor(requestId: string): Promise<string> {
  const { json } = await get(`${W}/onboarding/requests/${requestId}?includeOtp=true`, auth);
  return json.data.otp;
}

describe('waas auth + reference data', () => {
  it('issues a token', async () => {
    const { status, json } = await get(`${W}/auth/token/?grant_type=client_credentials`, {
      authorization: BASIC_SASAPAY,
    });
    expect(status).toBe(200);
    expect(json.scope).toBe('onboarding kyc reference-data wallet payments');
    expect(json.access_token.split('.')).toHaveLength(3);
  });

  it('returns countries, industries, business types, products, and banks', async () => {
    expect((await get(`${W}/countries/`, auth)).json.data[0].name).toBe('Kenya');
    expect((await get(`${W}/industries/`, auth)).json.data.length).toBe(4);
    expect((await get(`${W}/business-types/`, auth)).json.data.length).toBe(4);
    expect((await get(`${W}/products/`, auth)).json.data[0].code).toBe('WALLET');
    expect((await get(`${W}/banks/`, auth)).json.data.length).toBe(16);
  });

  it('sub-regions require callingCode', async () => {
    expect((await get(`${W}/countries/sub-regions/`, auth)).status).toBe(400);
    const ok = await get(`${W}/countries/sub-regions/?callingCode=254`, auth);
    expect(ok.json.data.length).toBe(3);
  });

  it('sub-industries require industryId', async () => {
    expect((await get(`${W}/sub-industries/`, auth)).status).toBe(400);
    const ok = await get(`${W}/sub-industries/?industryId=62`, auth);
    expect(ok.json.data.length).toBe(3);
  });
});

describe('waas personal onboarding flow', () => {
  it('onboards, confirms, then completes KYC', async () => {
    const ob = await post(
      `${W}/personal-onboarding/`,
      {
        merchantCode: SASAPAY_TILL,
        firstName: 'Jane',
        lastName: 'Doe',
        mobileNumber: '254712345678',
        callbackUrl: 'https://example.com/cb',
      },
      auth,
    );
    expect(ob.status).toBe(200);
    expect(ob.json.message).toContain('254******678');
    const requestId = ob.json.requestId;
    const otp = await otpFor(requestId);

    const confirm = await post(
      `${W}/personal-onboarding/confirmation/`,
      { merchantCode: SASAPAY_TILL, requestId, otp },
      auth,
    );
    expect(confirm.status).toBe(200);
    expect(confirm.json.data.accountStatus).toBe('ACTIVE');

    const badConfirm = await post(
      `${W}/personal-onboarding/confirmation/`,
      { merchantCode: SASAPAY_TILL, requestId, otp: '0000' },
      auth,
    );
    expect(badConfirm.status).toBe(400);

    const kyc = await post(
      `${W}/personal-onboarding/kyc/`,
      { merchantCode: SASAPAY_TILL, customerMobileNumber: '254712345678' },
      auth,
    );
    expect(kyc.json.message).toBe('Documents uploaded.');
    await flushBackgroundTasks();
  });

  it('invalid merchant rejected', async () => {
    const { status, json } = await post(
      `${W}/personal-onboarding/`,
      { merchantCode: '777777', firstName: 'A', lastName: 'B', mobileNumber: '254712345678' },
      auth,
    );
    expect(status).toBe(400);
    expect(json.message).toBe('Invalid Merchant Account');
  });
});

describe('waas business onboarding + KYC', () => {
  it('onboards, confirms, then completes KYC with document validation', async () => {
    const ob = await post(
      `${W}/business-onboarding/`,
      {
        merchantCode: SASAPAY_TILL,
        businessName: 'Acme Ltd',
        mobileNumber: '254712345678',
        businessTypeId: 3,
        callbackUrl: 'https://example.com/cb',
      },
      auth,
    );
    expect(ob.status).toBe(200);
    const requestId = ob.json.requestId;
    const otp = await otpFor(requestId);

    const confirm = await post(
      `${W}/business-onboarding/confirmation/`,
      { merchantCode: SASAPAY_TILL, requestId, otp },
      auth,
    );
    expect(confirm.json.data.accountStatus).toBe('AWAITING_KYC_UPLOAD');

    const missing = await post(
      `${W}/business-onboarding/kyc/`,
      { merchantCode: SASAPAY_TILL, requestId, businessKraPin: 'A123' },
      auth,
    );
    expect(missing.status).toBe(400);
    const fields = missing.json.errors.map((e: any) => e.field);
    expect(fields).toContain('boardResolution');
    expect(fields).toContain('cr12Document');

    const ok = await post(
      `${W}/business-onboarding/kyc/`,
      {
        merchantCode: SASAPAY_TILL,
        requestId,
        businessKraPin: 'A123',
        businessRegistrationCertificate: 'cert',
        proofOfAddressDocument: 'addr',
        proofOfBankDocument: 'bank',
        boardResolution: 'br',
        cr12Document: 'cr12',
        directorIdCardFront: 'f',
        directorIdCardBack: 'b',
        directorKraPin: 'dk',
      },
      auth,
    );
    expect(ok.json.message).toBe('Business KYC uploaded.');
    await flushBackgroundTasks();
  });
});

describe('waas onboarding request lookup', () => {
  it('returns 404 for an unknown request', async () => {
    const { status, json } = await get(`${W}/onboarding/requests/nope`, auth);
    expect(status).toBe(404);
    expect(json.message).toBe('Onboarding request not found');
  });
});

describe('waas wallet + payments', () => {
  async function onboardedAccount(mobile: string): Promise<string> {
    const ob = await post(
      `${W}/personal-onboarding/`,
      { merchantCode: SASAPAY_TILL, firstName: 'W', lastName: 'allet', mobileNumber: mobile },
      auth,
    );
    const requestId = ob.json.requestId;
    const otp = await otpFor(requestId);
    await post(
      `${W}/personal-onboarding/confirmation/`,
      { merchantCode: SASAPAY_TILL, requestId, otp },
      auth,
    );
    return mobile;
  }

  it('tops up then returns balance and statement', async () => {
    const acct = await onboardedAccount('254700000001');
    const topup = await post(
      `${W}/wallets/transactions/topup/`,
      { merchantCode: SASAPAY_TILL, accountNumber: acct, amount: '1000' },
      auth,
    );
    expect(topup.json.data.balanceAfter).toBe(1000);

    const bal = await get(`${W}/wallets/${acct}/balance/`, auth);
    expect(bal.json.data.balance).toBe(1000);

    const stmt = await get(`${W}/wallets/${acct}/statement/`, auth);
    expect(stmt.json.data.transactions.length).toBe(1);
  });

  it('sends between accounts and rejects insufficient balance', async () => {
    const sender = await onboardedAccount('254700000002');
    await post(
      `${W}/wallets/transactions/topup/`,
      { merchantCode: SASAPAY_TILL, accountNumber: sender, amount: '500' },
      auth,
    );
    const send = await post(
      `${W}/wallets/transactions/send/`,
      {
        merchantCode: SASAPAY_TILL,
        senderAccountNumber: sender,
        receiverAccountNumber: '254700000003',
        amount: '200',
      },
      auth,
    );
    expect(send.json.data.senderBalanceAfter).toBe(300);

    const over = await post(
      `${W}/wallets/transactions/send/`,
      {
        merchantCode: SASAPAY_TILL,
        senderAccountNumber: sender,
        receiverAccountNumber: '254700000003',
        amount: '99999',
      },
      auth,
    );
    expect(over.status).toBe(400);
    expect(over.json.message).toBe('Insufficient wallet balance');
  });

  it('balance for non-onboarded account is rejected', async () => {
    const { status, json } = await get(`${W}/wallets/254700009999/balance/`, auth);
    expect(status).toBe(400);
    expect(json.message).toContain('is not an active wallet');
  });

  it('issues an OTP on request-payment then debits the wallet on process-payment', async () => {
    const acct = await onboardedAccount('254700000004');
    await post(
      `${W}/wallets/transactions/topup/`,
      { merchantCode: SASAPAY_TILL, accountNumber: acct, amount: '1000' },
      auth,
    );
    const req = await post(
      `${W}/payments/request-payment/`,
      {
        merchantCode: SASAPAY_TILL,
        amount: '400',
        senderAccountNumber: acct,
        callbackUrl: 'https://example.com/cb',
      },
      auth,
    );
    expect(req.json.message).toBe('OTP sent. Share the code to complete transaction.');
    const checkout = req.json.CheckoutRequestID;

    const proc = await post(
      `${W}/payments/process-payment/`,
      { merchantCode: SASAPAY_TILL, checkoutRequestId: checkout, verificationCode: '1234' },
      auth,
    );
    expect(proc.json.ResponseCode).toBe('0');
    await flushBackgroundTasks();

    const bal = await get(`${W}/wallets/${acct}/balance/`, auth);
    expect(bal.json.data.balance).toBe(600);
  });

  it('pay-bills requires a biller', async () => {
    const acct = await onboardedAccount('254700000005');
    await post(
      `${W}/wallets/transactions/topup/`,
      { merchantCode: SASAPAY_TILL, accountNumber: acct, amount: '1000' },
      auth,
    );
    const noBiller = await post(
      `${W}/payments/pay-bills/`,
      { merchantCode: SASAPAY_TILL, amount: '100', senderAccountNumber: acct },
      auth,
    );
    expect(noBiller.status).toBe(400);
    expect(noBiller.json.message).toBe('billerMerchantCode or paybillNumber is required');

    const ok = await post(
      `${W}/payments/pay-bills/`,
      {
        merchantCode: SASAPAY_TILL,
        amount: '100',
        senderAccountNumber: acct,
        paybillNumber: '888000',
      },
      auth,
    );
    expect(ok.json.ResponseCode).toBe('0');
    await flushBackgroundTasks();
  });
});

describe('waas payments — send-money & merchant-transfers', () => {
  async function fundedAccount(mobile: string): Promise<string> {
    const ob = await post(
      `${W}/personal-onboarding/`,
      { merchantCode: SASAPAY_TILL, firstName: 'P', lastName: 'Q', mobileNumber: mobile },
      auth,
    );
    const requestId = ob.json.requestId;
    const { json } = await get(`${W}/onboarding/requests/${requestId}?includeOtp=true`, auth);
    await post(
      `${W}/personal-onboarding/confirmation/`,
      { merchantCode: SASAPAY_TILL, requestId, otp: json.data.otp },
      auth,
    );
    await post(
      `${W}/wallets/transactions/topup/`,
      { merchantCode: SASAPAY_TILL, accountNumber: mobile, amount: '1000' },
      auth,
    );
    return mobile;
  }

  it('send-money debits the wallet', async () => {
    const acct = await fundedAccount('254700001001');
    const res = await post(
      `${W}/payments/send-money/`,
      {
        merchantCode: SASAPAY_TILL,
        senderAccountNumber: acct,
        receiverNumber: '254799999999',
        amount: '250',
        callbackUrl: 'https://example.com/cb',
      },
      auth,
    );
    expect(res.json.ResponseCode).toBe('0');
    expect(res.json.senderBalanceAfter).toBe(750);
    await flushBackgroundTasks();
    const bal = await get(`${W}/wallets/${acct}/balance/`, auth);
    expect(bal.json.data.balance).toBe(750);
  });

  it('merchant-transfers debits the wallet', async () => {
    const acct = await fundedAccount('254700001002');
    const res = await post(
      `${W}/payments/merchant-transfers/`,
      {
        merchantCode: SASAPAY_TILL,
        senderAccountNumber: acct,
        receiverMerchantCode: '600100',
        amount: '300',
        callbackUrl: 'https://example.com/cb',
      },
      auth,
    );
    expect(res.json.ResponseCode).toBe('0');
    expect(res.json.senderBalanceAfter).toBe(700);
    await flushBackgroundTasks();
  });

  it('send-money rejects insufficient balance', async () => {
    const acct = await fundedAccount('254700001003');
    const res = await post(
      `${W}/payments/send-money/`,
      {
        merchantCode: SASAPAY_TILL,
        senderAccountNumber: acct,
        receiverNumber: '254799999999',
        amount: '99999',
      },
      auth,
    );
    expect(res.status).toBe(400);
    expect(res.json.message).toBe('Insufficient wallet balance');
  });
});
