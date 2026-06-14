/** Mirrors app/utils/payments.py (PaymentsUtils). */
import { createHash } from 'node:crypto';

import { DateUtils } from '@/utils/dateUtils.js';

const FIRST_NAMES = [
  'Alice',
  'Bob',
  'Charlie',
  'David',
  'Emma',
  'Frank',
  'Grace',
  'Henry',
  'Isabel',
  'Jack',
  'Katherine',
  'Liam',
  'Jay',
  'Mia',
  'Noah',
  'Olivia',
  'Sophia',
  'William',
  'Zoe',
];
const MIDDLE_NAMES = [
  'Anne',
  'Benjamin',
  'Claire',
  'Daniel',
  'Eliza',
  'Frederick',
  'Grace',
  'Henry',
  'Isabel',
  'James',
  'Katherine',
  'Lucas',
  'Guzman',
  'Mia',
  'Nathan',
  'Olivia',
  'Sophia',
  'William',
  'Zoe',
];
const LAST_NAMES = [
  'Adams',
  'Brown',
  'Clark',
  'Davis',
  'Evans',
  'Fisher',
  'Garcia',
  'Hall',
  'Ives',
  'Johnson',
  'Khan',
  'Lopez',
  'Ramani',
  'Smith',
  'Taylor',
  'Walker',
  'Young',
  'Zhang',
];
const MERCHANT_NAMES = [
  'SAHARA MERCHANTS',
  'KILIMANJARO TRADERS',
  'MOUNTAIN VIEW ENTERPRISES',
  'GATEMBORO TRADERS',
  'KILIMANI TRADERS',
  'KILIMANI ENTERPRISES',
  'KILIMANI MERCHANTS',
  'MBURIA LABS',
  'KILIMANI LABS',
  'KILIMANI PHARMACY',
  'KILIMANI HOSPITAL',
  'KILIMANI CLINIC',
  'GATEMBO TECHNOLOGIES',
];

export const CHANNEL_MAP: Record<string, string> = {
  '00': 'SasaPay',
  '01': 'KCB Bank',
  '02': 'Standard Chartered Bank',
  '07': 'NCBA Bank',
  '11': 'Co-operative Bank',
  '12': 'National Bank',
  '19': 'Bank of Africa (BOA)',
  '23': 'Consolidated Bank LTD',
  '25': 'Credit Bank',
  '31': 'CFC Stanbic',
  '43': 'Ecobank',
  '57': 'I & M Bank Limited',
  '63': 'Diamond Trust Bank (DTB)',
  '68': 'Equity Bank',
  '70': 'Family Bank Ltd',
  '72': 'Gulf African Bank',
  '76': 'UBA Bank',
  '63902': 'MPESA',
  '63903': 'AirtelMoney',
  '63907': 'T-Kash',
};

function randInt(minVal: number, maxVal: number): number {
  return Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
}

function choice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export const PaymentsUtils = {
  FIRST_NAMES,
  MIDDLE_NAMES,
  LAST_NAMES,
  MERCHANT_NAMES,
  CHANNEL_MAP,

  getRandomNumber(minVal = 1_000, maxVal = 1_000_000): number {
    return randInt(minVal, maxVal);
  },

  /** Timestamp with milliseconds: %Y%m%d%H%M%S + zero-padded ms. */
  generateTimestamp(date?: Date): string {
    const now = date ?? new Date();
    const pad = (n: number, w: number) => String(n).padStart(w, '0');
    const ms = pad(now.getMilliseconds(), 3);
    return (
      `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}` +
      `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}${ms}`
    );
  },

  generateRandomBase36String(length = 10): string {
    const timestamp = PaymentsUtils.generateTimestamp();
    const rand = PaymentsUtils.getRandomNumber();
    const combined = `${timestamp}${rand}`;
    const hashed = createHash('sha256').update(combined).digest('hex');
    return hashed.slice(0, length).toUpperCase();
  },

  generateTransactionCode(gatewayPrefix = ''): string {
    const datePrefix = DateUtils.datePrefix();
    const nextSeven = PaymentsUtils.generateRandomBase36String(7);
    return `${gatewayPrefix}${datePrefix}${nextSeven}`;
  },

  getRandomName(): string {
    return `${choice(FIRST_NAMES)} ${choice(MIDDLE_NAMES)} ${choice(LAST_NAMES)}`;
  },

  getRandomMerchantName(): string {
    return choice(MERCHANT_NAMES);
  },

  formatB2cDates(): string {
    return DateUtils.formatB2cDates();
  },

  calculateTransactionFee(amount: number): number {
    if (amount <= 300) return 0;
    const fee = amount * 0.015;
    if (fee < 5) return 5;
    return Math.ceil(fee);
  },

  mapChannelToDestination(channel: string): string {
    return CHANNEL_MAP[channel] ?? 'UNKNOWN';
  },
};
