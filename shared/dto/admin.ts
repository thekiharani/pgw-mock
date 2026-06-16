import type { MerchantRole } from './member.js';

export type PlatformRole = 'user' | 'admin';

export interface AdminRecentTransaction {
  id: string;
  transactionCode: string;
  gateway: string;
  amount: string;
  status: string;
  createdAt: string | null;
}

export interface AdminOverview {
  merchantCount: number;
  userCount: number;
  transactionCount: number;
  transactionVolume: string;
  recentTransactions: AdminRecentTransaction[];
}

export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
  merchantCount: number;
  createdAt: string | null;
}

export interface AdminUserMembership {
  merchantId: string;
  merchantName: string;
  role: MerchantRole;
}

export interface AdminUserDetail {
  user: AdminUserDto;
  memberships: AdminUserMembership[];
}
