import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { getApp } from '@test/helpers/app.js';

function captureConsoleInfo(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const spy = vi
    .spyOn(console, 'info')
    .mockImplementation((...args: unknown[]) => logs.push(args.map(String).join(' ')));
  return { logs, restore: () => spy.mockRestore() };
}

async function signInAndGetCookie(app: FastifyInstance, email: string): Promise<string> {
  const { logs, restore } = captureConsoleInfo();
  await app.inject({
    method: 'POST',
    url: '/api/auth/email-otp/send-verification-otp',
    headers: { 'content-type': 'application/json' },
    payload: { email, type: 'sign-in' },
  });
  const otp = logs.join('\n').match(/\b(\d{6})\b/)?.[1];
  restore();

  const signIn = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email-otp',
    headers: { 'content-type': 'application/json' },
    payload: { email, otp },
  });
  const setCookie = signIn.headers['set-cookie'];
  return Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
}

// seedDatabase() wipes merchants before each test, so the whole lifecycle runs
// in one test to keep the merchant and its memberships alive end to end.
describe('collaboration & per-merchant access', () => {
  let ownerCookie: string;
  let collabCookie: string;
  const collabEmail = 'collab-user@example.com';

  beforeAll(async () => {
    const app = await getApp();
    ownerCookie = await signInAndGetCookie(app, 'owner-user@example.com');
    collabCookie = await signInAndGetCookie(app, collabEmail);
  });

  it('scopes merchants, invites, accepts, and enforces roles', async () => {
    const app = await getApp();

    const created = await app.inject({
      method: 'POST',
      url: '/api/console/merchants',
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      payload: { name: 'Collab Co', mpesaPaybillNumber: '950900', sasapayTillNumber: '950901' },
    });
    expect(created.statusCode).toBe(201);
    const merchantId = created.json().id as string;
    expect(created.json().myRole).toBe('owner');

    // Non-member cannot see the merchant at all.
    const hidden = await app.inject({
      method: 'GET',
      url: `/api/console/merchants/${merchantId}`,
      headers: { cookie: collabCookie },
    });
    expect(hidden.statusCode).toBe(404);

    // Owner invites the collaborator as a member.
    const { logs, restore } = captureConsoleInfo();
    const invited = await app.inject({
      method: 'POST',
      url: `/api/console/merchants/${merchantId}/invitations`,
      headers: { cookie: ownerCookie, 'content-type': 'application/json' },
      payload: { email: collabEmail, role: 'member' },
    });
    restore();
    expect(invited.statusCode).toBe(201);

    const token = logs.join('\n').match(/\/invite\/([A-Za-z0-9]+)/)?.[1];
    expect(token).toBeTruthy();

    // A session whose email differs from the invite cannot peek at it.
    const forbidden = await app.inject({
      method: 'GET',
      url: `/api/console/invitations/${token}`,
      headers: { cookie: ownerCookie },
    });
    expect(forbidden.statusCode).toBe(403);

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/console/invitations/${token}/accept`,
      headers: { cookie: collabCookie },
    });
    expect(accepted.statusCode).toBe(200);

    // The collaborator now sees the merchant as a member.
    const seen = await app.inject({
      method: 'GET',
      url: `/api/console/merchants/${merchantId}`,
      headers: { cookie: collabCookie },
    });
    expect(seen.statusCode).toBe(200);
    expect(seen.json().myRole).toBe('member');

    // A member may rotate credentials but not edit the merchant profile.
    const rotate = await app.inject({
      method: 'POST',
      url: `/api/console/merchants/${merchantId}/rotate-mpesa-credentials`,
      headers: { cookie: collabCookie },
    });
    expect(rotate.statusCode).toBe(200);

    const edit = await app.inject({
      method: 'PATCH',
      url: `/api/console/merchants/${merchantId}`,
      headers: { cookie: collabCookie, 'content-type': 'application/json' },
      payload: { name: 'Hacked' },
    });
    expect(edit.statusCode).toBe(403);

    // The sole owner cannot leave the merchant.
    const members = await app.inject({
      method: 'GET',
      url: `/api/console/merchants/${merchantId}/members`,
      headers: { cookie: ownerCookie },
    });
    expect(members.statusCode).toBe(200);
    const me = members.json().members.find((m: { isYou: boolean }) => m.isYou);
    const leave = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${merchantId}/members/${me.userId}`,
      headers: { cookie: ownerCookie },
    });
    expect(leave.statusCode).toBe(400);
  });
});
