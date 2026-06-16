import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { settings } from '@/config.js';
import { db } from '@/db/client.js';
import { DependencyUnavailableError } from '@/errors.js';
import { getMerchantByMpesaPaybill } from '@/actions/mpesaQueries.js';
import { getMerchantBySasapayTill } from '@/actions/sasapayQueries.js';
import { DateUtils } from '@/utils/dateUtils.js';
import { PaymentsUtils } from '@/utils/payments.js';

function numericMerchant(row: Record<string, any> | null): Record<string, any> | null {
  if (!row) return null;
  return { ...row, merchant_balance: Number(row.merchant_balance) };
}

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  // When the dashboard is served, `/` belongs to the SPA, not this JSON root.
  if (!settings.SERVE_DASHBOARD) {
    app.get('/', async (request) => {
      const mpesaMerchant = await getMerchantByMpesaPaybill(db, '887001');
      const sasapayMerchant = await getMerchantBySasapayTill(db, '888000');
      return {
        mpesaMerchant: numericMerchant(mpesaMerchant),
        sasaPayMerchant: numericMerchant(sasapayMerchant),
        message: 'Welcome to Noria Payments API Mock Server',
        IP: request.ip ?? null,
        app_url: settings.SERVICE_URL,
        agent: request.headers['user-agent'] ?? null,
        datePrefix: DateUtils.datePrefix(),
        mpesaCode: PaymentsUtils.generateTransactionCode(),
        timestamp: PaymentsUtils.generateTimestamp(),
      };
    });
  }

  app.get('/healthz', async () => ({ status: true }));

  app.get('/readyz', async () => {
    try {
      await db.execute(sql`SELECT 1`);
      return { status: true, ready: true, database: true };
    } catch (exc) {
      app.log.warn(`Readiness check failed: ${exc}`);
      throw new DependencyUnavailableError({
        dependency: 'database',
        message: 'Database is unavailable',
      });
    }
  });
}
