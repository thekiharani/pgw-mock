import type { MerchantRole } from '@shared/dto/member';

export const ROLE_RANK: Record<MerchantRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export const ROLE_OPTIONS: { value: MerchantRole; label: string; hint: string }[] = [
  { value: 'viewer', label: 'Viewer', hint: 'Read-only access' },
  { value: 'member', label: 'Member', hint: 'Can rotate credentials' },
  { value: 'admin', label: 'Admin', hint: 'Manage members & settings' },
  { value: 'owner', label: 'Owner', hint: 'Full control' },
];
