export const invoices = new Map<string, Record<string, any>>();
export const optIns = new Map<string, Record<string, any>>();
export const standingOrders = new Map<string, Record<string, any>>();

export interface WalletEntry {
  accountNumber: string;
  balance: number;
  currency: string;
  transactions: Array<Record<string, any>>;
}
export const walletLedger = new Map<string, WalletEntry>();
export const pendingPayments = new Map<string, Record<string, any>>();
