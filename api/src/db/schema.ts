import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const merchants = pgTable('merchants', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  email: varchar('email', { length: 256 }),
  phoneNumber: varchar('phone_number', { length: 32 }),
  mpesaPaybillNumber: varchar('mpesa_paybill_number', { length: 32 }).notNull(),
  sasapayTillNumber: varchar('sasapay_till_number', { length: 32 }).notNull(),
  mpesaConsumerKey: varchar('mpesa_consumer_key', { length: 64 }),
  mpesaConsumerSecret: varchar('mpesa_consumer_secret', { length: 64 }),
  sasapayClientId: varchar('sasapay_client_id', { length: 64 }),
  sasapayClientSecret: varchar('sasapay_client_secret', { length: 64 }),
  mpesaBalance: numeric('mpesa_balance', { precision: 20, scale: 2 }).notNull(),
  sasapayBalance: numeric('sasapay_balance', { precision: 20, scale: 2 }).notNull(),
  meta: jsonb('meta').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  deletedAt: timestamp('deleted_at'),
});

export const transactions = pgTable('transactions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  transactionCode: varchar('transaction_code', { length: 32 }).notNull(),
  linkedTransactionCode: varchar('linked_transaction_code', { length: 32 }),
  thirdPartyTransactionCode: varchar('third_party_transaction_code', { length: 32 }),
  merchantId: varchar('merchant_id', { length: 36 }),
  merchantRequestId: varchar('merchant_request_id', { length: 128 }),
  merchantReference: varchar('merchant_reference', { length: 128 }),
  checkoutRequestId: varchar('checkout_request_id', { length: 64 }),
  resultCode: varchar('result_code', { length: 32 }),
  resultDescription: varchar('result_description', { length: 256 }),
  gateway: varchar('gateway', { length: 32 }).notNull(),
  destination: varchar('destination', { length: 64 }).notNull(),
  senderName: varchar('sender_name', { length: 128 }),
  senderAccountNumber: varchar('sender_account_number', { length: 32 }).notNull(),
  recipientName: varchar('recipient_name', { length: 128 }),
  recipientAccountNumber: varchar('recipient_account_number', { length: 32 }).notNull(),
  amount: numeric('amount', { precision: 20, scale: 2 }).notNull(),
  fees: numeric('fees', { precision: 20, scale: 2 }).notNull(),
  merchantBalance: numeric('merchant_balance', { precision: 20, scale: 2 }).notNull(),
  type: varchar('type', { length: 32 }),
  subType: varchar('sub_type', { length: 32 }),
  category: varchar('category', { length: 32 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  meta: jsonb('meta').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  deletedAt: timestamp('deleted_at'),
});

export const mockAccessTokens = pgTable('mock_access_tokens', {
  id: varchar('id', { length: 36 }).primaryKey(),
  provider: varchar('provider', { length: 32 }).notNull(),
  token: varchar('token', { length: 512 }).notNull(),
  scope: varchar('scope', { length: 256 }),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  meta: jsonb('meta').$type<Record<string, any> | null>(),
  createdAt: timestamp('created_at'),
});

export const mockScenarios = pgTable('mock_scenarios', {
  id: varchar('id', { length: 36 }).primaryKey(),
  provider: varchar('provider', { length: 32 }).notNull(),
  flow: varchar('flow', { length: 32 }).notNull(),
  selectorType: varchar('selector_type', { length: 32 }).notNull(),
  selectorValue: varchar('selector_value', { length: 128 }),
  resultCode: varchar('result_code', { length: 32 }).notNull(),
  resultDescription: varchar('result_description', { length: 256 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  payload: jsonb('payload').$type<Record<string, any> | null>(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const callbackDeliveries = pgTable('callback_deliveries', {
  id: varchar('id', { length: 36 }).primaryKey(),
  provider: varchar('provider', { length: 32 }).notNull(),
  flow: varchar('flow', { length: 32 }).notNull(),
  eventType: varchar('event_type', { length: 32 }).notNull(),
  transactionId: varchar('transaction_id', { length: 36 }),
  url: varchar('url', { length: 1024 }).notNull(),
  payload: jsonb('payload').$type<Record<string, any>>().notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  attempts: integer('attempts').notNull(),
  lastStatusCode: integer('last_status_code'),
  lastError: text('last_error'),
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const waasType = pgEnum('waas_type', ['personal', 'business']);

export const waasOnboardingRequests = pgTable('waas_onboarding_requests', {
  id: varchar('id', { length: 36 }).primaryKey(),
  type: waasType('type').notNull(),
  merchantCode: varchar('merchant_code', { length: 32 }).notNull(),
  mobileNumber: varchar('mobile_number', { length: 32 }).notNull(),
  callbackUrl: varchar('callback_url', { length: 1024 }),
  displayName: varchar('display_name', { length: 128 }).notNull(),
  accountNumber: varchar('account_number', { length: 32 }),
  otp: varchar('otp', { length: 16 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  payload: jsonb('payload').$type<any>(),
  directors: jsonb('directors').$type<any>(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

// BetterAuth tables. Property keys are BetterAuth's field names (camelCase) and
// must not change; the adapter resolves fields by key. Columns are snake_case.
export const users = pgTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 256 }).notNull(),
  email: varchar('email', { length: 256 }).notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: varchar('image', { length: 1024 }),
  role: varchar('role', { length: 32 }).notNull().default('user'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
});

export const merchantRole = pgEnum('merchant_role', ['owner', 'admin', 'member', 'viewer']);

export const merchantMembers = pgTable('merchant_members', {
  id: varchar('id', { length: 36 }).primaryKey(),
  merchantId: varchar('merchant_id', { length: 36 })
    .notNull()
    .references(() => merchants.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: merchantRole('role').notNull().default('member'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const merchantInvitations = pgTable('merchant_invitations', {
  id: varchar('id', { length: 36 }).primaryKey(),
  merchantId: varchar('merchant_id', { length: 36 })
    .notNull()
    .references(() => merchants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 256 }).notNull(),
  role: merchantRole('role').notNull().default('member'),
  token: varchar('token', { length: 64 }).notNull().unique(),
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  invitedBy: varchar('invited_by', { length: 36 }).references(() => users.id, {
    onDelete: 'set null',
  }),
  acceptedBy: varchar('accepted_by', { length: 36 }).references(() => users.id, {
    onDelete: 'set null',
  }),
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 256 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: varchar('user_agent', { length: 512 }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
});

export const accounts = pgTable('accounts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: varchar('account_id', { length: 256 }).notNull(),
  providerId: varchar('provider_id', { length: 256 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date' }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date' }),
  scope: varchar('scope', { length: 512 }),
  password: varchar('password', { length: 256 }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
});

export const verifications = pgTable('verifications', {
  id: varchar('id', { length: 36 }).primaryKey(),
  identifier: varchar('identifier', { length: 256 }).notNull(),
  value: varchar('value', { length: 512 }).notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
});
