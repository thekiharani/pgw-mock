import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  createMerchantOwnedBy,
  getMerchantById,
  listMerchants,
  merchantExistsByPaybill,
  merchantExistsByTill,
  softDeleteMerchant,
  updateMerchant,
} from '@/actions/console.js';
import { isPlatformAdmin, requireMerchantAccess } from '@/auth/access.js';
import { db } from '@/db/client.js';
import { merchants } from '@/db/schema.js';
import { AppError } from '@/errors.js';
import { toMerchantDto } from '@/routes/console/mappers.js';
import { decimalString, emailStrLike, nonEmptyStr } from '@/schemas/common.js';
import { writeMpesaMeta } from '@/services/capabilities.js';
import { generateDarajaToken, uuid7 } from '@/utils/generators.js';

type MerchantInsert = typeof merchants.$inferInsert;

const Capabilities = z.array(z.enum(['c2b', 'b2c', 'b2b'])).max(3);
const ShortcodeKindSchema = z.enum(['TILL', 'PAYBILL']);

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
    shortcodeKind: ShortcodeKindSchema.optional(),
    capabilities: Capabilities.optional(),
    meta: z.record(z.string(), z.any()).nullish(),
  })
  .strict();

const UpdateBody = z
  .object({
    name: nonEmptyStr(128).optional(),
    email: emailStrLike.nullish(),
    phoneNumber: nonEmptyStr(32).nullish(),
    mpesaPaybillNumber: nonEmptyStr(32).optional(),
    sasapayTillNumber: nonEmptyStr(32).optional(),
    mpesaConsumerKey: nonEmptyStr(64).nullish(),
    mpesaConsumerSecret: nonEmptyStr(64).nullish(),
    sasapayClientId: nonEmptyStr(64).nullish(),
    sasapayClientSecret: nonEmptyStr(64).nullish(),
    mpesaBalance: decimalString('mpesaBalance', true).optional(),
    sasapayBalance: decimalString('sasapayBalance', true).optional(),
    shortcodeKind: ShortcodeKindSchema.optional(),
    capabilities: Capabilities.optional(),
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
      const session = request.authSession!;
      const { rows, total } = await listMerchants(db, {
        page,
        pageSize,
        q,
        userId: session.user.id,
        isAdmin: isPlatformAdmin(session),
      });
      return { data: rows.map((row) => toMerchantDto(row, row.myRole)), page, pageSize, total };
    },
  );

  app.get('/merchants/:id', { schema: { params: IdParam, tags: ['Console'] } }, async (request) => {
    const { id } = request.params as z.infer<typeof IdParam>;
    const myRole = await requireMerchantAccess(db, request.authSession!, id, 'viewer');
    const row = await getMerchantById(db, id);
    if (!row) throw notFound();
    return toMerchantDto(row, myRole);
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
      await createMerchantOwnedBy(
        db,
        {
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
          meta:
            body.capabilities !== undefined || body.shortcodeKind !== undefined
              ? writeMpesaMeta(body.meta ?? null, {
                  capabilities: body.capabilities,
                  shortcodeKind: body.shortcodeKind,
                })
              : (body.meta ?? null),
        },
        request.authSession!.user.id,
        uuid7(),
      );
      const row = await getMerchantById(db, id);
      reply.code(201);
      return toMerchantDto(row!, 'owner');
    },
  );

  app.patch(
    '/merchants/:id',
    { schema: { params: IdParam, body: UpdateBody, tags: ['Console'] } },
    async (request) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      const myRole = await requireMerchantAccess(db, request.authSession!, id, 'admin');

      const existing = await getMerchantById(db, id);
      if (!existing) throw notFound();

      const body = request.body as z.infer<typeof UpdateBody>;
      const patch: Partial<MerchantInsert> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.email !== undefined) patch.email = body.email ?? null;
      if (body.phoneNumber !== undefined) patch.phoneNumber = body.phoneNumber ?? null;
      if (
        body.mpesaPaybillNumber !== undefined &&
        body.mpesaPaybillNumber !== existing.mpesaPaybillNumber
      ) {
        if (await merchantExistsByPaybill(db, body.mpesaPaybillNumber, id)) {
          throw new AppError({ statusCode: 409, message: 'mpesaPaybillNumber already in use' });
        }
        patch.mpesaPaybillNumber = body.mpesaPaybillNumber;
      }
      if (
        body.sasapayTillNumber !== undefined &&
        body.sasapayTillNumber !== existing.sasapayTillNumber
      ) {
        if (await merchantExistsByTill(db, body.sasapayTillNumber, id)) {
          throw new AppError({ statusCode: 409, message: 'sasapayTillNumber already in use' });
        }
        patch.sasapayTillNumber = body.sasapayTillNumber;
      }
      if (body.mpesaConsumerKey !== undefined)
        patch.mpesaConsumerKey = body.mpesaConsumerKey ?? null;
      if (body.mpesaConsumerSecret !== undefined)
        patch.mpesaConsumerSecret = body.mpesaConsumerSecret ?? null;
      if (body.sasapayClientId !== undefined) patch.sasapayClientId = body.sasapayClientId ?? null;
      if (body.sasapayClientSecret !== undefined)
        patch.sasapayClientSecret = body.sasapayClientSecret ?? null;
      if (body.mpesaBalance !== undefined) patch.mpesaBalance = body.mpesaBalance;
      if (body.sasapayBalance !== undefined) patch.sasapayBalance = body.sasapayBalance;

      // `meta` may be replaced wholesale, while capabilities/kind merge into the
      // existing mpesa block so registered c2b URLs survive.
      let nextMeta = body.meta !== undefined ? (body.meta ?? null) : existing.meta;
      if (body.capabilities !== undefined || body.shortcodeKind !== undefined) {
        nextMeta = writeMpesaMeta(nextMeta, {
          capabilities: body.capabilities,
          shortcodeKind: body.shortcodeKind,
        });
      }
      if (
        body.meta !== undefined ||
        body.capabilities !== undefined ||
        body.shortcodeKind !== undefined
      ) {
        patch.meta = nextMeta;
      }

      if (Object.keys(patch).length > 0) await updateMerchant(db, id, patch);
      const row = await getMerchantById(db, id);
      return toMerchantDto(row!, myRole);
    },
  );

  app.delete(
    '/merchants/:id',
    { schema: { params: IdParam, tags: ['Console'] } },
    async (request) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      await requireMerchantAccess(db, request.authSession!, id, 'owner');
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
      await requireMerchantAccess(db, request.authSession!, id, 'member');
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
      await requireMerchantAccess(db, request.authSession!, id, 'member');
      const sasapayClientId = generateDarajaToken();
      const sasapayClientSecret = generateDarajaToken();
      await updateMerchant(db, id, { sasapayClientId, sasapayClientSecret });
      return { sasapayClientId, sasapayClientSecret };
    },
  );
}
