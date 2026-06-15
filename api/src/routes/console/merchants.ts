import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  createMerchant,
  getMerchantById,
  listMerchants,
  merchantExistsByPaybill,
  merchantExistsByTill,
  softDeleteMerchant,
  updateMerchant,
} from '@/actions/console.js';
import { db } from '@/db/client.js';
import { merchants } from '@/db/schema.js';
import { AppError } from '@/errors.js';
import { toMerchantDto } from '@/routes/console/mappers.js';
import { decimalString, emailStrLike, nonEmptyStr } from '@/schemas/common.js';
import { generateDarajaToken, uuid7 } from '@/utils/generators.js';

type MerchantInsert = typeof merchants.$inferInsert;

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).optional(),
});

const IdParam = z.object({ id: z.string().trim().min(1).max(36) });

const CreateBody = z
  .object({
    name: nonEmptyStr(128),
    email: emailStrLike.nullish(),
    phoneNumber: nonEmptyStr(32).nullish(),
    mpesaPaybillNumber: nonEmptyStr(32),
    sasapayTillNumber: nonEmptyStr(32),
    mpesaConsumerKey: nonEmptyStr(64).nullish(),
    mpesaConsumerSecret: nonEmptyStr(64).nullish(),
    sasapayClientId: nonEmptyStr(64).nullish(),
    sasapayClientSecret: nonEmptyStr(64).nullish(),
    mpesaBalance: decimalString('mpesaBalance', true).optional(),
    sasapayBalance: decimalString('sasapayBalance', true).optional(),
    meta: z.record(z.string(), z.any()).nullish(),
  })
  .strict();

const UpdateBody = z
  .object({
    name: nonEmptyStr(128).optional(),
    email: emailStrLike.nullish(),
    phoneNumber: nonEmptyStr(32).nullish(),
    mpesaConsumerKey: nonEmptyStr(64).nullish(),
    mpesaConsumerSecret: nonEmptyStr(64).nullish(),
    sasapayClientId: nonEmptyStr(64).nullish(),
    sasapayClientSecret: nonEmptyStr(64).nullish(),
    mpesaBalance: decimalString('mpesaBalance', true).optional(),
    sasapayBalance: decimalString('sasapayBalance', true).optional(),
    meta: z.record(z.string(), z.any()).nullish(),
  })
  .strict();

function notFound(): AppError {
  return new AppError({ statusCode: 404, message: 'Merchant not found' });
}

export async function merchantConsoleRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/merchants',
    { schema: { querystring: ListQuery, tags: ['Console'] } },
    async (request) => {
      const { page, pageSize, q } = request.query as z.infer<typeof ListQuery>;
      const { rows, total } = await listMerchants(db, { page, pageSize, q });
      return { data: rows.map(toMerchantDto), page, pageSize, total };
    },
  );

  app.get('/merchants/:id', { schema: { params: IdParam, tags: ['Console'] } }, async (request) => {
    const { id } = request.params as z.infer<typeof IdParam>;
    const row = await getMerchantById(db, id);
    if (!row) throw notFound();
    return toMerchantDto(row);
  });

  app.post(
    '/merchants',
    { schema: { body: CreateBody, tags: ['Console'] } },
    async (request, reply) => {
      const body = request.body as z.infer<typeof CreateBody>;
      if (await merchantExistsByPaybill(db, body.mpesaPaybillNumber)) {
        throw new AppError({ statusCode: 409, message: 'mpesaPaybillNumber already in use' });
      }
      if (await merchantExistsByTill(db, body.sasapayTillNumber)) {
        throw new AppError({ statusCode: 409, message: 'sasapayTillNumber already in use' });
      }
      const id = uuid7();
      await createMerchant(db, {
        id,
        name: body.name,
        email: body.email ?? null,
        phoneNumber: body.phoneNumber ?? null,
        mpesaPaybillNumber: body.mpesaPaybillNumber,
        sasapayTillNumber: body.sasapayTillNumber,
        mpesaConsumerKey: body.mpesaConsumerKey ?? null,
        mpesaConsumerSecret: body.mpesaConsumerSecret ?? null,
        sasapayClientId: body.sasapayClientId ?? null,
        sasapayClientSecret: body.sasapayClientSecret ?? null,
        mpesaBalance: body.mpesaBalance ?? '0',
        sasapayBalance: body.sasapayBalance ?? '0',
        meta: body.meta ?? null,
      });
      const row = await getMerchantById(db, id);
      reply.code(201);
      return toMerchantDto(row!);
    },
  );

  app.patch(
    '/merchants/:id',
    { schema: { params: IdParam, body: UpdateBody, tags: ['Console'] } },
    async (request) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      if (!(await getMerchantById(db, id))) throw notFound();

      const body = request.body as z.infer<typeof UpdateBody>;
      const patch: Partial<MerchantInsert> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.email !== undefined) patch.email = body.email ?? null;
      if (body.phoneNumber !== undefined) patch.phoneNumber = body.phoneNumber ?? null;
      if (body.mpesaConsumerKey !== undefined)
        patch.mpesaConsumerKey = body.mpesaConsumerKey ?? null;
      if (body.mpesaConsumerSecret !== undefined)
        patch.mpesaConsumerSecret = body.mpesaConsumerSecret ?? null;
      if (body.sasapayClientId !== undefined) patch.sasapayClientId = body.sasapayClientId ?? null;
      if (body.sasapayClientSecret !== undefined)
        patch.sasapayClientSecret = body.sasapayClientSecret ?? null;
      if (body.mpesaBalance !== undefined) patch.mpesaBalance = body.mpesaBalance;
      if (body.sasapayBalance !== undefined) patch.sasapayBalance = body.sasapayBalance;
      if (body.meta !== undefined) patch.meta = body.meta ?? null;

      if (Object.keys(patch).length > 0) await updateMerchant(db, id, patch);
      const row = await getMerchantById(db, id);
      return toMerchantDto(row!);
    },
  );

  app.delete(
    '/merchants/:id',
    { schema: { params: IdParam, tags: ['Console'] } },
    async (request) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      const affected = await softDeleteMerchant(db, id);
      if (!affected) throw notFound();
      return { success: true };
    },
  );

  app.post(
    '/merchants/:id/rotate-mpesa-credentials',
    { schema: { params: IdParam, tags: ['Console'] } },
    async (request) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      if (!(await getMerchantById(db, id))) throw notFound();
      const mpesaConsumerKey = generateDarajaToken();
      const mpesaConsumerSecret = generateDarajaToken();
      await updateMerchant(db, id, { mpesaConsumerKey, mpesaConsumerSecret });
      return { mpesaConsumerKey, mpesaConsumerSecret };
    },
  );

  app.post(
    '/merchants/:id/rotate-sasapay-credentials',
    { schema: { params: IdParam, tags: ['Console'] } },
    async (request) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      if (!(await getMerchantById(db, id))) throw notFound();
      const sasapayClientId = generateDarajaToken();
      const sasapayClientSecret = generateDarajaToken();
      await updateMerchant(db, id, { sasapayClientId, sasapayClientSecret });
      return { sasapayClientId, sasapayClientSecret };
    },
  );
}
