export type MerchantRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface MemberDto {
  userId: string;
  name: string;
  email: string;
  role: MerchantRole;
  isYou: boolean;
  createdAt: string | null;
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked';

export interface InvitationDto {
  id: string;
  email: string;
  role: MerchantRole;
  status: InvitationStatus;
  invitedByName: string | null;
  expiresAt: string | null;
  createdAt: string | null;
}

export interface InviteInput {
  email: string;
  role: MerchantRole;
}

export interface MembersResponse {
  members: MemberDto[];
  invitations: InvitationDto[];
  myRole: MerchantRole;
}

export interface InvitationPreview {
  merchantName: string;
  email: string;
  role: MerchantRole;
  status: InvitationStatus;
  expired: boolean;
}
