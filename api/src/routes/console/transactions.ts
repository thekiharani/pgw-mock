import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { listTransactions } from '@/actions/console.js';
import { db } from '@/db/client.js';
import { toTransactionDto } from '@/routes/console/mappers.js';

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  merchantId: z.string().trim().min(1).optional(),
  gateway: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
});

export async function transactionConsoleRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/transactions',
    { schema: { querystring: ListQuery, tags: ['Console'] } },
    async (request) => {
      const { page, pageSize, merchantId, gateway, status, q } = request.query as z.infer<
        typeof ListQuery
      >;
      const { rows, total } = await listTransactions(db, {
        page,
        pageSize,
        merchantId,
        gateway,
        status,
        q,
      });
      return { data: rows.map(toTransactionDto), page, pageSize, total };
    },
  );
}
