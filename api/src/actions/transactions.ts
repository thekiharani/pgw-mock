import type { Executor } from '@/db/client.js';
import { transactions } from '@/db/schema.js';

export interface TransactionData {
  id: string;
  transaction_code: string;
  linked_transaction_code?: string | null;
  third_party_transaction_code?: string | null;
  merchant_id: string;
  merchant_request_id?: string | null;
  merchant_reference?: string | null;
  checkout_request_id?: string | null;
  result_code?: string | number | null;
  result_description?: string | null;
  gateway: string;
  destination: string;
  sender_name?: string | null;
  sender_account_number: string;
  recipient_name?: string | null;
  recipient_account_number?: string | null;
  amount: string | number;
  fees?: string | number | null;
  merchant_balance: string | number;
  type?: string | null;
  sub_type?: string | null;
  category: string;
  status?: string | null;
  meta?: Record<string, any> | null;
}

export async function insertTransaction(exec: Executor, data: TransactionData): Promise<void> {
  await exec.insert(transactions).values({
    id: data.id,
    transactionCode: data.transaction_code,
    linkedTransactionCode: data.linked_transaction_code ?? null,
    thirdPartyTransactionCode: data.third_party_transaction_code ?? null,
    merchantId: data.merchant_id,
    merchantRequestId: data.merchant_request_id ?? null,
    merchantReference: data.merchant_reference ?? null,
    checkoutRequestId: data.checkout_request_id ?? null,
    resultCode: String(data.result_code ?? 0),
    resultDescription: data.result_description ?? null,
    gateway: data.gateway,
    destination: data.destination,
    senderName: data.sender_name ?? null,
    senderAccountNumber: data.sender_account_number,
    recipientName: data.recipient_name ?? null,
    recipientAccountNumber: data.recipient_account_number || '',
    amount: String(data.amount),
    fees: String(data.fees ?? 0),
    merchantBalance: String(data.merchant_balance),
    type: data.type ?? null,
    subType: data.sub_type ?? null,
    category: data.category,
    status: data.status ?? 'PENDING',
    meta: data.meta ?? null,
  });
}
