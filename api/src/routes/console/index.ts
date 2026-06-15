import type { FastifyInstance } from 'fastify';

import { requireSession } from '@/plugins/auth.js';
import { merchantConsoleRoutes } from '@/routes/console/merchants.js';
import { transactionConsoleRoutes } from '@/routes/console/transactions.js';

export async function consoleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireSession);
  await app.register(merchantConsoleRoutes);
  await app.register(transactionConsoleRoutes);
}
