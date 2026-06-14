/** Shared test helpers: app instance, DB seeding, auth headers. */
import type { FastifyInstance } from 'fastify';

import { buildApp } from '@/server.js';
import { db } from '@/db/client.js';
import {
  callbackDeliveries,
  merchants,
  mockAccessTokens,
  mockScenarios,
  transactions,
  waasOnboardingRequests,
} from '@/db/schema.js';
import {
  invoices,
  optIns,
  pendingPayments,
  standingOrders,
  walletLedger,
} from '@/routes/stores.js';

// --- well-known codes (mirror tests/conftest.py) ---------------------------
export const MPESA_TILL = '884000';
export const MPESA_DISBURSEMENT_PAYBILL = '885000';
export const MPESA_COLLECTION_PAYBILL = '886000';
export const MPESA_PAYBILL = '887000';
export const SASAPAY_TILL = '888000';
export const BROKE_MPESA_PAYBILL = '887001';
export const BROKE_SASAPAY_TILL = '888001';

export const TEST_TOKEN_MPESA = 'testtoken-mpesa';
export const TEST_TOKEN_SASAPAY_V1 = 'testtoken-sasapay-v1';
export const TEST_TOKEN_SASAPAY_WAAS = 'testtoken-sasapay-waas';
export const BEARER = `Bearer ${TEST_TOKEN_MPESA}`;
export const BEARER_SASAPAY = `Bearer ${TEST_TOKEN_SASAPAY_V1}`;
export const BEARER_WAAS = `Bearer ${TEST_TOKEN_SASAPAY_WAAS}`;
export const BASIC = 'Basic ' + Buffer.from('test_client_id:test_client_secret').toString('base64');

let app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = buildApp({ logger: false });
    await app.ready();
  }
  return app;
}

export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}

function plusOneHour(): Date {
  return new Date(Date.now() + 3600 * 1000);
}

export async function seedDatabase(): Promise<void> {
  // Clear (respect FK order).
  await db.delete(callbackDeliveries);
  await db.delete(transactions);
  await db.delete(waasOnboardingRequests);
  await db.delete(mockScenarios);
  await db.delete(mockAccessTokens);
  await db.delete(merchants);

  await db.insert(merchants).values([
    {
      id: 'm-mpesa-001',
      name: 'TEST MPESA MERCHANT',
      mpesaPaybillNumber: MPESA_PAYBILL,
      sasapayTillNumber: 'DUMMY_M001',
      mpesaBalance: '500000.00',
      sasapayBalance: '0.00',
      meta: { mpesa: { kind: 'PAYBILL', capabilities: ['c2b', 'b2c', 'b2b'] } },
    },
    {
      id: 'm-mpesa-till-001',
      name: 'TEST MPESA TILL',
      mpesaPaybillNumber: MPESA_TILL,
      sasapayTillNumber: 'DUMMY_T001',
      mpesaBalance: '250000.00',
      sasapayBalance: '0.00',
      meta: { mpesa: { kind: 'TILL', capabilities: ['c2b'] } },
    },
    {
      id: 'm-mpesa-collection-001',
      name: 'TEST MPESA COLLECTION',
      mpesaPaybillNumber: MPESA_COLLECTION_PAYBILL,
      sasapayTillNumber: 'DUMMY_C001',
      mpesaBalance: '250000.00',
      sasapayBalance: '0.00',
      meta: { mpesa: { kind: 'PAYBILL', capabilities: ['c2b'] } },
    },
    {
      id: 'm-mpesa-disbursement-001',
      name: 'TEST MPESA DISBURSEMENT',
      mpesaPaybillNumber: MPESA_DISBURSEMENT_PAYBILL,
      sasapayTillNumber: 'DUMMY_D001',
      mpesaBalance: '250000.00',
      sasapayBalance: '0.00',
      meta: { mpesa: { kind: 'PAYBILL', capabilities: ['b2c', 'b2b'] } },
    },
    {
      id: 'm-sasapay-001',
      name: 'TEST SASAPAY MERCHANT',
      mpesaPaybillNumber: 'DUMMY_S001',
      sasapayTillNumber: SASAPAY_TILL,
      mpesaBalance: '0.00',
      sasapayBalance: '500000.00',
      meta: { sasapay: { capabilities: ['c2b', 'b2c', 'b2b'] } },
    },
    {
      id: 'm-broke-mpesa-001',
      name: 'BROKE MPESA MERCHANT',
      mpesaPaybillNumber: BROKE_MPESA_PAYBILL,
      sasapayTillNumber: 'DUMMY_BM001',
      mpesaBalance: '0.00',
      sasapayBalance: '0.00',
      meta: {},
    },
    {
      id: 'm-broke-sasapay-001',
      name: 'BROKE SASAPAY MERCHANT',
      mpesaPaybillNumber: 'DUMMY_BS001',
      sasapayTillNumber: BROKE_SASAPAY_TILL,
      mpesaBalance: '0.00',
      sasapayBalance: '0.00',
      meta: {},
    },
  ]);

  const expiresAt = plusOneHour();
  await db.insert(mockAccessTokens).values([
    {
      id: 'tok-test-mpesa',
      provider: 'mpesa',
      token: TEST_TOKEN_MPESA,
      scope: 'daraja',
      expiresAt,
      meta: {},
    },
    {
      id: 'tok-test-sasapay-v1',
      provider: 'sasapay-v1',
      token: TEST_TOKEN_SASAPAY_V1,
      scope: 'merchants C2B B2B B2C',
      expiresAt,
      meta: {},
    },
    {
      id: 'tok-test-sasapay-waas',
      provider: 'sasapay-waas',
      token: TEST_TOKEN_SASAPAY_WAAS,
      scope: 'onboarding kyc reference-data wallet payments',
      expiresAt,
      meta: {},
    },
  ]);
}

export function clearStores(): void {
  invoices.clear();
  optIns.clear();
  standingOrders.clear();
  walletLedger.clear();
  pendingPayments.clear();
}

/** Convenience POST helper returning {status, json}. */
export async function post(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const a = await getApp();
  const res = await a.inject({
    method: 'POST',
    url,
    payload: body as any,
    headers: { 'content-type': 'application/json', ...headers },
  });
  return { status: res.statusCode, json: res.json() };
}

export async function get(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> {
  const a = await getApp();
  const res = await a.inject({ method: 'GET', url, headers });
  return { status: res.statusCode, json: res.json() };
}
