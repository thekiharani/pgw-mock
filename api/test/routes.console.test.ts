import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { getApp } from '@test/helpers/app.js';

async function signInAndGetCookie(app: FastifyInstance, email: string): Promise<string> {
  const logs: string[] = [];
  const spy = vi
    .spyOn(console, 'info')
    .mockImplementation((...args: unknown[]) => logs.push(args.map(String).join(' ')));
  await app.inject({
    method: 'POST',
    url: '/api/auth/email-otp/send-verification-otp',
    headers: { 'content-type': 'application/json' },
    payload: { email, type: 'sign-in' },
  });
  const otp = logs.join('\n').match(/\b(\d{6})\b/)?.[1];
  spy.mockRestore();

  const signIn = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email-otp',
    headers: { 'content-type': 'application/json' },
    payload: { email, otp },
  });
  const setCookie = signIn.headers['set-cookie'];
  return Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
}

describe('console management API (/api/console)', () => {
  let cookie: string;

  beforeAll(async () => {
    const app = await getApp();
    cookie = await signInAndGetCookie(app, 'console-admin@example.com');
  });

  it('rejects unauthenticated requests', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/api/console/merchants' });
    expect(res.statusCode).toBe(401);
  });

  it('lists seeded merchants for an authenticated session', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/console/merchants',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
    expect(body.page).toBe(1);
  });

  it('creates, reads, updates, rotates credentials, and soft-deletes a merchant', async () => {
    const app = await getApp();

    const created = await app.inject({
      method: 'POST',
      url: '/api/console/merchants',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        name: 'Console Created Merchant',
        mpesaPaybillNumber: '900900',
        sasapayTillNumber: '900901',
        mpesaBalance: '1000',
      },
    });
    expect(created.statusCode).toBe(201);
    const merchant = created.json();
    expect(merchant.id).toBeTruthy();
    expect(merchant.mpesaBalance).toBe('1000.00');

    const fetched = await app.inject({
      method: 'GET',
      url: `/api/console/merchants/${merchant.id}`,
      headers: { cookie },
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().name).toBe('Console Created Merchant');

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/console/merchants/${merchant.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Renamed Merchant', sasapayBalance: '250.50' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe('Renamed Merchant');
    expect(updated.json().sasapayBalance).toBe('250.50');

    const rotated = await app.inject({
      method: 'POST',
      url: `/api/console/merchants/${merchant.id}/rotate-mpesa-credentials`,
      headers: { cookie },
    });
    expect(rotated.statusCode).toBe(200);
    const creds = rotated.json();
    expect(creds.mpesaConsumerKey).toHaveLength(32);
    expect(creds.mpesaConsumerSecret).toHaveLength(32);

    const afterRotate = await app.inject({
      method: 'GET',
      url: `/api/console/merchants/${merchant.id}`,
      headers: { cookie },
    });
    expect(afterRotate.json().mpesaConsumerKey).toBe(creds.mpesaConsumerKey);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${merchant.id}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);

    const gone = await app.inject({
      method: 'GET',
      url: `/api/console/merchants/${merchant.id}`,
      headers: { cookie },
    });
    expect(gone.statusCode).toBe(404);
  });

  it('rejects a duplicate paybill', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/console/merchants',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Dup', mpesaPaybillNumber: '887000', sasapayTillNumber: 'UNIQUE-TILL-1' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('lists transactions with pagination envelope', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/console/transactions?pageSize=5',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pageSize).toBe(5);
    expect(typeof body.total).toBe('number');
  });
});
