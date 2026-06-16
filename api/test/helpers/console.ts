import { vi } from 'vitest';

import type { MerchantRole } from '@shared/dto/member.js';

import { getApp } from '@test/helpers/app.js';

// Drain console.info while `fn` runs and return everything that was logged. The
// app emits OTP codes and invitation links through the console mail driver
// (MAIL_DRIVER=console in vitest.config.ts), so this is how tests read them.
async function captureInfo(fn: () => Promise<void>): Promise<string> {
  const logs: string[] = [];
  const spy = vi
    .spyOn(console, 'info')
    .mockImplementation((...args: unknown[]) => logs.push(args.map(String).join(' ')));
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return logs.join('\n');
}

// Sign in (or implicitly register) a user via email OTP and return the session
// cookie. Users and sessions survive seedDatabase(), so callers sign in once in
// beforeAll and reuse the cookie across tests.
export async function signIn(email: string): Promise<string> {
  const app = await getApp();
  const logs = await captureInfo(async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/email-otp/send-verification-otp',
      headers: { 'content-type': 'application/json' },
      payload: { email, type: 'sign-in' },
    });
  });
  const otp = logs.match(/\b(\d{6})\b/)?.[1];
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email-otp',
    headers: { 'content-type': 'application/json' },
    payload: { email, otp },
  });
  const setCookie = res.headers['set-cookie'];
  return Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
}

let paybillSeq = 0;

// Unique paybill/till pair well clear of the seeded merchants (8xx000 range).
function uniqueNumbers(): { paybill: string; till: string } {
  paybillSeq += 1;
  const base = 960000 + paybillSeq * 2;
  return { paybill: String(base), till: String(base + 1) };
}

export async function createMerchant(
  ownerCookie: string,
  name = 'Access Test Co',
): Promise<string> {
  const app = await getApp();
  const { paybill, till } = uniqueNumbers();
  const res = await app.inject({
    method: 'POST',
    url: '/api/console/merchants',
    headers: { cookie: ownerCookie, 'content-type': 'application/json' },
    payload: { name, mpesaPaybillNumber: paybill, sasapayTillNumber: till },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createMerchant failed: ${res.statusCode} ${res.body}`);
  }
  return res.json().id as string;
}

export interface InviteResult {
  status: number;
  token?: string;
  body: { message?: string } & Record<string, unknown>;
}

export async function invite(
  merchantId: string,
  inviterCookie: string,
  email: string,
  role: MerchantRole,
): Promise<InviteResult> {
  const app = await getApp();
  let status = 0;
  let body: InviteResult['body'] = {};
  const logs = await captureInfo(async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/console/merchants/${merchantId}/invitations`,
      headers: { cookie: inviterCookie, 'content-type': 'application/json' },
      payload: { email, role },
    });
    status = res.statusCode;
    body = res.json();
  });
  const token = logs.match(/\/invite\/([A-Za-z0-9]+)/)?.[1];
  return { status, token, body };
}

export async function acceptInvite(token: string, cookie: string): Promise<number> {
  const app = await getApp();
  const res = await app.inject({
    method: 'POST',
    url: `/api/console/invitations/${token}/accept`,
    headers: { cookie },
  });
  return res.statusCode;
}

// Invite `email` as `role` and have that already-signed-in cookie accept it,
// asserting nothing — the helper throws if either leg is rejected so the team
// setup in a test reads as a single intent.
export async function addMember(
  merchantId: string,
  inviterCookie: string,
  email: string,
  cookie: string,
  role: MerchantRole,
): Promise<void> {
  const { status, token } = await invite(merchantId, inviterCookie, email, role);
  if (status !== 201 || !token) {
    throw new Error(`addMember: invite as ${role} failed with ${status}`);
  }
  const accepted = await acceptInvite(token, cookie);
  if (accepted !== 200) {
    throw new Error(`addMember: accept as ${role} failed with ${accepted}`);
  }
}
