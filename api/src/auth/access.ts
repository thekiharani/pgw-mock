import { and, eq, isNull } from 'drizzle-orm';

import type { MerchantRole } from '@shared/dto/member.js';

import type { Executor } from '@/db/client.js';
import { merchantMembers, merchants } from '@/db/schema.js';
import { AppError } from '@/errors.js';
import type { AuthSession } from '@/plugins/auth.js';

const RANK: Record<MerchantRole, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

export function roleAtLeast(role: MerchantRole, min: MerchantRole): boolean {
  return RANK[role] >= RANK[min];
}

export function isPlatformAdmin(session: AuthSession): boolean {
  return (session.user as { role?: string }).role === 'admin';
}

export function requirePlatformAdmin(session: AuthSession): void {
  if (!isPlatformAdmin(session)) {
    throw new AppError({ statusCode: 403, message: 'Platform admin access required' });
  }
}

export async function getMembership(
  exec: Executor,
  merchantId: string,
  userId: string,
): Promise<MerchantRole | null> {
  const rows = await exec
    .select({ role: merchantMembers.role })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

// Resolve the caller's effective role on a merchant, enforcing a minimum. A
// non-member sees a 404 (the merchant's existence is not leaked); a member
// without enough privilege gets a 403. Platform admins act as 'owner'.
export async function requireMerchantAccess(
  exec: Executor,
  session: AuthSession,
  merchantId: string,
  min: MerchantRole,
): Promise<MerchantRole> {
  const exists = await exec
    .select({ id: merchants.id })
    .from(merchants)
    .where(and(eq(merchants.id, merchantId), isNull(merchants.deletedAt)))
    .limit(1);
  if (!exists[0]) throw new AppError({ statusCode: 404, message: 'Merchant not found' });

  if (isPlatformAdmin(session)) return 'owner';

  const role = await getMembership(exec, merchantId, session.user.id);
  if (!role) throw new AppError({ statusCode: 404, message: 'Merchant not found' });
  if (!roleAtLeast(role, min)) {
    throw new AppError({
      statusCode: 403,
      message: 'You do not have permission to perform this action',
    });
  }
  return role;
}
