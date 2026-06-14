/** Shared OTP-confirmation handler for WaaS onboarding. Mirrors app/services/waas_confirmation.py. */
import { getMerchantByCode } from '../actions/index.js';
import {
  getWaasOnboardingByRequestId,
  updateWaasOnboardingStatus,
} from '../actions/waasQueries.js';
import { db } from '../db/client.js';
import { PayloadError } from '../errors.js';

type OnboardingRecord = Awaited<ReturnType<typeof getWaasOnboardingByRequestId>>;

export async function handleConfirmation(opts: {
  merchantCode: string;
  requestId: string;
  otp: string;
  recordType: 'personal' | 'business';
  buildResponse: (record: NonNullable<OnboardingRecord>) => Record<string, any>;
  onConfirmed?: (record: NonNullable<OnboardingRecord>) => Promise<void>;
  request: { log: { error: (...args: any[]) => void } };
}): Promise<Record<string, any>> {
  const merchant = await getMerchantByCode(db, opts.merchantCode);
  if (!merchant) {
    throw new PayloadError({
      statusCode: 400,
      payload: { status: false, responseCode: '400', message: 'Invalid Merchant Account' },
    });
  }

  const record = await getWaasOnboardingByRequestId(db, opts.requestId);
  if (!record || record.merchantCode !== opts.merchantCode || record.type !== opts.recordType) {
    throw new PayloadError({
      statusCode: 400,
      payload: { status: false, responseCode: '400', message: 'Invalid requestId or otp' },
    });
  }
  if (record.otp !== String(opts.otp)) {
    throw new PayloadError({
      statusCode: 400,
      payload: { status: false, responseCode: '400', message: 'Invalid requestId or otp' },
    });
  }

  try {
    await db.transaction(async (tx) => {
      await updateWaasOnboardingStatus(tx, opts.requestId, 'CONFIRMED');
      if (opts.onConfirmed) await opts.onConfirmed(record);
    });
  } catch (exc) {
    opts.request.log.error(
      { err: exc },
      `${opts.recordType} confirmation persistence failed for requestId=${opts.requestId}`,
    );
    throw new PayloadError({
      statusCode: 500,
      payload: {
        status: false,
        responseCode: '500',
        message: 'Failed to confirm onboarding request',
      },
    });
  }

  return opts.buildResponse(record);
}
