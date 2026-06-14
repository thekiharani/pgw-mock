import {
  findActiveWalletByAccountNumber,
  getWaasOnboardingByRequestId,
} from '@/actions/waasQueries.js';
import { db } from '@/db/client.js';
import { PayloadError } from '@/errors.js';
import { uuid7 } from '@/utils/generators.js';
import { walletLedger, type WalletEntry } from '@/routes/stores.js';

export function ensureWallet(accountNumber: string): WalletEntry {
  let wallet = walletLedger.get(accountNumber);
  if (!wallet) {
    wallet = { accountNumber, balance: 0.0, currency: 'KES', transactions: [] };
    walletLedger.set(accountNumber, wallet);
  }
  return wallet;
}

export function recordTransaction(
  account: string,
  opts: {
    direction: 'DEBIT' | 'CREDIT';
    amount: number;
    counterparty: string;
    reason: string;
    reference: string;
  },
): Record<string, any> {
  const wallet = ensureWallet(account);
  if (opts.direction === 'DEBIT') wallet.balance -= opts.amount;
  else wallet.balance += opts.amount;
  const entry = {
    transactionId: uuid7(),
    direction: opts.direction,
    amount: opts.amount,
    balanceAfter: wallet.balance,
    counterparty: opts.counterparty,
    reason: opts.reason,
    reference: opts.reference,
    timestamp: new Date().toISOString(),
  };
  wallet.transactions.push(entry);
  return entry;
}

export async function ensureOnboarded(accountNumber: string): Promise<void> {
  if (walletLedger.has(accountNumber)) return;

  let record = await findActiveWalletByAccountNumber(db, accountNumber);
  if (!record) record = await getWaasOnboardingByRequestId(db, accountNumber);
  if (record && (record.status === 'CONFIRMED' || record.status === 'KYC_UPLOADED')) return;

  throw new PayloadError({
    statusCode: 400,
    payload: {
      status: false,
      responseCode: '400',
      message: `Account ${accountNumber} is not an active wallet`,
    },
  });
}
