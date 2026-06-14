/** Mirrors app/actions/mpesa_queries.py. */
import { and, eq, sql } from 'drizzle-orm';

import type { Executor } from '@/db/client.js';
import { merchants, transactions } from '@/db/schema.js';
import { insertTransaction } from '@/actions/transactions.js';

export { insertTransaction as insertMpesaTransaction };

export interface MerchantRow {
  merchant_id: string;
  merchant_name: string;
  merchant_paybill: string;
  merchant_balance: string;
  merchant_meta: Record<string, any> | null;
}

export async function getMerchantByMpesaPaybill(
  exec: Executor,
  shortCode: string,
): Promise<MerchantRow | null> {
  const rows = await exec
    .select({
      merchant_id: merchants.id,
      merchant_name: merchants.name,
      merchant_paybill: merchants.mpesaPaybillNumber,
      merchant_balance: merchants.mpesaBalance,
      merchant_meta: merchants.meta,
    })
    .from(merchants)
    .where(eq(merchants.mpesaPaybillNumber, shortCode))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Atomically add `delta` (signed) to merchant.mpesa_balance.
 * Returns [applied, balanceString]. For debits the balance can never go < 0.
 */
export async function applyMpesaBalanceDelta(
  exec: Executor,
  merchantId: string,
  delta: number,
): Promise<[boolean, string]> {
  const deltaStr = String(delta);
  const conditions = [eq(merchants.id, merchantId)];
  if (delta < 0) {
    conditions.push(sql`${merchants.mpesaBalance} + ${deltaStr} >= 0`);
  }
  const res = await exec
    .update(merchants)
    .set({ mpesaBalance: sql`${merchants.mpesaBalance} + ${deltaStr}` })
    .where(and(...conditions));
  const affected = (res as any)[0]?.affectedRows ?? 0;
  const current = await exec
    .select({ bal: merchants.mpesaBalance })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);
  const balance = current[0]?.bal ?? '0';
  if (affected === 0) {
    return [false, balance];
  }
  return [true, balance];
}

export async function updateMerchantMpesaMeta(
  exec: Executor,
  merchantId: string,
  meta: Record<string, any>,
): Promise<void> {
  await exec.update(merchants).set({ meta }).where(eq(merchants.id, merchantId));
}

export async function getMpesaTransactionByCheckoutRequestId(
  exec: Executor,
  checkoutRequestId: string,
): Promise<Record<string, any> | null> {
  const rows = await exec
    .select({
      merchant_request_id: transactions.merchantRequestId,
      checkout_request_id: transactions.checkoutRequestId,
      result_code: transactions.resultCode,
      result_description: transactions.resultDescription,
      status: transactions.status,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(eq(transactions.checkoutRequestId, checkoutRequestId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getMpesaTransactionByCode(exec: Executor, transactionCode: string) {
  const rows = await exec
    .select()
    .from(transactions)
    .where(eq(transactions.transactionCode, transactionCode))
    .limit(1);
  return rows[0] ?? null;
}

export async function getMpesaReversalByOriginalTransactionId(
  exec: Executor,
  merchantId: string,
  transactionCode: string,
) {
  const rows = await exec
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.merchantId, merchantId),
        eq(transactions.merchantReference, transactionCode),
        eq(transactions.subType, 'REVERSAL'),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
