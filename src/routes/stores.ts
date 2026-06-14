/**
 * Process-local in-memory stores. These intentionally reset on restart and are
 * not shared across workers — same semantics as the module-level dicts in the
 * Python app (bill_manager._INVOICES/_OPT_INS, standing_order._STANDING_ORDERS,
 * and the WaaS wallet ledger / pending payments).
 */

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
