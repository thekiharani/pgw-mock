import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type {
  InvitationDto,
  InvitationPreview,
  MemberDto,
  MerchantRole,
} from '@shared/dto/member.js';

import {
  acceptInvitation,
  countOwners,
  createInvitation,
  getInvitationByToken,
  getUserByEmail,
  listMembers,
  listPendingInvitations,
  removeMember,
  revokeInvitation,
  setMemberRole,
  type InvitationWithInviter,
  type MemberWithUser,
} from '@/actions/console.js';
import { getMembership, requireMerchantAccess } from '@/auth/access.js';
import { settings } from '@/config.js';
import { db } from '@/db/client.js';
import { merchants } from '@/db/schema.js';
import { AppError } from '@/errors.js';
import { sendMail } from '@/mail/index.js';
import { renderInvitationEmail } from '@/mail/templates/index.js';
import { toIso } from '@/routes/console/mappers.js';
import { generateDarajaToken, uuid7 } from '@/utils/generators.js';

const IdParam = z.object({ id: z.string().trim().min(1).max(36) });
const MemberParam = IdParam.extend({ userId: z.string().trim().min(1).max(36) });
const InvitationParam = IdParam.extend({ invitationId: z.string().trim().min(1).max(36) });
const TokenParam = z.object({ token: z.string().trim().min(1).max(64) });

const Role = z.enum(['owner', 'admin', 'member', 'viewer']);
const InviteBody = z.object({ email: z.string().trim().email().max(256), role: Role }).strict();
const RoleBody = z.object({ role: Role }).strict();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toMemberDto(row: MemberWithUser, selfUserId: string): MemberDto {
  return {
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
    isYou: row.userId === selfUserId,
    createdAt: toIso(row.createdAt),
  };
}

function toInvitationDto(row: InvitationWithInviter): InvitationDto {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status as InvitationDto['status'],
    invitedByName: row.invitedByName,
    expiresAt: toIso(row.expiresAt),
    createdAt: toIso(row.createdAt),
  };
}

// Only an owner (or platform admin, who resolves to 'owner') may grant or touch
// an owner/admin role. Admins are limited to managing member/viewer.
function assertCanManageRole(callerRole: MerchantRole, targetRole: MerchantRole): void {
  if ((targetRole === 'owner' || targetRole === 'admin') && callerRole !== 'owner') {
    throw new AppError({
      statusCode: 403,
      message: 'Only an owner can manage owner or admin roles',
    });
  }
}

export async function collaboratorRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/merchants/:id/members',
    { schema: { params: IdParam, tags: ['Console'] } },
    async (request) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      const session = request.authSession!;
      const myRole = await requireMerchantAccess(db, session, id, 'viewer');
      const [members, invitations] = await Promise.all([
        listMembers(db, id),
        listPendingInvitations(db, id),
      ]);
      return {
        members: members.map((m) => toMemberDto(m, session.user.id)),
        invitations: invitations.map(toInvitationDto),
        myRole,
      };
    },
  );

  app.post(
    '/merchants/:id/invitations',
    { schema: { params: IdParam, body: InviteBody, tags: ['Console'] } },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof IdParam>;
      const session = request.authSession!;
      const callerRole = await requireMerchantAccess(db, session, id, 'admin');
      const { email, role } = request.body as z.infer<typeof InviteBody>;
      assertCanManageRole(callerRole, role);

      const normalizedEmail = email.toLowerCase();
      const existingUser = await getUserByEmail(db, normalizedEmail);
      if (existingUser && (await getMembership(db, id, existingUser.id))) {
        throw new AppError({ statusCode: 409, message: 'That user is already a member' });
      }

      const token = generateDarajaToken() + generateDarajaToken().slice(0, 8);
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const invitationId = uuid7();
      await createInvitation(db, {
        id: invitationId,
        merchantId: id,
        email: normalizedEmail,
        role,
        token,
        status: 'pending',
        invitedBy: session.user.id,
        expiresAt,
      });

      const acceptUrl = `${settings.DASHBOARD_URL.replace(/\/$/, '')}/invite/${token}`;
      try {
        const { html, text } = await renderInvitationEmail({
          merchantName: (await requireMerchantName(id)) ?? 'a merchant',
          role,
          inviterName: session.user.name,
          acceptUrl,
        });
        await sendMail({
          to: normalizedEmail,
          subject: 'You’ve been invited to Noria Payments',
          text,
          html,
        });
      } catch (err) {
        request.log.error({ err }, 'Failed to send invitation email');
      }

      reply.code(201);
      const dto: InvitationDto = {
        id: invitationId,
        email: normalizedEmail,
        role,
        status: 'pending',
        invitedByName: session.user.name,
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
      };
      return dto;
    },
  );

  app.delete(
    '/merchants/:id/invitations/:invitationId',
    { schema: { params: InvitationParam, tags: ['Console'] } },
    async (request) => {
      const { id, invitationId } = request.params as z.infer<typeof InvitationParam>;
      await requireMerchantAccess(db, request.authSession!, id, 'admin');
      const affected = await revokeInvitation(db, id, invitationId);
      if (!affected) throw new AppError({ statusCode: 404, message: 'Invitation not found' });
      return { success: true };
    },
  );

  app.patch(
    '/merchants/:id/members/:userId',
    { schema: { params: MemberParam, body: RoleBody, tags: ['Console'] } },
    async (request) => {
      const { id, userId } = request.params as z.infer<typeof MemberParam>;
      const session = request.authSession!;
      const callerRole = await requireMerchantAccess(db, session, id, 'admin');
      const { role } = request.body as z.infer<typeof RoleBody>;

      const targetRole = await getMembership(db, id, userId);
      if (!targetRole) throw new AppError({ statusCode: 404, message: 'Member not found' });
      assertCanManageRole(callerRole, targetRole);
      assertCanManageRole(callerRole, role);

      if (targetRole === 'owner' && role !== 'owner' && (await countOwners(db, id)) <= 1) {
        throw new AppError({
          statusCode: 400,
          message: 'A merchant must keep at least one owner',
        });
      }

      await setMemberRole(db, id, userId, role);
      return { success: true };
    },
  );

  app.delete(
    '/merchants/:id/members/:userId',
    { schema: { params: MemberParam, tags: ['Console'] } },
    async (request) => {
      const { id, userId } = request.params as z.infer<typeof MemberParam>;
      const session = request.authSession!;
      const isSelf = userId === session.user.id;

      if (isSelf) {
        const myRole = await requireMerchantAccess(db, session, id, 'viewer');
        if (myRole === 'owner' && (await countOwners(db, id)) <= 1) {
          throw new AppError({
            statusCode: 400,
            message: 'Transfer ownership before leaving — a merchant needs an owner',
          });
        }
      } else {
        const callerRole = await requireMerchantAccess(db, session, id, 'admin');
        const targetRole = await getMembership(db, id, userId);
        if (!targetRole) throw new AppError({ statusCode: 404, message: 'Member not found' });
        assertCanManageRole(callerRole, targetRole);
        if (targetRole === 'owner' && (await countOwners(db, id)) <= 1) {
          throw new AppError({
            statusCode: 400,
            message: 'A merchant must keep at least one owner',
          });
        }
      }

      await removeMember(db, id, userId);
      return { success: true };
    },
  );

  // Invitation preview + accept. Session is required (the console preHandler) but
  // membership is not — that is exactly what acceptance establishes.
  app.get(
    '/invitations/:token',
    { schema: { params: TokenParam, tags: ['Console'] } },
    async (request) => {
      const { token } = request.params as z.infer<typeof TokenParam>;
      const session = request.authSession!;
      const found = await getInvitationByToken(db, token);
      if (!found) throw new AppError({ statusCode: 404, message: 'Invitation not found' });
      assertInviteEmailMatches(found.invitation.email, session.user.email);

      const expiresAt = found.invitation.expiresAt;
      const expired =
        found.invitation.status === 'pending' &&
        expiresAt != null &&
        new Date(expiresAt).getTime() < Date.now();
      const preview: InvitationPreview = {
        merchantName: found.merchantName,
        email: found.invitation.email,
        role: found.invitation.role,
        status: found.invitation.status as InvitationPreview['status'],
        expired,
      };
      return preview;
    },
  );

  app.post(
    '/invitations/:token/accept',
    { schema: { params: TokenParam, tags: ['Console'] } },
    async (request) => {
      const { token } = request.params as z.infer<typeof TokenParam>;
      const session = request.authSession!;
      const found = await getInvitationByToken(db, token);
      if (!found) throw new AppError({ statusCode: 404, message: 'Invitation not found' });
      const inv = found.invitation;
      assertInviteEmailMatches(inv.email, session.user.email);

      if (inv.status !== 'pending') {
        throw new AppError({ statusCode: 400, message: 'This invitation is no longer valid' });
      }
      if (inv.expiresAt != null && new Date(inv.expiresAt).getTime() < Date.now()) {
        throw new AppError({ statusCode: 400, message: 'This invitation has expired' });
      }

      await acceptInvitation(db, inv, session.user.id, uuid7());
      return { success: true, merchantId: inv.merchantId };
    },
  );
}

function assertInviteEmailMatches(inviteEmail: string, sessionEmail: string): void {
  if (inviteEmail.toLowerCase() !== sessionEmail.toLowerCase()) {
    throw new AppError({
      statusCode: 403,
      message: 'This invitation was sent to a different email address',
    });
  }
}

async function requireMerchantName(merchantId: string): Promise<string | null> {
  const rows = await db
    .select({ name: merchants.name })
    .from(merchants)
    .where(eq(merchants.id, merchantId))
    .limit(1);
  return rows[0]?.name ?? null;
}
