import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';

import { db } from '@/db/client.js';
import { callbackDeliveries } from '@/db/schema.js';
import { uuid7 } from '@/utils/generators.js';
import { enqueueBackgroundTask } from '@/utils/background.js';
import { postWebhook } from '@/utils/webhooks.js';

export interface CallbackParams {
  provider: string;
  flow: string;
  eventType: string;
  url: string;
  payload: Record<string, any>;
  transactionId?: string | null;
}

export function scheduleCallback(request: FastifyRequest, params: CallbackParams): void {
  enqueueBackgroundTask(request, () => deliverCallback(params));
}

export async function deliverCallback(params: CallbackParams): Promise<Record<string, any>> {
  const { provider, flow, eventType, url, payload, transactionId = null } = params;

  if (transactionId) {
    const existing = await db
      .select()
      .from(callbackDeliveries)
      .where(
        and(
          eq(callbackDeliveries.transactionId, transactionId),
          eq(callbackDeliveries.provider, provider),
          eq(callbackDeliveries.flow, flow),
          eq(callbackDeliveries.eventType, eventType),
          eq(callbackDeliveries.url, url),
          eq(callbackDeliveries.status, 'DELIVERED'),
        ),
      )
      .limit(1);
    const existingDelivery = existing[0];
    if (existingDelivery) {
      return {
        deliveryId: existingDelivery.id,
        message: 'Callback already delivered',
        status: existingDelivery.lastStatusCode || 200,
        duplicate: true,
      };
    }
  }

  const deliveryId = uuid7();
  await db.insert(callbackDeliveries).values({
    id: deliveryId,
    provider,
    flow,
    eventType,
    transactionId,
    url,
    payload,
    status: 'PENDING',
    attempts: 0,
  });

  const result = await postWebhook(url, payload);
  const statusCode = Number(result.status || 500);
  const attempts = Number(result.attempts || 1);
  const status = statusCode >= 200 && statusCode < 300 ? 'DELIVERED' : 'FAILED';
  const now = new Date();
  const responseBody =
    result.body && typeof result.body === 'object' && !Array.isArray(result.body)
      ? result.body
      : null;

  await db
    .update(callbackDeliveries)
    .set({
      status,
      attempts,
      lastStatusCode: statusCode,
      lastError: status === 'DELIVERED' ? null : String(result.message || 'Callback failed'),
      deliveredAt: status === 'DELIVERED' ? now : null,
    })
    .where(eq(callbackDeliveries.id, deliveryId));

  return { deliveryId, responseBody, ...result };
}
