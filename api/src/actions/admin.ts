import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';

import type { PlatformRole } from '@shared/dto/admin.js';
import type { MerchantRole } from '@shared/dto/member.js';

import type { Executor } from '@/db/client.js';
import { merchantMembers, merchants, transactions, users } from '@/db/schema.js';

function affectedRows(result: { rowCount: number | null }): number {
  return result.rowCount ?? 0;
}

export interface OverviewCounts {
  merchantCount: number;
  userCount: number;
  transactionCount: number;
  transactionVolume: string;
}

export async function getOverviewCounts(exec: Executor): Promise<OverviewCounts> {
  const [merchantRow] = await exec
    .select({ value: count() })
    .from(merchants)
    .where(isNull(merchants.deletedAt));
  const [userRow] = await exec.select({ value: count() }).from(users);
  const [txRow] = await exec
    .select({
      value: count(),
      volume: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(isNull(transactions.deletedAt));

  return {
    merchantCount: Number(merchantRow?.value ?? 0),
    userCount: Number(userRow?.value ?? 0),
    transactionCount: Number(txRow?.value ?? 0),
    transactionVolume: String(txRow?.volume ?? '0'),
  };
}

export interface RecentTransactionRow {
  id: string;
  transactionCode: string;
  gateway: string;
  amount: string;
  status: string;
  createdAt: Date | string | null;
}

export async function listRecentTransactions(
  exec: Executor,
  limit: number,
): Promise<RecentTransactionRow[]> {
  return exec
    .select({
      id: transactions.id,
      transactionCode: transactions.transactionCode,
      gateway: transactions.gateway,
      amount: transactions.amount,
      status: transactions.status,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .orderBy(desc(transactions.createdAt))
    .limit(limit);
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
  merchantCount: number;
  createdAt: Date | string | null;
}

export interface AdminUserListOptions {
  page: number;
  pageSize: number;
  q?: string | null;
}

export async function listUsers(
  exec: Executor,
  opts: AdminUserListOptions,
): Promise<{ rows: AdminUserRow[]; total: number }> {
  const conditions: SQL[] = [];
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern))!);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await exec
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      merchantCount: count(merchantMembers.id),
    })
    .from(users)
    .leftJoin(merchantMembers, eq(merchantMembers.userId, users.id))
    .where(where)
    .groupBy(users.id)
    .orderBy(desc(users.createdAt))
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);

  const [counted] = await exec.select({ value: count() }).from(users).where(where);

  return {
    rows: rows.map((row) => ({
      ...row,
      role: row.role as PlatformRole,
      merchantCount: Number(row.merchantCount),
    })),
    total: Number(counted?.value ?? 0),
  };
}

export async function getUserById(exec: Executor, id: string): Promise<AdminUserRow | null> {
  const rows = await exec
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      merchantCount: count(merchantMembers.id),
    })
    .from(users)
    .leftJoin(merchantMembers, eq(merchantMembers.userId, users.id))
    .where(eq(users.id, id))
    .groupBy(users.id)
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row, role: row.role as PlatformRole, merchantCount: Number(row.merchantCount) };
}

export interface UserMembershipRow {
  merchantId: string;
  merchantName: string;
  role: MerchantRole;
}

export async function listUserMemberships(
  exec: Executor,
  userId: string,
): Promise<UserMembershipRow[]> {
  return exec
    .select({
      merchantId: merchantMembers.merchantId,
      merchantName: merchants.name,
      role: merchantMembers.role,
    })
    .from(merchantMembers)
    .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
    .where(and(eq(merchantMembers.userId, userId), isNull(merchants.deletedAt)))
    .orderBy(merchantMembers.role);
}

export async function setPlatformRole(
  exec: Executor,
  userId: string,
  role: PlatformRole,
): Promise<number> {
  const result = await exec.update(users).set({ role }).where(eq(users.id, userId));
  return affectedRows(result);
}

// Grant or change a user's membership on a merchant (admin override).
export async function grantMembership(
  exec: Executor,
  merchantId: string,
  userId: string,
  role: MerchantRole,
  newMemberId: string,
): Promise<void> {
  const existing = await exec
    .select({ id: merchantMembers.id })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, userId)))
    .limit(1);
  if (existing[0]) {
    await exec
      .update(merchantMembers)
      .set({ role })
      .where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, userId)));
  } else {
    await exec.insert(merchantMembers).values({ id: newMemberId, merchantId, userId, role });
  }
}
