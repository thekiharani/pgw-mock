import { and, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';

import type { Executor } from '@/db/client.js';
import { merchants, transactions } from '@/db/schema.js';

type MerchantInsert = typeof merchants.$inferInsert;
type MerchantRow = typeof merchants.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

function affectedRows(result: { rowCount: number | null }): number {
  return result.rowCount ?? 0;
}

export interface MerchantListOptions {
  page: number;
  pageSize: number;
  q?: string | null;
}

export async function listMerchants(
  exec: Executor,
  opts: MerchantListOptions,
): Promise<{ rows: MerchantRow[]; total: number }> {
  const conditions: SQL[] = [isNull(merchants.deletedAt)];
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(merchants.name, pattern),
        ilike(merchants.email, pattern),
        ilike(merchants.mpesaPaybillNumber, pattern),
        ilike(merchants.sasapayTillNumber, pattern),
      )!,
    );
  }
  const where = and(...conditions);
  const rows = await exec
    .select()
    .from(merchants)
    .where(where)
    .orderBy(desc(merchants.createdAt))
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);
  const counted = await exec
    .select({ count: sql<number>`count(*)` })
    .from(merchants)
    .where(where);
  return { rows, total: Number(counted[0]?.count ?? 0) };
}

export async function getMerchantById(exec: Executor, id: string): Promise<MerchantRow | null> {
  const rows = await exec
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, id), isNull(merchants.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function merchantExistsByPaybill(exec: Executor, paybill: string): Promise<boolean> {
  const rows = await exec
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.mpesaPaybillNumber, paybill))
    .limit(1);
  return rows.length > 0;
}

export async function merchantExistsByTill(exec: Executor, till: string): Promise<boolean> {
  const rows = await exec
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.sasapayTillNumber, till))
    .limit(1);
  return rows.length > 0;
}

export async function createMerchant(exec: Executor, values: MerchantInsert): Promise<void> {
  await exec.insert(merchants).values(values);
}

export async function updateMerchant(
  exec: Executor,
  id: string,
  patch: Partial<MerchantInsert>,
): Promise<void> {
  await exec
    .update(merchants)
    .set(patch)
    .where(and(eq(merchants.id, id), isNull(merchants.deletedAt)));
}

export async function softDeleteMerchant(exec: Executor, id: string): Promise<number> {
  const result = await exec
    .update(merchants)
    .set({ deletedAt: new Date() })
    .where(and(eq(merchants.id, id), isNull(merchants.deletedAt)));
  return affectedRows(result);
}

export interface TransactionListOptions {
  page: number;
  pageSize: number;
  merchantId?: string | null;
  gateway?: string | null;
  status?: string | null;
  q?: string | null;
}

export async function listTransactions(
  exec: Executor,
  opts: TransactionListOptions,
): Promise<{ rows: TransactionRow[]; total: number }> {
  const conditions: SQL[] = [isNull(transactions.deletedAt)];
  if (opts.merchantId) conditions.push(eq(transactions.merchantId, opts.merchantId));
  if (opts.gateway) conditions.push(eq(transactions.gateway, opts.gateway));
  if (opts.status) conditions.push(eq(transactions.status, opts.status));
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(transactions.transactionCode, pattern),
        ilike(transactions.merchantReference, pattern),
      )!,
    );
  }
  const where = and(...conditions);
  const rows = await exec
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.createdAt))
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);
  const counted = await exec
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(where);
  return { rows, total: Number(counted[0]?.count ?? 0) };
}
