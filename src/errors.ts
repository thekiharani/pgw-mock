import { uuid7 } from '@/utils/generators.js';

function deriveMessage(payload: Record<string, any>, fallback: string): string {
  for (const key of [
    'message',
    'detail',
    'errorMessage',
    'ResponseDescription',
    'ResultDesc',
    'ResultDescription',
  ]) {
    const value = payload[key];
    if (typeof value === 'string' && value) return value;
  }
  return fallback;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly payload: Record<string, any>;

  constructor(opts: { statusCode: number; message: string; payload?: Record<string, any> | null }) {
    super(opts.message);
    this.name = 'AppError';
    this.statusCode = opts.statusCode;
    this.payload = opts.payload ?? { status: false, message: opts.message };
  }
}

export class AuthenticationError extends AppError {
  constructor(payload: Record<string, any>) {
    super({ statusCode: 401, message: deriveMessage(payload, 'Unauthorized'), payload });
    this.name = 'AuthenticationError';
  }
}

export class PayloadError extends AppError {
  constructor(opts: { statusCode: number; payload: Record<string, any>; message?: string }) {
    const normalized = { ...opts.payload };
    if ('requestId' in normalized && !normalized.requestId) {
      normalized.requestId = uuid7();
    }
    super({
      statusCode: opts.statusCode,
      message: opts.message ?? deriveMessage(normalized, 'Request failed'),
      payload: normalized,
    });
    this.name = 'PayloadError';
  }
}

export class DependencyUnavailableError extends AppError {
  constructor(opts: { dependency: string; message: string }) {
    super({
      statusCode: 503,
      message: opts.message,
      payload: { status: false, ready: false, [opts.dependency]: false },
    });
    this.name = 'DependencyUnavailableError';
  }
}

export class MerchantNotFoundError extends AppError {
  constructor(message = 'Merchant not found') {
    super({ statusCode: 400, message });
    this.name = 'MerchantNotFoundError';
  }
}

export class InsufficientFundsError extends AppError {
  constructor(message = 'Insufficient funds') {
    super({ statusCode: 400, message });
    this.name = 'InsufficientFundsError';
  }
}

export class PersistenceError extends AppError {
  constructor(message = 'Persistence failed') {
    super({ statusCode: 500, message });
    this.name = 'PersistenceError';
  }
}
