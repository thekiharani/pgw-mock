import { and, eq, or, sql } from 'drizzle-orm';

import type { Executor } from '@/db/client.js';
import { merchants, transactions } from '@/db/schema.js';
import { insertTransaction } from '@/actions/transactions.js';

export { insertTransaction as insertSasapayTransaction };

export interface SasaMerchantRow {
  merchant_id: string;
  merchant_name: string;
  merchant_paybill: string;
  merchant_balance: string;
}

export async function getMerchantBySasapayTill(
  exec: Executor,
  tillNumber: string,
): Promise<SasaMerchantRow | null> {
  const rows = await exec
    .select({
      merchant_id: merchants.id,
      merchant_name: merchants.name,
      merchant_paybill: merchants.sasapayTillNumber,
      merchant_balance: merchants.sasapayBalance,
    })
    .from(merchants)
    .where(eq(merchants.sasapayTillNumber, tillNumber))
    .limit(1);
  return rows[0] ?? null;
}

export async function getMerchantBySasapayClientId(
  exec: Executor,
  clientId: string,
): Promise<{ merchant_id: string; client_secret: string | null } | null> {
  const rows = await exec
    .select({
      merchant_id: merchants.id,
      client_secret: merchants.sasapayClientSecret,
    })
    .from(merchants)
    .where(eq(merchants.sasapayClientId, clientId))
    .limit(1);
  return rows[0] ?? null;
}

export async function applySasapayBalanceDelta(
  exec: Executor,
  merchantId: string,
  delta: number,
): Promise<[boolean, string]> {
  const deltaStr = String(delta);
  const conditions = [eq(merchants.id, merchantId)];
  if (delta < 0) {
    conditions.push(sql`${merchants.sasapayBalance} + ${deltaStr} >= 0`);
  }
  const res = await exec
    .update(merchants)
    .set({ sasapayBalance: sql`${merchants.sasapayBalance} + ${deltaStr}` })
    .where(and(...conditions));
  const affected = res.rowCount ?? 0;
  const current = await exec
    .select({ bal: merchants.sasapayBalance })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);
  const balance = current[0]?.bal ?? '0';
  if (affected === 0) {
    return [false, balance];
  }
  return [true, balance];
}

export async function getTransactionStatus(
  exec: Executor,
  merchantId: string,
  transactionReference: string,
) {
  const rows = await exec
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.merchantId, merchantId),
        or(
          eq(transactions.transactionCode, transactionReference),
          eq(transactions.thirdPartyTransactionCode, transactionReference),
          eq(transactions.merchantRequestId, transactionReference),
          eq(transactions.merchantReference, transactionReference),
          eq(transactions.checkoutRequestId, transactionReference),
        ),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getSasapayTransactionByCheckoutRequestId(
  exec: Executor,
  merchantId: string,
  checkoutRequestId: string,
) {
  const rows = await exec
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.merchantId, merchantId),
        eq(transactions.checkoutRequestId, checkoutRequestId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function updateSasapayTransaction(
  exec: Executor,
  transactionId: string,
  opts: {
    result_code: string;
    result_description: string;
    status: string;
    merchant_balance: number | string;
    meta: Record<string, any>;
  },
): Promise<void> {
  await exec
    .update(transactions)
    .set({
      resultCode: opts.result_code,
      resultDescription: opts.result_description,
      status: opts.status,
      merchantBalance: String(opts.merchant_balance),
      meta: opts.meta,
    })
    .where(eq(transactions.id, transactionId));
}
