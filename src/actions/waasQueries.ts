/** Mirrors app/actions/waas_queries.py. */
import { and, desc, eq, inArray, or } from 'drizzle-orm';

import type { Executor } from '@/db/client.js';
import { waasOnboardingRequests } from '@/db/schema.js';

export interface WaasOnboardingData {
  request_id: string;
  type: 'personal' | 'business';
  merchant_code: string;
  mobile_number: string;
  callback_url?: string | null;
  display_name: string;
  account_number?: string | null;
  otp: string;
  status?: string;
  payload?: any;
  directors?: any;
}

export async function insertWaasOnboardingRequest(
  exec: Executor,
  data: WaasOnboardingData,
): Promise<void> {
  await exec.insert(waasOnboardingRequests).values({
    id: data.request_id,
    type: data.type,
    merchantCode: data.merchant_code,
    mobileNumber: data.mobile_number,
    callbackUrl: data.callback_url ?? null,
    displayName: data.display_name,
    accountNumber: data.account_number ?? null,
    otp: data.otp,
    status: data.status ?? 'STAGED',
    payload: data.payload ?? null,
    directors: data.directors ?? null,
  });
}

export async function getWaasOnboardingByRequestId(exec: Executor, requestId: string) {
  const rows = await exec
    .select()
    .from(waasOnboardingRequests)
    .where(eq(waasOnboardingRequests.id, requestId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findWaasOnboardingByMerchantAndMobile(
  exec: Executor,
  merchantCode: string,
  mobileNumber: string,
  type: 'personal' | 'business',
) {
  const rows = await exec
    .select()
    .from(waasOnboardingRequests)
    .where(
      and(
        eq(waasOnboardingRequests.merchantCode, merchantCode),
        eq(waasOnboardingRequests.mobileNumber, mobileNumber),
        eq(waasOnboardingRequests.type, type),
      ),
    )
    .orderBy(desc(waasOnboardingRequests.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateWaasOnboardingStatus(
  exec: Executor,
  requestId: string,
  status: string,
): Promise<void> {
  await exec
    .update(waasOnboardingRequests)
    .set({ status })
    .where(eq(waasOnboardingRequests.id, requestId));
}

export async function findActiveWalletByAccountNumber(exec: Executor, accountNumber: string) {
  const rows = await exec
    .select()
    .from(waasOnboardingRequests)
    .where(
      and(
        inArray(waasOnboardingRequests.status, ['CONFIRMED', 'KYC_UPLOADED']),
        or(
          eq(waasOnboardingRequests.accountNumber, accountNumber),
          eq(waasOnboardingRequests.mobileNumber, accountNumber),
        ),
      ),
    )
    .orderBy(desc(waasOnboardingRequests.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
