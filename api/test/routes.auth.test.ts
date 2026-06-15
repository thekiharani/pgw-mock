import { describe, expect, it, vi } from 'vitest';

import { getApp } from '@test/helpers/app.js';

function otpFromLogs(logs: string[]): string | undefined {
  return logs.join('\n').match(/\b(\d{6})\b/)?.[1];
}

describe('dashboard auth (better-auth email OTP)', () => {
  it('signs in via email OTP and exposes the session', async () => {
    const app = await getApp();
    const email = 'auth-otp@example.com';

    const logs: string[] = [];
    const spy = vi
      .spyOn(console, 'info')
      .mockImplementation((...args: unknown[]) => logs.push(args.map(String).join(' ')));

    const send = await app.inject({
      method: 'POST',
      url: '/api/auth/email-otp/send-verification-otp',
      headers: { 'content-type': 'application/json' },
      payload: { email, type: 'sign-in' },
    });
    expect(send.statusCode).toBe(200);

    const otp = otpFromLogs(logs);
    spy.mockRestore();
    expect(otp).toMatch(/^\d{6}$/);

    const signIn = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email-otp',
      headers: { 'content-type': 'application/json' },
      payload: { email, otp },
    });
    expect(signIn.statusCode).toBe(200);

    const setCookie = signIn.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()?.user?.email).toBe(email);
  });

  it('rejects an invalid OTP', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email-otp',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'nobody@example.com', otp: '000000' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns no session without a cookie', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/get-session' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });
});
