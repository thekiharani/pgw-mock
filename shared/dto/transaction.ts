export interface TransactionDto {
  id: string;
  transactionCode: string;
  merchantId: string | null;
  gateway: string;
  category: string;
  type: string | null;
  subType: string | null;
  status: string;
  amount: string;
  fees: string;
  merchantBalance: string;
  senderName: string | null;
  senderAccountNumber: string;
  recipientName: string | null;
  recipientAccountNumber: string;
  resultCode: string | null;
  resultDescription: string | null;
  merchantReference: string | null;
  createdAt: string | null;
}
