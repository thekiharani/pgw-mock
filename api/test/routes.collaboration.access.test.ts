import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client.js';
import { merchantInvitations } from '@/db/schema.js';
import { getApp } from '@test/helpers/app.js';
import { acceptInvite, addMember, createMerchant, invite, signIn } from '@test/helpers/console.js';

const OWNER = 'access-owner@example.com';
const OWNER2 = 'access-owner2@example.com';
const ADMIN = 'access-admin@example.com';
const MEMBER = 'access-member@example.com';
const VIEWER = 'access-viewer@example.com';
const OUTSIDER = 'access-outsider@example.com';
const PLATFORM_ADMIN = 'admin@noria.co.ke';

// Cookies for a stable pool of users. seedDatabase() wipes merchants (and their
// memberships) before every test, so each test rebuilds the team it needs from
// these long-lived sessions.
let owner: string;
let owner2: string;
let admin: string;
let member: string;
let viewer: string;
let outsider: string;
let platformAdmin: string;

async function memberRole(
  merchantId: string,
  cookie: string,
  email: string,
): Promise<string | undefined> {
  const app = await getApp();
  const res = await app.inject({
    method: 'GET',
    url: `/api/console/merchants/${merchantId}/members`,
    headers: { cookie },
  });
  return res.json().members.find((m: { email: string }) => m.email === email)?.role;
}

async function ownerUserId(merchantId: string, cookie: string): Promise<string> {
  const app = await getApp();
  const res = await app.inject({
    method: 'GET',
    url: `/api/console/merchants/${merchantId}/members`,
    headers: { cookie },
  });
  return res.json().members.find((m: { role: string }) => m.role === 'owner').userId as string;
}

beforeAll(async () => {
  // Sign in sequentially: signIn() installs a console.info spy to read the OTP,
  // and concurrent spies on the same global would cross-contaminate.
  owner = await signIn(OWNER);
  owner2 = await signIn(OWNER2);
  admin = await signIn(ADMIN);
  member = await signIn(MEMBER);
  viewer = await signIn(VIEWER);
  outsider = await signIn(OUTSIDER);
  platformAdmin = await signIn(PLATFORM_ADMIN);
});

describe('invitation role-management guards', () => {
  it('lets an admin invite a viewer but not an admin or owner', async () => {
    const id = await createMerchant(owner);
    await addMember(id, owner, ADMIN, admin, 'admin');

    const asViewer = await invite(id, admin, 'fresh-viewer@example.com', 'viewer');
    expect(asViewer.status).toBe(201);

    const asAdmin = await invite(id, admin, 'would-be-admin@example.com', 'admin');
    expect(asAdmin.status).toBe(403);

    const asOwner = await invite(id, admin, 'would-be-owner@example.com', 'owner');
    expect(asOwner.status).toBe(403);
  });

  it('forbids a member from inviting at all', async () => {
    const id = await createMerchant(owner);
    await addMember(id, owner, MEMBER, member, 'member');

    const res = await invite(id, member, 'someone@example.com', 'viewer');
    expect(res.status).toBe(403);
  });

  it('rejects inviting a user who is already a member', async () => {
    const id = await createMerchant(owner);
    await addMember(id, owner, MEMBER, member, 'member');

    const res = await invite(id, owner, MEMBER, 'viewer');
    expect(res.status).toBe(409);
  });

  it('invites a brand-new email that has no account yet', async () => {
    const id = await createMerchant(owner);
    const res = await invite(id, owner, 'never-seen-before@example.com', 'member');
    expect(res.status).toBe(201);
    expect(res.token).toBeTruthy();
  });
});

describe('invitation revocation', () => {
  it('revokes a pending invitation and drops it from the pending list', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    const invited = await invite(id, owner, 'to-revoke@example.com', 'member');
    expect(invited.status).toBe(201);
    const invitationId = invited.body.id as string;

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${id}/invitations/${invitationId}`,
      headers: { cookie: owner },
    });
    expect(revoke.statusCode).toBe(200);

    const members = await app.inject({
      method: 'GET',
      url: `/api/console/merchants/${id}/members`,
      headers: { cookie: owner },
    });
    expect(members.json().invitations).toHaveLength(0);
  });

  it('returns 404 revoking an unknown invitation', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${id}/invitations/does-not-exist`,
      headers: { cookie: owner },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('member role changes', () => {
  it('returns 404 changing the role of a non-member', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/console/merchants/${id}/members/no-such-user`,
      headers: { cookie: owner, 'content-type': 'application/json' },
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('lets an owner promote a member to admin', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    await addMember(id, owner, MEMBER, member, 'member');
    const memberId = (await memberRoleUserId(id, owner, MEMBER)) as string;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/console/merchants/${id}/members/${memberId}`,
      headers: { cookie: owner, 'content-type': 'application/json' },
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(200);
    expect(await memberRole(id, owner, MEMBER)).toBe('admin');
  });

  it('forbids an admin from promoting a member to admin', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    await addMember(id, owner, ADMIN, admin, 'admin');
    await addMember(id, owner, MEMBER, member, 'member');
    const memberId = (await memberRoleUserId(id, owner, MEMBER)) as string;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/console/merchants/${id}/members/${memberId}`,
      headers: { cookie: admin, 'content-type': 'application/json' },
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('forbids an admin from touching another admin', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    await addMember(id, owner, ADMIN, admin, 'admin');
    await addMember(id, owner, OWNER2, owner2, 'admin');
    const otherAdminId = (await memberRoleUserId(id, owner, OWNER2)) as string;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/console/merchants/${id}/members/${otherAdminId}`,
      headers: { cookie: admin, 'content-type': 'application/json' },
      payload: { role: 'member' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('refuses to demote the last remaining owner', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    const soleOwnerId = await ownerUserId(id, owner);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/console/merchants/${id}/members/${soleOwnerId}`,
      headers: { cookie: owner, 'content-type': 'application/json' },
      payload: { role: 'member' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('allows demoting an owner when another owner remains', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    await addMember(id, owner, OWNER2, owner2, 'owner');
    const secondOwnerId = (await memberRoleUserId(id, owner, OWNER2)) as string;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/console/merchants/${id}/members/${secondOwnerId}`,
      headers: { cookie: owner, 'content-type': 'application/json' },
      payload: { role: 'member' },
    });
    expect(res.statusCode).toBe(200);
    expect(await memberRole(id, owner, OWNER2)).toBe('member');
  });
});

describe('member removal', () => {
  it('lets a member leave on their own', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    await addMember(id, owner, MEMBER, member, 'member');
    const memberId = (await memberRoleUserId(id, owner, MEMBER)) as string;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${id}/members/${memberId}`,
      headers: { cookie: member },
    });
    expect(res.statusCode).toBe(200);
  });

  it('stops the sole owner from leaving', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    const soleOwnerId = await ownerUserId(id, owner);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${id}/members/${soleOwnerId}`,
      headers: { cookie: owner },
    });
    expect(res.statusCode).toBe(400);
  });

  it('lets an admin remove a member but not an owner', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    await addMember(id, owner, ADMIN, admin, 'admin');
    await addMember(id, owner, MEMBER, member, 'member');
    const memberId = (await memberRoleUserId(id, owner, MEMBER)) as string;
    const theOwnerId = await ownerUserId(id, owner);

    const removeMember = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${id}/members/${memberId}`,
      headers: { cookie: admin },
    });
    expect(removeMember.statusCode).toBe(200);

    const removeOwner = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${id}/members/${theOwnerId}`,
      headers: { cookie: admin },
    });
    expect(removeOwner.statusCode).toBe(403);
  });

  it('returns 404 removing a non-member', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    await addMember(id, owner, ADMIN, admin, 'admin');

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${id}/members/no-such-user`,
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(404);
  });

  it('blocks a platform admin from removing the sole owner', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    const soleOwnerId = await ownerUserId(id, owner);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${id}/members/${soleOwnerId}`,
      headers: { cookie: platformAdmin },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('invitation acceptance edge cases', () => {
  it('rejects an invitation whose email differs from the session', async () => {
    const id = await createMerchant(owner);
    const invited = await invite(id, owner, 'someone-else@example.com', 'member');
    expect(invited.token).toBeTruthy();

    // outsider's session email does not match the invite recipient.
    const status = await acceptInvite(invited.token!, outsider);
    expect(status).toBe(403);
  });

  it('rejects re-accepting an already accepted invitation', async () => {
    const id = await createMerchant(owner);
    const invited = await invite(id, owner, MEMBER, 'member');
    expect(await acceptInvite(invited.token!, member)).toBe(200);
    expect(await acceptInvite(invited.token!, member)).toBe(400);
  });

  it('rejects accepting an expired invitation', async () => {
    const id = await createMerchant(owner);
    const invited = await invite(id, owner, VIEWER, 'viewer');
    await db
      .update(merchantInvitations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(merchantInvitations.token, invited.token!));

    expect(await acceptInvite(invited.token!, viewer)).toBe(400);
  });

  it('never downgrades a role on acceptance', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);

    // Invite the user as a viewer while they are not yet a member (re-inviting
    // an existing member is blocked with 409, so the stale-invite path is the
    // only way to reach acceptInvitation's no-downgrade guard).
    const invited = await invite(id, owner, MEMBER, 'viewer');
    expect(invited.status).toBe(201);

    // A platform admin elevates them to admin before they accept.
    const memberUserId = await lookupUserId(MEMBER);
    const grant = await app.inject({
      method: 'PUT',
      url: `/api/console/admin/users/${memberUserId}/merchants/${id}`,
      headers: { cookie: platformAdmin, 'content-type': 'application/json' },
      payload: { role: 'admin' },
    });
    expect(grant.statusCode).toBe(200);

    // Accepting the stale viewer invite must not demote them from admin.
    expect(await acceptInvite(invited.token!, member)).toBe(200);
    expect(await memberRole(id, owner, MEMBER)).toBe('admin');
  });
});

describe('invitation preview', () => {
  it('returns 404 for an unknown token', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/console/invitations/unknown-token',
      headers: { cookie: member },
    });
    expect(res.statusCode).toBe(404);
  });

  it('flags an expired pending invitation in the preview', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    const invited = await invite(id, owner, MEMBER, 'member');
    await db
      .update(merchantInvitations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(merchantInvitations.token, invited.token!));

    const res = await app.inject({
      method: 'GET',
      url: `/api/console/invitations/${invited.token}`,
      headers: { cookie: member },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().expired).toBe(true);
  });
});

describe('merchant privilege boundaries', () => {
  it('rejects a duplicate sasapay till', async () => {
    const app = await getApp();
    const first = await app.inject({
      method: 'POST',
      url: '/api/console/merchants',
      headers: { cookie: owner, 'content-type': 'application/json' },
      payload: { name: 'Till Holder', mpesaPaybillNumber: '970100', sasapayTillNumber: '970101' },
    });
    expect(first.statusCode).toBe(201);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/console/merchants',
      headers: { cookie: owner, 'content-type': 'application/json' },
      payload: { name: 'Till Clasher', mpesaPaybillNumber: '970102', sasapayTillNumber: '970101' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('lets a member rotate credentials but not delete the merchant', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    await addMember(id, owner, MEMBER, member, 'member');

    const rotate = await app.inject({
      method: 'POST',
      url: `/api/console/merchants/${id}/rotate-sasapay-credentials`,
      headers: { cookie: member },
    });
    expect(rotate.statusCode).toBe(200);
    expect(rotate.json().sasapayClientId).toHaveLength(32);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/console/merchants/${id}`,
      headers: { cookie: member },
    });
    expect(del.statusCode).toBe(403);
  });

  it('forbids a viewer from rotating credentials', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    await addMember(id, owner, VIEWER, viewer, 'viewer');

    const res = await app.inject({
      method: 'POST',
      url: `/api/console/merchants/${id}/rotate-mpesa-credentials`,
      headers: { cookie: viewer },
    });
    expect(res.statusCode).toBe(403);
  });

  it('hides a merchant from a non-member on update', async () => {
    const app = await getApp();
    const id = await createMerchant(owner);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/console/merchants/${id}`,
      headers: { cookie: outsider, 'content-type': 'application/json' },
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// Resolve any user's id by email through the platform-admin user listing.
async function lookupUserId(email: string): Promise<string> {
  const app = await getApp();
  const res = await app.inject({
    method: 'GET',
    url: `/api/console/admin/users?q=${encodeURIComponent(email)}`,
    headers: { cookie: platformAdmin },
  });
  return res.json().data.find((u: { email: string }) => u.email === email).id as string;
}

// Resolve a member's userId by email through the members listing.
async function memberRoleUserId(
  merchantId: string,
  cookie: string,
  email: string,
): Promise<string | undefined> {
  const app = await getApp();
  const res = await app.inject({
    method: 'GET',
    url: `/api/console/merchants/${merchantId}/members`,
    headers: { cookie },
  });
  return res.json().members.find((m: { email: string }) => m.email === email)?.userId as
    | string
    | undefined;
}
