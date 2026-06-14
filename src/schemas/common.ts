import { z } from 'zod';

const DECIMAL_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

function plainDecimal(num: number): string {
  let s = String(num);
  if (s.includes('e') || s.includes('E')) {
    s = num.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
  }
  if (s.includes('.')) {
    s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return s;
}

export function normalizeDecimalString(
  value: unknown,
  fieldName: string,
  allowZero = false,
): string {
  const raw = String(value).trim();
  if (!DECIMAL_RE.test(raw)) {
    throw new Error(`${fieldName} must be a valid decimal value`);
  }
  const num = Number(raw);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    throw new Error(`${fieldName} must be a valid decimal value`);
  }
  if (num < 0 || (num === 0 && !allowZero)) {
    const comparator = allowZero ? 'greater than or equal to 0' : 'greater than 0';
    throw new Error(`${fieldName} must be ${comparator}`);
  }
  return plainDecimal(num);
}

export function normalizeOptionalDecimalString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) return null;
  return normalizeDecimalString(value, fieldName, true);
}

export function normalizeDigits(
  value: unknown,
  fieldName: string,
  minLength: number,
  maxLength: number,
): string {
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${fieldName} must contain digits only`);
  }
  if (raw.length < minLength || raw.length > maxLength) {
    throw new Error(`${fieldName} must be between ${minLength} and ${maxLength} digits`);
  }
  return raw;
}

export function normalizeNonEmpty(value: unknown, fieldName: string, maxLength = 255): string {
  const raw = String(value).trim();
  if (!raw) throw new Error(`${fieldName} must not be empty`);
  if (raw.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters`);
  }
  return raw;
}

export function normalizeUpperToken(
  value: unknown,
  fieldName: string,
  minLength = 1,
  maxLength = 255,
): string {
  const raw = normalizeNonEmpty(value, fieldName, maxLength).toUpperCase();
  if (raw.length < minLength) {
    throw new Error(`${fieldName} must be at least ${minLength} characters`);
  }
  return raw;
}

function fromNormalizer<T>(fn: (v: unknown) => T) {
  return z.any().transform((val, ctx): T => {
    try {
      return fn(val);
    } catch (e) {
      ctx.addIssue({ code: 'custom', message: (e as Error).message });
      return z.NEVER;
    }
  });
}

export const nonEmptyStr = (max = 255) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1).max(max));

export const shortCodeStr = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(/^\d{5,12}$/));

export const msisdnStr = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(/^\d{10,15}$/));

export const currencyCodeStr = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(/^[A-Z]{3}$/));

export const channelCodeStr = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(/^\d{2,10}$/));

export const networkCodeStr = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(/^\d{1,10}$/));

export const otpStr = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(/^\d{4}$/));

export const emailStrLike = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/));

export const decimalString = (fieldName: string, allowZero = false) =>
  fromNormalizer((v) => normalizeDecimalString(v, fieldName, allowZero));

export const digitsString = (fieldName: string, min: number, max: number) =>
  fromNormalizer((v) => normalizeDigits(v, fieldName, min, max));

export const httpUrl = z
  .string()
  .transform((v) => v.trim())
  .pipe(
    z.string().refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    }, 'must be a valid URL'),
  );
