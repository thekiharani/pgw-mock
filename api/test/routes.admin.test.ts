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

describe('platform admin API (/api/console/admin)', () => {
  let adminCookie: string;
  let userCookie: string;
  const plainEmail = 'plain-admin-target@example.com';

  beforeAll(async () => {
    const app = await getApp();
    adminCookie = await signInAndGetCookie(app, 'admin@noria.co.ke');
    userCookie = await signInAndGetCookie(app, plainEmail);
  });

  it('forbids non-admins from admin endpoints', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/console/admin/overview',
      headers: { cookie: userCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns overview counts for an admin', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/console/admin/overview',
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.merchantCount).toBeGreaterThan(0);
    expect(body.userCount).toBeGreaterThan(0);
    expect(typeof body.transactionVolume).toBe('string');
    expect(Array.isArray(body.recentTransactions)).toBe(true);
  });

  it('manages platform role and per-user merchant access', async () => {
    const app = await getApp();

    const list = await app.inject({
      method: 'GET',
      url: `/api/console/admin/users?q=${encodeURIComponent(plainEmail)}`,
      headers: { cookie: adminCookie },
    });
    expect(list.statusCode).toBe(200);
    const target = list.json().data.find((u: { email: string }) => u.email === plainEmail);
    expect(target).toBeTruthy();
    expect(target.role).toBe('user');

    // Promote then demote the platform role.
    const promote = await app.inject({
      method: 'PATCH',
      url: `/api/console/admin/users/${target.id}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { role: 'admin' },
    });
    expect(promote.statusCode).toBe(200);
    const demote = await app.inject({
      method: 'PATCH',
      url: `/api/console/admin/users/${target.id}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { role: 'user' },
    });
    expect(demote.statusCode).toBe(200);

    // Grant the user access to a merchant, then revoke it.
    const merchants = await app.inject({
      method: 'GET',
      url: '/api/console/merchants?pageSize=1',
      headers: { cookie: adminCookie },
    });
    const merchantId = merchants.json().data[0].id as string;

    const grant = await app.inject({
      method: 'PUT',
      url: `/api/console/admin/users/${target.id}/merchants/${merchantId}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { role: 'viewer' },
    });
    expect(grant.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/console/admin/users/${target.id}`,
      headers: { cookie: adminCookie },
    });
    expect(
      detail.json().memberships.some((m: { merchantId: string }) => m.merchantId === merchantId),
    ).toBe(true);

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/api/console/admin/users/${target.id}/merchants/${merchantId}`,
      headers: { cookie: adminCookie },
    });
    expect(revoke.statusCode).toBe(200);
  });

  it('prevents an admin from removing their own platform role', async () => {
    const app = await getApp();
    const list = await app.inject({
      method: 'GET',
      url: `/api/console/admin/users?q=${encodeURIComponent('admin@noria.co.ke')}`,
      headers: { cookie: adminCookie },
    });
    const self = list.json().data.find((u: { email: string }) => u.email === 'admin@noria.co.ke');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/console/admin/users/${self.id}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { role: 'user' },
    });
    expect(res.statusCode).toBe(400);
  });
});
