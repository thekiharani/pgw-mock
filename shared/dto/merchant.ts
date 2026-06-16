import type { MerchantRole } from './member.js';

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
  meta?: Record<string, unknown> | null;
}

export type MerchantUpdateInput = Partial<Omit<MerchantCreateInput, 'mpesaPaybillNumber' | 'sasapayTillNumber'>>;

export interface RotatedMpesaCredentials {
  mpesaConsumerKey: string;
  mpesaConsumerSecret: string;
}

export interface RotatedSasapayCredentials {
  sasapayClientId: string;
  sasapayClientSecret: string;
}
