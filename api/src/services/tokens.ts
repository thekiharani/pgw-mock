import { and, eq, gt, isNull } from 'drizzle-orm';

import type { Executor } from '@/db/client.js';
import { mockAccessTokens } from '@/db/schema.js';
import { uuid7 } from '@/utils/generators.js';

function isDarajaPath(path: string): boolean {
  return (
    path.startsWith('/mpesa') ||
    path.startsWith('/v1/ussd-push') ||
    path.startsWith('/standingorder')
  );
}

export function providerFromPath(path: string): string {
  if (isDarajaPath(path)) return 'mpesa';
  if (path.startsWith('/sasapay/api/v2/waas')) return 'sasapay-waas';
  if (path.startsWith('/sasapay')) return 'sasapay-v1';
  return 'generic';
}

export function requiredScopeFromPath(path: string): string | null {
  if (isDarajaPath(path)) return 'daraja';
  if (path.startsWith('/sasapay/api/v2/waas')) {
    if (path.includes('/auth/token/')) return null;
    if (
      ['/countries', '/industries', '/business-types', '/products', '/banks'].some((p) =>
        path.includes(p),
      )
    ) {
      return 'reference-data';
    }
    if (path.includes('kyc')) return 'kyc';
    if (path.includes('/wallets')) return 'wallet';
    if (path.includes('/payments/')) return 'payments';
    return 'onboarding';
  }
  if (path.startsWith('/sasapay/api/v1/payments/b2c')) return 'B2C';
  if (path.startsWith('/sasapay/api/v1/payments/b2b')) return 'B2B';
  if (
    path.startsWith('/sasapay/api/v1/payments/') ||
    path.startsWith('/sasapay/api/v1/transactions/')
  ) {
    return 'C2B';
  }
  return null;
}

export async function registerToken(
  exec: Executor,
  token: string,
  opts: { provider: string; expiresIn?: number; scope?: string; meta?: Record<string, any> | null },
): Promise<void> {
  const expiresIn = opts.expiresIn ?? 3600;
  await exec.insert(mockAccessTokens).values({
    id: uuid7(),
    provider: opts.provider,
    token,
    scope: opts.scope ?? '',
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    meta: opts.meta ?? {},
  });
}

export async function isValidToken(
  exec: Executor,
  token: string,
  opts: { provider?: string | null; requiredScope?: string | null } = {},
): Promise<boolean> {
  const conditions = [
    eq(mockAccessTokens.token, token),
    gt(mockAccessTokens.expiresAt, new Date()),
    isNull(mockAccessTokens.revokedAt),
  ];
  if (opts.provider) {
    conditions.push(eq(mockAccessTokens.provider, opts.provider));
  }
  const rows = await exec
    .select()
    .from(mockAccessTokens)
    .where(and(...conditions))
    .limit(1);
  const record = rows[0];
  if (!record) return false;
  if (opts.requiredScope) {
    const scopes = (record.scope ?? '').split(/\s+/).filter(Boolean);
    if (!scopes.includes(opts.requiredScope)) return false;
  }
  return true;
}
