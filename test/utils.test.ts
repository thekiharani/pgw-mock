/** Ports tests/test_utils.py (representative coverage of the util surface). */
import { describe, expect, it } from 'vitest';

import {
  generateDarajaToken,
  generateToken,
  generateUlid,
  preUuid,
  uuid7,
} from '@/utils/generators.js';
import { DateUtils } from '@/utils/dateUtils.js';
import { PaymentsUtils } from '@/utils/payments.js';
import { generateOtp, maskAccountNumber, maskMsisdn, maskValue } from '@/utils/waas.js';
import { pyFloat } from '@/utils/format.js';

describe('generators', () => {
  it('generateUlid is lowercase 26 chars', () => {
    const u = generateUlid();
    expect(u).toMatch(/^[0-9a-z]{26}$/);
    expect(u).toBe(u.toLowerCase());
  });

  it('uuid7 is a v7 uuid', () => {
    expect(uuid7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('preUuid prefixes and strips dashes', () => {
    const v = preUuid('PRE');
    expect(v.startsWith('PRE')).toBe(true);
    expect(v.slice(3)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generateDarajaToken is 32 alphanumeric chars', () => {
    const t = generateDarajaToken();
    expect(t).toMatch(/^[a-zA-Z0-9]{32}$/);
  });

  it('generateToken is a JWT (three segments)', async () => {
    const t = await generateToken();
    expect(t.split('.')).toHaveLength(3);
  });
});

describe('DateUtils', () => {
  it('datePrefix is three chars', () => {
    expect(DateUtils.datePrefix()).toMatch(/^[A-Z][A-Z][0-9A-Z]$/);
  });
  it('generateTimestamp is 14 digits', () => {
    expect(DateUtils.generateTimestamp()).toMatch(/^\d{14}$/);
  });
  it('formatB2cDates is MM.DD.YYYY HH:MM:SS', () => {
    expect(DateUtils.formatB2cDates()).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('PaymentsUtils', () => {
  it('calculateTransactionFee tiers', () => {
    expect(PaymentsUtils.calculateTransactionFee(300)).toBe(0);
    expect(PaymentsUtils.calculateTransactionFee(100)).toBe(0);
    expect(PaymentsUtils.calculateTransactionFee(301)).toBe(5); // 4.515 -> max(5)
    expect(PaymentsUtils.calculateTransactionFee(1000)).toBe(15); // ceil(15)
    expect(PaymentsUtils.calculateTransactionFee(10000)).toBe(150);
  });

  it('mapChannelToDestination', () => {
    expect(PaymentsUtils.mapChannelToDestination('00')).toBe('SasaPay');
    expect(PaymentsUtils.mapChannelToDestination('63902')).toBe('MPESA');
    expect(PaymentsUtils.mapChannelToDestination('zzz')).toBe('UNKNOWN');
  });

  it('generateTransactionCode shape', () => {
    const code = PaymentsUtils.generateTransactionCode('SWEJ18');
    expect(code.startsWith('SWEJ18')).toBe(true);
    expect(code.length).toBe(6 + 3 + 7); // prefix + datePrefix(3) + base36(7)
  });

  it('generateRandomBase36String is uppercase hex of given length', () => {
    const s = PaymentsUtils.generateRandomBase36String(7);
    expect(s).toMatch(/^[0-9A-F]{7}$/);
  });

  it('getRandomName is three words', () => {
    expect(PaymentsUtils.getRandomName().split(' ')).toHaveLength(3);
  });
});

describe('waas helpers', () => {
  it('generateOtp is 4 digits', () => {
    expect(generateOtp()).toMatch(/^\d{4}$/);
  });
  it('maskValue masks the middle', () => {
    expect(maskValue('254712345678', 3, 3)).toBe('254******678');
    expect(maskValue('ab', 3, 3)).toBe('ab');
  });
  it('maskMsisdn and maskAccountNumber', () => {
    expect(maskMsisdn('254712345678')).toBe('254******678');
    expect(maskAccountNumber('1234567890')).toBe('123456***0');
  });
});

describe('pyFloat', () => {
  it('formats integers with .0', () => {
    expect(pyFloat(100)).toBe('100.0');
    expect(pyFloat(1500.5)).toBe('1500.5');
  });
});
