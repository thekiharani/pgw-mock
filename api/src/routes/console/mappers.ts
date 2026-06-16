import type { MerchantRole } from '@shared/dto/member.js';
import type { MerchantDto } from '@shared/dto/merchant.js';
import type { TransactionDto } from '@shared/dto/transaction.js';

import type { merchants, transactions } from '@/db/schema.js';

type MerchantRow = typeof merchants.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

// DATETIME columns come back as a Date (mode:'date') or a 'YYYY-MM-DD HH:MM:SS'
// UTC string (default mode); normalize both to an ISO string.
export function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function toMerchantDto(row: MerchantRow, myRole: MerchantRole | null = null): MerchantDto {
  return {
    id: row.id,
    name: row.name,
    myRole,
    email: row.email,
    phoneNumber: row.phoneNumber,
    mpesaPaybillNumber: row.mpesaPaybillNumber,
    sasapayTillNumber: row.sasapayTillNumber,
    mpesaConsumerKey: row.mpesaConsumerKey,
    mpesaConsumerSecret: row.mpesaConsumerSecret,
    sasapayClientId: row.sasapayClientId,
    sasapayClientSecret: row.sasapayClientSecret,
    mpesaBalance: row.mpesaBalance,
    sasapayBalance: row.sasapayBalance,
    meta: row.meta ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toTransactionDto(row: TransactionRow): TransactionDto {
  return {
    id: row.id,
    transactionCode: row.transactionCode,
    merchantId: row.merchantId,
    gateway: row.gateway,
    category: row.category,
    type: row.type,
    subType: row.subType,
    status: row.status,
    amount: row.amount,
    fees: row.fees,
    merchantBalance: row.merchantBalance,
    senderName: row.senderName,
    senderAccountNumber: row.senderAccountNumber,
    recipientName: row.recipientName,
    recipientAccountNumber: row.recipientAccountNumber,
    resultCode: row.resultCode,
    resultDescription: row.resultDescription,
    merchantReference: row.merchantReference,
    createdAt: toIso(row.createdAt),
  };
}
