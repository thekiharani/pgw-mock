import type {
  AdminOverview,
  AdminUserDetail,
  AdminUserDto,
  CreateUserInput,
  PlatformRole,
  UpdateUserInput,
} from '@shared/dto/admin';
import type { Paginated } from '@shared/dto/common';
import type {
  InvitationDto,
  InvitationPreview,
  InviteInput,
  MembersResponse,
  MerchantRole,
} from '@shared/dto/member';
import type {
  MerchantCreateInput,
  MerchantDto,
  MerchantUpdateInput,
  RotatedMpesaCredentials,
  RotatedSasapayCredentials,
} from '@shared/dto/merchant';
import type { TransactionDto } from '@shared/dto/transaction';

const BASE = '/api/console';

type QueryParams = Record<string, string | number | undefined>;

function qs(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only declare a JSON content-type when a body is actually sent — Fastify
  // rejects an empty body when content-type is application/json (bodyless
  // POSTs like the credential-rotation endpoints).
  const jsonHeader: Record<string, string> =
    init?.body != null ? { 'content-type': 'application/json' } : {};
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { ...jsonHeader, ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string; detail?: string };
      message = body.message ?? body.detail ?? message;
    } catch {
      // non-JSON error body; keep the status message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface MerchantListParams {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface TransactionListParams {
  page?: number;
  pageSize?: number;
  merchantId?: string;
  gateway?: string;
  status?: string;
  q?: string;
}

export const api = {
  listMerchants: (params: MerchantListParams = {}) =>
    request<Paginated<MerchantDto>>(`/merchants${qs(params as QueryParams)}`),
  getMerchant: (id: string) => request<MerchantDto>(`/merchants/${id}`),
  createMerchant: (body: MerchantCreateInput) =>
    request<MerchantDto>('/merchants', { method: 'POST', body: JSON.stringify(body) }),
  updateMerchant: (id: string, body: MerchantUpdateInput) =>
    request<MerchantDto>(`/merchants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteMerchant: (id: string) =>
    request<{ success: boolean }>(`/merchants/${id}`, { method: 'DELETE' }),
  rotateMpesa: (id: string) =>
    request<RotatedMpesaCredentials>(`/merchants/${id}/rotate-mpesa-credentials`, {
      method: 'POST',
    }),
  rotateSasapay: (id: string) =>
    request<RotatedSasapayCredentials>(`/merchants/${id}/rotate-sasapay-credentials`, {
      method: 'POST',
    }),
  listTransactions: (params: TransactionListParams = {}) =>
    request<Paginated<TransactionDto>>(`/transactions${qs(params as QueryParams)}`),

  getMembers: (merchantId: string) => request<MembersResponse>(`/merchants/${merchantId}/members`),
  invite: (merchantId: string, body: InviteInput) =>
    request<InvitationDto>(`/merchants/${merchantId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeInvitation: (merchantId: string, invitationId: string) =>
    request<{ success: boolean }>(`/merchants/${merchantId}/invitations/${invitationId}`, {
      method: 'DELETE',
    }),
  updateMemberRole: (merchantId: string, userId: string, role: MerchantRole) =>
    request<{ success: boolean }>(`/merchants/${merchantId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  removeMember: (merchantId: string, userId: string) =>
    request<{ success: boolean }>(`/merchants/${merchantId}/members/${userId}`, {
      method: 'DELETE',
    }),
  getInvitation: (token: string) => request<InvitationPreview>(`/invitations/${token}`),
  acceptInvitation: (token: string) =>
    request<{ success: boolean; merchantId: string }>(`/invitations/${token}/accept`, {
      method: 'POST',
    }),

  adminOverview: () => request<AdminOverview>('/admin/overview'),
  adminListUsers: (params: { page?: number; pageSize?: number; q?: string } = {}) =>
    request<Paginated<AdminUserDto>>(`/admin/users${qs(params as QueryParams)}`),
  adminGetUser: (userId: string) => request<AdminUserDetail>(`/admin/users/${userId}`),
  adminCreateUser: (body: CreateUserInput) =>
    request<AdminUserDto>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  adminUpdateUser: (userId: string, body: UpdateUserInput) =>
    request<{ success: boolean }>(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminSetPlatformRole: (userId: string, role: PlatformRole) =>
    request<{ success: boolean }>(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  adminDeleteUser: (userId: string) =>
    request<{ success: boolean }>(`/admin/users/${userId}`, { method: 'DELETE' }),
  adminGrantAccess: (userId: string, merchantId: string, role: MerchantRole) =>
    request<{ success: boolean }>(`/admin/users/${userId}/merchants/${merchantId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  adminRevokeAccess: (userId: string, merchantId: string) =>
    request<{ success: boolean }>(`/admin/users/${userId}/merchants/${merchantId}`, {
      method: 'DELETE',
    }),
};
