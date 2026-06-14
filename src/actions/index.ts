/** Mirrors app/actions/__init__.py. */
import type { Executor } from '@/db/client.js';
import { getMerchantByMpesaPaybill } from '@/actions/mpesaQueries.js';
import { getMerchantBySasapayTill } from '@/actions/sasapayQueries.js';

/** Look up a merchant by code, trying SasaPay till first then M-Pesa paybill. */
export async function getMerchantByCode(
  exec: Executor,
  code: string,
): Promise<Record<string, any> | null> {
  return (
    (await getMerchantBySasapayTill(exec, code)) ?? (await getMerchantByMpesaPaybill(exec, code))
  );
}
