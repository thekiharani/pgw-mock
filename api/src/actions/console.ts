import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import type { MerchantRole } from '@shared/dto/member.js';

import type { Executor } from '@/db/client.js';
import {
  merchantInvitations,
  merchantMembers,
  merchants,
  transactions,
  users,
} from '@/db/schema.js';

type MerchantInsert = typeof merchants.$inferInsert;
type MerchantRow = typeof merchants.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

export type ScopedMerchantRow = MerchantRow & { myRole: MerchantRole | null };

function affectedRows(result: { rowCount: number | null }): number {
  return result.rowCount ?? 0;
}

export interface MerchantListOptions {
  page: number;
  pageSize: number;
  q?: string | null;
  // Scope: platform admins (isAdmin) see every merchant as 'owner'; everyone
  // else sees only merchants they belong to, tagged with their own role.
  userId: string;
  isAdmin: boolean;
}

export async function listMerchants(
  exec: Executor,
  opts: MerchantListOptions,
): Promise<{ rows: ScopedMerchantRow[]; total: number }> {
  const conditions: SQL[] = [isNull(merchants.deletedAt)];
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(merchants.name, pattern),
        ilike(merchants.email, pattern),
        ilike(merchants.mpesaPaybillNumber, pattern),
        ilike(merchants.sasapayTillNumber, pattern),
      )!,
    );
  }

  if (opts.isAdmin) {
    const where = and(...conditions);
    const rows = await exec
      .select()
      .from(merchants)
      .where(where)
      .orderBy(desc(merchants.createdAt))
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize);
    const counted = await exec
      .select({ count: sql<number>`count(*)` })
      .from(merchants)
      .where(where);
    return {
      rows: rows.map((row) => ({ ...row, myRole: 'owner' as MerchantRole })),
      total: Number(counted[0]?.count ?? 0),
    };
  }

  conditions.push(eq(merchantMembers.userId, opts.userId));
  const where = and(...conditions);
  const rows = await exec
    .select({ merchant: merchants, role: merchantMembers.role })
    .from(merchants)
    .innerJoin(merchantMembers, eq(merchantMembers.merchantId, merchants.id))
    .where(where)
    .orderBy(desc(merchants.createdAt))
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);
  const counted = await exec
    .select({ count: sql<number>`count(*)` })
    .from(merchants)
    .innerJoin(merchantMembers, eq(merchantMembers.merchantId, merchants.id))
    .where(where);
  return {
    rows: rows.map((row) => ({ ...row.merchant, myRole: row.role })),
    total: Number(counted[0]?.count ?? 0),
  };
}

export async function getMerchantById(exec: Executor, id: string): Promise<MerchantRow | null> {
  const rows = await exec
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, id), isNull(merchants.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function merchantExistsByPaybill(exec: Executor, paybill: string): Promise<boolean> {
  const rows = await exec
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.mpesaPaybillNumber, paybill))
    .limit(1);
  return rows.length > 0;
}

export async function merchantExistsByTill(exec: Executor, till: string): Promise<boolean> {
  const rows = await exec
    .select({ id: merchants.id })
    .from(merchants)
    .where(eq(merchants.sasapayTillNumber, till))
    .limit(1);
  return rows.length > 0;
}

export async function createMerchant(exec: Executor, values: MerchantInsert): Promise<void> {
  await exec.insert(merchants).values(values);
}

// Create the merchant and make the creator its owner in one transaction.
export async function createMerchantOwnedBy(
  exec: Executor,
  values: MerchantInsert,
  ownerUserId: string,
  newMemberId: string,
): Promise<void> {
  await exec.transaction(async (tx) => {
    await tx.insert(merchants).values(values);
    await tx
      .insert(merchantMembers)
      .values({ id: newMemberId, merchantId: values.id, userId: ownerUserId, role: 'owner' });
  });
}

export async function updateMerchant(
  exec: Executor,
  id: string,
  patch: Partial<MerchantInsert>,
): Promise<void> {
  await exec
    .update(merchants)
    .set(patch)
    .where(and(eq(merchants.id, id), isNull(merchants.deletedAt)));
}

export async function softDeleteMerchant(exec: Executor, id: string): Promise<number> {
  const result = await exec
    .update(merchants)
    .set({ deletedAt: new Date() })
    .where(and(eq(merchants.id, id), isNull(merchants.deletedAt)));
  return affectedRows(result);
}

export interface TransactionListOptions {
  page: number;
  pageSize: number;
  merchantId?: string | null;
  gateway?: string | null;
  status?: string | null;
  q?: string | null;
  userId: string;
  isAdmin: boolean;
}

export async function listTransactions(
  exec: Executor,
  opts: TransactionListOptions,
): Promise<{ rows: TransactionRow[]; total: number }> {
  const conditions: SQL[] = [isNull(transactions.deletedAt)];
  if (!opts.isAdmin) {
    conditions.push(
      inArray(
        transactions.merchantId,
        exec
          .select({ id: merchantMembers.merchantId })
          .from(merchantMembers)
          .where(eq(merchantMembers.userId, opts.userId)),
      ),
    );
  }
  if (opts.merchantId) conditions.push(eq(transactions.merchantId, opts.merchantId));
  if (opts.gateway) conditions.push(eq(transactions.gateway, opts.gateway));
  if (opts.status) conditions.push(eq(transactions.status, opts.status));
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    conditions.push(
      or(
        ilike(transactions.transactionCode, pattern),
        ilike(transactions.merchantReference, pattern),
      )!,
    );
  }
  const where = and(...conditions);
  const rows = await exec
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(transactions.createdAt))
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);
  const counted = await exec
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(where);
  return { rows, total: Number(counted[0]?.count ?? 0) };
}

// --- Collaboration: members & invitations ---

type InvitationInsert = typeof merchantInvitations.$inferInsert;
type InvitationRow = typeof merchantInvitations.$inferSelect;

const ROLE_RANK: Record<MerchantRole, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

export interface MemberWithUser {
  userId: string;
  name: string;
  email: string;
  role: MerchantRole;
  createdAt: Date | string | null;
}

export async function listMembers(exec: Executor, merchantId: string): Promise<MemberWithUser[]> {
  return exec
    .select({
      userId: merchantMembers.userId,
      name: users.name,
      email: users.email,
      role: merchantMembers.role,
      createdAt: merchantMembers.createdAt,
    })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(eq(merchantMembers.merchantId, merchantId))
    .orderBy(merchantMembers.role, merchantMembers.createdAt);
}

export interface InvitationWithInviter {
  id: string;
  email: string;
  role: MerchantRole;
  status: string;
  invitedByName: string | null;
  expiresAt: Date | string | null;
  createdAt: Date | string | null;
}

export async function listPendingInvitations(
  exec: Executor,
  merchantId: string,
): Promise<InvitationWithInviter[]> {
  return exec
    .select({
      id: merchantInvitations.id,
      email: merchantInvitations.email,
      role: merchantInvitations.role,
      status: merchantInvitations.status,
      invitedByName: users.name,
      expiresAt: merchantInvitations.expiresAt,
      createdAt: merchantInvitations.createdAt,
    })
    .from(merchantInvitations)
    .leftJoin(users, eq(users.id, merchantInvitations.invitedBy))
    .where(
      and(
        eq(merchantInvitations.merchantId, merchantId),
        eq(merchantInvitations.status, 'pending'),
      ),
    )
    .orderBy(desc(merchantInvitations.createdAt));
}

export async function getUserByEmail(
  exec: Executor,
  email: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const rows = await exec
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

export async function setMemberRole(
  exec: Executor,
  merchantId: string,
  userId: string,
  role: MerchantRole,
): Promise<number> {
  const result = await exec
    .update(merchantMembers)
    .set({ role })
    .where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, userId)));
  return affectedRows(result);
}

export async function removeMember(
  exec: Executor,
  merchantId: string,
  userId: string,
): Promise<number> {
  const result = await exec
    .delete(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.userId, userId)));
  return affectedRows(result);
}

export async function countOwners(exec: Executor, merchantId: string): Promise<number> {
  const rows = await exec
    .select({ count: sql<number>`count(*)` })
    .from(merchantMembers)
    .where(and(eq(merchantMembers.merchantId, merchantId), eq(merchantMembers.role, 'owner')));
  return Number(rows[0]?.count ?? 0);
}

export async function createInvitation(exec: Executor, values: InvitationInsert): Promise<void> {
  // Replace any prior pending invite for the same (merchant, email) so the
  // partial unique index never collides and only the newest token is live.
  await exec
    .update(merchantInvitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(merchantInvitations.merchantId, values.merchantId),
        eq(merchantInvitations.email, values.email),
        eq(merchantInvitations.status, 'pending'),
      ),
    );
  await exec.insert(merchantInvitations).values(values);
}

export interface InvitationWithMerchant {
  invitation: InvitationRow;
  merchantName: string;
}

export async function getInvitationByToken(
  exec: Executor,
  token: string,
): Promise<InvitationWithMerchant | null> {
  const rows = await exec
    .select({ invitation: merchantInvitations, merchantName: merchants.name })
    .from(merchantInvitations)
    .innerJoin(merchants, eq(merchants.id, merchantInvitations.merchantId))
    .where(eq(merchantInvitations.token, token))
    .limit(1);
  return rows[0] ?? null;
}

export async function revokeInvitation(
  exec: Executor,
  merchantId: string,
  invitationId: string,
): Promise<number> {
  const result = await exec
    .update(merchantInvitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(merchantInvitations.id, invitationId),
        eq(merchantInvitations.merchantId, merchantId),
        eq(merchantInvitations.status, 'pending'),
      ),
    );
  return affectedRows(result);
}

// Mark the invite accepted and grant membership, never downgrading a role the
// user already holds.
export async function acceptInvitation(
  exec: Executor,
  invitation: InvitationRow,
  userId: string,
  newMemberId: string,
): Promise<void> {
  await exec.transaction(async (tx) => {
    await tx
      .update(merchantInvitations)
      .set({ status: 'accepted', acceptedBy: userId, acceptedAt: new Date() })
      .where(eq(merchantInvitations.id, invitation.id));

    const existing = await tx
      .select({ role: merchantMembers.role })
      .from(merchantMembers)
      .where(
        and(
          eq(merchantMembers.merchantId, invitation.merchantId),
          eq(merchantMembers.userId, userId),
        ),
      )
      .limit(1);

    const current = existing[0]?.role;
    if (!current) {
      await tx.insert(merchantMembers).values({
        id: newMemberId,
        merchantId: invitation.merchantId,
        userId,
        role: invitation.role,
      });
    } else if (ROLE_RANK[invitation.role] > ROLE_RANK[current]) {
      await tx
        .update(merchantMembers)
        .set({ role: invitation.role })
        .where(
          and(
            eq(merchantMembers.merchantId, invitation.merchantId),
            eq(merchantMembers.userId, userId),
          ),
        );
    }
  });
}
