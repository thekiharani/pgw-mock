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

  it('creates, edits, signs in, then deletes a user', async () => {
    const app = await getApp();
    const email = 'admin-created@example.com';

    const created = await app.inject({
      method: 'POST',
      url: '/api/console/admin/users',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { name: 'Admin Created', email: email.toUpperCase(), role: 'user' },
    });
    expect(created.statusCode).toBe(201);
    const userId = created.json().id as string;
    expect(created.json().email).toBe(email); // normalized to lowercase

    // A directly-created user can sign in via email-OTP (email_verified preset).
    const cookie = await signInAndGetCookie(app, email);
    expect(cookie).toMatch(/=/);

    const edit = await app.inject({
      method: 'PATCH',
      url: `/api/console/admin/users/${userId}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { name: 'Renamed', email: 'admin-created-2@example.com' },
    });
    expect(edit.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/console/admin/users/${userId}`,
      headers: { cookie: adminCookie },
    });
    expect(detail.json().user.name).toBe('Renamed');
    expect(detail.json().user.email).toBe('admin-created-2@example.com');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/console/admin/users/${userId}`,
      headers: { cookie: adminCookie },
    });
    expect(del.statusCode).toBe(200);

    const gone = await app.inject({
      method: 'GET',
      url: `/api/console/admin/users/${userId}`,
      headers: { cookie: adminCookie },
    });
    expect(gone.statusCode).toBe(404);
  });

  it('rejects creating a user with a duplicate email', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/console/admin/users',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { name: 'Dupe', email: 'admin@noria.co.ke', role: 'user' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('blocks deleting the only owner of a merchant', async () => {
    const app = await getApp();
    // Make a fresh user the sole owner of a merchant, then try to delete them.
    const created = await app.inject({
      method: 'POST',
      url: '/api/console/admin/users',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { name: 'Sole Owner', email: 'sole-owner@example.com', role: 'user' },
    });
    const userId = created.json().id as string;
    const merchants = await app.inject({
      method: 'GET',
      url: '/api/console/merchants?pageSize=1',
      headers: { cookie: adminCookie },
    });
    const merchantId = merchants.json().data[0].id as string;
    await app.inject({
      method: 'PUT',
      url: `/api/console/admin/users/${userId}/merchants/${merchantId}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { role: 'owner' },
    });

    const blocked = await app.inject({
      method: 'DELETE',
      url: `/api/console/admin/users/${userId}`,
      headers: { cookie: adminCookie },
    });
    expect(blocked.statusCode).toBe(409);

    // Add a second owner so the user is no longer the only one, then the delete
    // is allowed (also keeps reruns idempotent — the test user is removed).
    const admins = await app.inject({
      method: 'GET',
      url: `/api/console/admin/users?q=${encodeURIComponent('admin@noria.co.ke')}`,
      headers: { cookie: adminCookie },
    });
    const adminId = admins
      .json()
      .data.find((u: { email: string }) => u.email === 'admin@noria.co.ke').id as string;
    await app.inject({
      method: 'PUT',
      url: `/api/console/admin/users/${adminId}/merchants/${merchantId}`,
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: { role: 'owner' },
    });
    const ok = await app.inject({
      method: 'DELETE',
      url: `/api/console/admin/users/${userId}`,
      headers: { cookie: adminCookie },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('prevents an admin from deleting their own account', async () => {
    const app = await getApp();
    const list = await app.inject({
      method: 'GET',
      url: `/api/console/admin/users?q=${encodeURIComponent('admin@noria.co.ke')}`,
      headers: { cookie: adminCookie },
    });
    const self = list.json().data.find((u: { email: string }) => u.email === 'admin@noria.co.ke');
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/console/admin/users/${self.id}`,
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(400);
  });
});
