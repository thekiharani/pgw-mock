/** Mirrors app/actions/__init__.py. */
import type { Executor } from '../db/client.js';
import { getMerchantByMpesaPaybill } from './mpesaQueries.js';
import { getMerchantBySasapayTill } from './sasapayQueries.js';

/** Look up a merchant by code, trying SasaPay till first then M-Pesa paybill. */
export async function getMerchantByCode(
  exec: Executor,
  code: string,
): Promise<Record<string, any> | null> {
  return (
    (await getMerchantBySasapayTill(exec, code)) ?? (await getMerchantByMpesaPaybill(exec, code))
  );
}
