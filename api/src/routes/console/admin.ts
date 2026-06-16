import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type {
  AdminOverview,
  AdminUserDetail,
  AdminUserDto,
  PlatformRole,
} from '@shared/dto/admin.js';

import {
  getOverviewCounts,
  getUserById,
  grantMembership,
  listRecentTransactions,
  listUserMemberships,
  listUsers,
  setPlatformRole,
  type AdminUserRow,
} from '@/actions/admin.js';
import { countOwners, removeMember } from '@/actions/console.js';
import { getMembership, requirePlatformAdmin } from '@/auth/access.js';
import { db } from '@/db/client.js';
import { AppError } from '@/errors.js';
import { toIso } from '@/routes/console/mappers.js';
import { uuid7 } from '@/utils/generators.js';

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).optional(),
});

const UserParam = z.object({ userId: z.string().trim().min(1).max(36) });
const AccessParam = UserParam.extend({ merchantId: z.string().trim().min(1).max(36) });
const PlatformRoleBody = z.object({ role: z.enum(['user', 'admin']) }).strict();
const MerchantRoleBody = z
  .object({ role: z.enum(['owner', 'admin', 'member', 'viewer']) })
  .strict();

function toAdminUserDto(row: AdminUserRow): AdminUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    merchantCount: row.merchantCount,
    createdAt: toIso(row.createdAt),
  };
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (request) => {
    requirePlatformAdmin(request.authSession!);
  });

  app.get('/admin/overview', { schema: { tags: ['Console'] } }, async () => {
    const [counts, recent] = await Promise.all([
      getOverviewCounts(db),
      listRecentTransactions(db, 8),
    ]);
    const overview: AdminOverview = {
      ...counts,
      recentTransactions: recent.map((t) => ({
        id: t.id,
        transactionCode: t.transactionCode,
        gateway: t.gateway,
        amount: t.amount,
        status: t.status,
        createdAt: toIso(t.createdAt),
      })),
    };
    return overview;
  });

  app.get(
    '/admin/users',
    { schema: { querystring: ListQuery, tags: ['Console'] } },
    async (request) => {
      const { page, pageSize, q } = request.query as z.infer<typeof ListQuery>;
      const { rows, total } = await listUsers(db, { page, pageSize, q });
      return { data: rows.map(toAdminUserDto), page, pageSize, total };
    },
  );

  app.get(
    '/admin/users/:userId',
    { schema: { params: UserParam, tags: ['Console'] } },
    async (request) => {
      const { userId } = request.params as z.infer<typeof UserParam>;
      const user = await getUserById(db, userId);
      if (!user) throw new AppError({ statusCode: 404, message: 'User not found' });
      const memberships = await listUserMemberships(db, userId);
      const detail: AdminUserDetail = { user: toAdminUserDto(user), memberships };
      return detail;
    },
  );

  app.patch(
    '/admin/users/:userId',
    { schema: { params: UserParam, body: PlatformRoleBody, tags: ['Console'] } },
    async (request) => {
      const { userId } = request.params as z.infer<typeof UserParam>;
      const { role } = request.body as z.infer<typeof PlatformRoleBody>;
      // Guard against locking yourself out of platform admin.
      if (userId === request.authSession!.user.id && role !== 'admin') {
        throw new AppError({ statusCode: 400, message: 'You cannot remove your own admin role' });
      }
      const affected = await setPlatformRole(db, userId, role as PlatformRole);
      if (!affected) throw new AppError({ statusCode: 404, message: 'User not found' });
      return { success: true };
    },
  );

  app.put(
    '/admin/users/:userId/merchants/:merchantId',
    { schema: { params: AccessParam, body: MerchantRoleBody, tags: ['Console'] } },
    async (request) => {
      const { userId, merchantId } = request.params as z.infer<typeof AccessParam>;
      const { role } = request.body as z.infer<typeof MerchantRoleBody>;
      const current = await getMembership(db, merchantId, userId);
      if (current === 'owner' && role !== 'owner' && (await countOwners(db, merchantId)) <= 1) {
        throw new AppError({ statusCode: 400, message: 'A merchant must keep at least one owner' });
      }
      await grantMembership(db, merchantId, userId, role, uuid7());
      return { success: true };
    },
  );

  app.delete(
    '/admin/users/:userId/merchants/:merchantId',
    { schema: { params: AccessParam, tags: ['Console'] } },
    async (request) => {
      const { userId, merchantId } = request.params as z.infer<typeof AccessParam>;
      const current = await getMembership(db, merchantId, userId);
      if (!current) throw new AppError({ statusCode: 404, message: 'Membership not found' });
      if (current === 'owner' && (await countOwners(db, merchantId)) <= 1) {
        throw new AppError({ statusCode: 400, message: 'A merchant must keep at least one owner' });
      }
      await removeMember(db, merchantId, userId);
      return { success: true };
    },
  );
}
