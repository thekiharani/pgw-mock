/** Ports tests/test_exceptions_and_common.py. */
import { describe, expect, it } from 'vitest';

import {
  AppError,
  AuthenticationError,
  DependencyUnavailableError,
  InsufficientFundsError,
  MerchantNotFoundError,
  PayloadError,
  PersistenceError,
} from '../src/errors.js';
import {
  normalizeDecimalString,
  normalizeDigits,
  normalizeNonEmpty,
  normalizeOptionalDecimalString,
  normalizeUpperToken,
} from '../src/schemas/common.js';
import { settings } from '../src/config.js';

describe('exceptions', () => {
  it('AppError default payload', () => {
    const exc = new AppError({ statusCode: 418, message: 'teapot' });
    expect(exc.statusCode).toBe(418);
    expect(exc.payload).toEqual({ status: false, message: 'teapot' });
  });

  it('AuthenticationError prefers detail', () => {
    const exc = new AuthenticationError({ detail: 'bad auth' });
    expect(exc.statusCode).toBe(401);
    expect(exc.message).toBe('bad auth');
  });

  it('DependencyUnavailableError payload', () => {
    const exc = new DependencyUnavailableError({
      dependency: 'database',
      message: 'db unavailable',
    });
    expect(exc.statusCode).toBe(503);
    expect(exc.payload).toEqual({ status: false, ready: false, database: false });
  });

  it('PayloadError populates blank requestId', () => {
    const exc = new PayloadError({
      statusCode: 400,
      payload: { requestId: '', errorMessage: 'bad request' },
    });
    expect(typeof exc.payload.requestId).toBe('string');
    expect(exc.payload.requestId).not.toBe('');
  });

  it('PayloadError fallback message', () => {
    const exc = new PayloadError({
      statusCode: 400,
      payload: { requestId: 'req_123', status: false },
    });
    expect(exc.message).toBe('Request failed');
  });

  it('domain error default messages', () => {
    expect(new MerchantNotFoundError().message).toBe('Merchant not found');
    expect(new InsufficientFundsError().message).toBe('Insufficient funds');
    expect(new PersistenceError().message).toBe('Persistence failed');
  });
});

describe('common schema helpers', () => {
  it('normalizeDecimalString rejects invalid value', () => {
    expect(() => normalizeDecimalString('abc', 'Amount')).toThrow(
      'Amount must be a valid decimal value',
    );
  });

  it('normalizeOptionalDecimalString handles null and value', () => {
    expect(normalizeOptionalDecimalString(null, 'Fee')).toBeNull();
    expect(normalizeOptionalDecimalString('10.50', 'Fee')).toBe('10.5');
  });

  it('normalizeDigits rejects bad length', () => {
    expect(() => normalizeDigits('12345', 'PhoneNumber', 10, 15)).toThrow(
      'must be between 10 and 15 digits',
    );
  });

  it('normalizeNonEmpty rejects blank and too long', () => {
    expect(() => normalizeNonEmpty('   ', 'Name')).toThrow('must not be empty');
    expect(() => normalizeNonEmpty('toolong', 'Name', 3)).toThrow('must be at most 3 characters');
  });

  it('normalizeUpperToken normalizes and rejects too short', () => {
    expect(normalizeUpperToken('kes', 'Currency', 3, 3)).toBe('KES');
    expect(() => normalizeUpperToken('kes', 'Currency', 4, 10)).toThrow(
      'must be at least 4 characters',
    );
  });

  it('normalizeDecimalString trims trailing zeros', () => {
    expect(normalizeDecimalString('100.00', 'Amount')).toBe('100');
    expect(normalizeDecimalString('1500.50', 'Amount')).toBe('1500.5');
    expect(normalizeDecimalString('0', 'Amount', true)).toBe('0');
    expect(() => normalizeDecimalString('0', 'Amount')).toThrow('must be greater than 0');
    expect(() => normalizeDecimalString('-5', 'Amount')).toThrow('must be greater than 0');
  });
});

describe('settings', () => {
  it('databaseUrl reflects DATABASE_URL (driver suffix stripped)', () => {
    // test env sets a plain mysql:// URL
    expect(settings.databaseUrl.startsWith('mysql://')).toBe(true);
  });
});
