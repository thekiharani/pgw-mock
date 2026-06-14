/**
 * Drizzle table definitions. These mirror the dbmate-created schema
 * (db/migrations/20260101000001_initial_schema.sql). Drizzle is the typed
 * query layer only; dbmate owns the schema.
 *
 * Note: mysql2 returns DECIMAL columns as strings, so balances/amounts are
 * typed as string here and converted at the edges (mirrors Python Decimal).
 */
import {
  datetime,
  decimal,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  varchar,
} from 'drizzle-orm/mysql-core';

export const merchants = mysqlTable('merchants', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phoneNumber: varchar('phone_number', { length: 255 }),
  mpesaPaybillNumber: varchar('mpesa_paybill_number', { length: 255 }).notNull(),
  sasapayTillNumber: varchar('sasapay_till_number', { length: 255 }).notNull(),
  mpesaBalance: decimal('mpesa_balance', { precision: 20, scale: 2 }).notNull(),
  sasapayBalance: decimal('sasapay_balance', { precision: 20, scale: 2 }).notNull(),
  meta: json('meta').$type<Record<string, any> | null>(),
  createdAt: datetime('created_at'),
  updatedAt: datetime('updated_at'),
  deletedAt: datetime('deleted_at'),
});

export const transactions = mysqlTable('transactions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  transactionCode: varchar('transaction_code', { length: 36 }).notNull(),
  linkedTransactionCode: varchar('linked_transaction_code', { length: 36 }),
  thirdPartyTransactionCode: varchar('third_party_transaction_code', { length: 36 }),
  merchantId: varchar('merchant_id', { length: 36 }),
  merchantRequestId: varchar('merchant_request_id', { length: 255 }),
  merchantReference: varchar('merchant_reference', { length: 255 }),
  checkoutRequestId: varchar('checkout_request_id', { length: 255 }),
  resultCode: varchar('result_code', { length: 255 }),
  resultDescription: varchar('result_description', { length: 255 }),
  gateway: varchar('gateway', { length: 255 }).notNull(),
  destination: varchar('destination', { length: 255 }).notNull(),
  senderName: varchar('sender_name', { length: 255 }),
  senderAccountNumber: varchar('sender_account_number', { length: 255 }).notNull(),
  recipientName: varchar('recipient_name', { length: 255 }),
  recipientAccountNumber: varchar('recipient_account_number', { length: 255 }).notNull(),
  amount: decimal('amount', { precision: 20, scale: 2 }).notNull(),
  fees: decimal('fees', { precision: 20, scale: 2 }).notNull(),
  merchantBalance: decimal('merchant_balance', { precision: 20, scale: 2 }).notNull(),
  type: varchar('type', { length: 100 }),
  subType: varchar('sub_type', { length: 100 }),
  category: varchar('category', { length: 100 }).notNull(),
  status: varchar('status', { length: 100 }).notNull(),
  meta: json('meta').$type<Record<string, any> | null>(),
  createdAt: datetime('created_at'),
  updatedAt: datetime('updated_at'),
  deletedAt: datetime('deleted_at'),
});

export const mockAccessTokens = mysqlTable('mock_access_tokens', {
  id: varchar('id', { length: 36 }).primaryKey(),
  provider: varchar('provider', { length: 50 }).notNull(),
  token: varchar('token', { length: 512 }).notNull(),
  scope: varchar('scope', { length: 255 }),
  expiresAt: datetime('expires_at').notNull(),
  revokedAt: datetime('revoked_at'),
  meta: json('meta').$type<Record<string, any> | null>(),
  createdAt: datetime('created_at'),
});

export const mockScenarios = mysqlTable('mock_scenarios', {
  id: varchar('id', { length: 36 }).primaryKey(),
  provider: varchar('provider', { length: 50 }).notNull(),
  flow: varchar('flow', { length: 100 }).notNull(),
  selectorType: varchar('selector_type', { length: 50 }).notNull(),
  selectorValue: varchar('selector_value', { length: 255 }),
  resultCode: varchar('result_code', { length: 50 }).notNull(),
  resultDescription: varchar('result_description', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  payload: json('payload').$type<Record<string, any> | null>(),
  expiresAt: datetime('expires_at'),
  createdAt: datetime('created_at'),
  updatedAt: datetime('updated_at'),
});

export const callbackDeliveries = mysqlTable('callback_deliveries', {
  id: varchar('id', { length: 36 }).primaryKey(),
  provider: varchar('provider', { length: 50 }).notNull(),
  flow: varchar('flow', { length: 100 }).notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  transactionId: varchar('transaction_id', { length: 36 }),
  url: varchar('url', { length: 1024 }).notNull(),
  payload: json('payload').$type<Record<string, any>>().notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  attempts: int('attempts').notNull(),
  lastStatusCode: int('last_status_code'),
  lastError: varchar('last_error', { length: 1024 }),
  deliveredAt: datetime('delivered_at'),
  createdAt: datetime('created_at'),
  updatedAt: datetime('updated_at'),
});

export const waasOnboardingRequests = mysqlTable('waas_onboarding_requests', {
  id: varchar('id', { length: 36 }).primaryKey(),
  type: mysqlEnum('type', ['personal', 'business']).notNull(),
  merchantCode: varchar('merchant_code', { length: 255 }).notNull(),
  mobileNumber: varchar('mobile_number', { length: 255 }).notNull(),
  callbackUrl: varchar('callback_url', { length: 1024 }),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  accountNumber: varchar('account_number', { length: 255 }),
  otp: varchar('otp', { length: 20 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  payload: json('payload').$type<any>(),
  directors: json('directors').$type<any>(),
  createdAt: datetime('created_at'),
  updatedAt: datetime('updated_at'),
});
