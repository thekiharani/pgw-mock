import type { MerchantRole } from "./member.js";

// Whether the shortcode behaves as a buy-goods till or a paybill, and which
// M-Pesa flows it is allowed to perform. Mirrors the API capability service.
export type MerchantCapability = "c2b" | "b2c" | "b2b";
export type ShortcodeKind = "TILL" | "PAYBILL";

export interface MerchantDto {
  id: string;
  name: string;
  // The caller's role on this merchant; platform admins resolve to 'owner'.
  myRole: MerchantRole | null;
  email: string | null;
  phoneNumber: string | null;
  mpesaPaybillNumber: string;
  sasapayTillNumber: string;
  mpesaConsumerKey: string | null;
  mpesaConsumerSecret: string | null;
  sasapayClientId: string | null;
  sasapayClientSecret: string | null;
  mpesaBalance: string;
  sasapayBalance: string;
  shortcodeKind: ShortcodeKind;
  capabilities: MerchantCapability[];
  meta: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MerchantCreateInput {
  name: string;
  email?: string | null;
  phoneNumber?: string | null;
  mpesaPaybillNumber: string;
  sasapayTillNumber: string;
  mpesaConsumerKey?: string | null;
  mpesaConsumerSecret?: string | null;
  sasapayClientId?: string | null;
  sasapayClientSecret?: string | null;
  mpesaBalance?: string;
  sasapayBalance?: string;
  shortcodeKind?: ShortcodeKind;
  capabilities?: MerchantCapability[];
  meta?: Record<string, unknown> | null;
}

// Paybill and till are now editable; credentials still rotate via their own
// endpoints rather than this patch.
export type MerchantUpdateInput = Partial<MerchantCreateInput>;

export interface RotatedMpesaCredentials {
  mpesaConsumerKey: string;
  mpesaConsumerSecret: string;
}

export interface RotatedSasapayCredentials {
  sasapayClientId: string;
  sasapayClientSecret: string;
}
