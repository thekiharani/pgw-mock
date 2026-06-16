import type { FastifyInstance } from 'fastify';

import { requireSession } from '@/plugins/auth.js';
import { adminRoutes } from '@/routes/console/admin.js';
import { collaboratorRoutes } from '@/routes/console/collaborators.js';
import { merchantConsoleRoutes } from '@/routes/console/merchants.js';
import { transactionConsoleRoutes } from '@/routes/console/transactions.js';

export async function consoleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireSession);
  await app.register(merchantConsoleRoutes);
  await app.register(transactionConsoleRoutes);
  await app.register(collaboratorRoutes);
  await app.register(adminRoutes);
}
