-- migrate:up

-- Postgres has no `ON UPDATE CURRENT_TIMESTAMP`; this trigger function bumps
-- updated_at on every row update and is attached to each table that needs it.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE merchants (
  id VARCHAR(36) NOT NULL,
  name VARCHAR(128) NOT NULL,
  email VARCHAR(256) NULL,
  phone_number VARCHAR(32) NULL,
  mpesa_paybill_number VARCHAR(32) NOT NULL,
  sasapay_till_number VARCHAR(32) NOT NULL,
  mpesa_consumer_key VARCHAR(64) NULL,
  mpesa_consumer_secret VARCHAR(64) NULL,
  sasapay_client_id VARCHAR(64) NULL,
  sasapay_client_secret VARCHAR(64) NULL,
  mpesa_balance NUMERIC(20, 2) NOT NULL DEFAULT 0,
  sasapay_balance NUMERIC(20, 2) NOT NULL DEFAULT 0,
  meta JSONB NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  CONSTRAINT merchants_mpesa_paybill_number_key UNIQUE (mpesa_paybill_number),
  CONSTRAINT merchants_sasapay_till_number_key UNIQUE (sasapay_till_number),
  CONSTRAINT merchants_mpesa_consumer_key_key UNIQUE (mpesa_consumer_key),
  CONSTRAINT merchants_sasapay_client_id_key UNIQUE (sasapay_client_id)
);
CREATE INDEX merchants_name_idx ON merchants (name);
CREATE INDEX merchants_email_idx ON merchants (email);
CREATE INDEX merchants_phone_idx ON merchants (phone_number);
CREATE TRIGGER merchants_set_updated_at BEFORE UPDATE ON merchants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE transactions (
  id VARCHAR(36) NOT NULL,
  transaction_code VARCHAR(32) NOT NULL,
  linked_transaction_code VARCHAR(32) NULL,
  third_party_transaction_code VARCHAR(32) NULL,
  merchant_id VARCHAR(36) NULL,
  merchant_request_id VARCHAR(128) NULL,
  merchant_reference VARCHAR(128) NULL,
  checkout_request_id VARCHAR(64) NULL,
  result_code VARCHAR(32) NULL,
  result_description VARCHAR(256) NULL,
  gateway VARCHAR(32) NOT NULL,
  destination VARCHAR(64) NOT NULL,
  sender_name VARCHAR(128) NULL,
  sender_account_number VARCHAR(32) NOT NULL,
  recipient_name VARCHAR(128) NULL,
  recipient_account_number VARCHAR(32) NOT NULL DEFAULT '',
  amount NUMERIC(20, 2) NOT NULL,
  fees NUMERIC(20, 2) NOT NULL DEFAULT 0,
  merchant_balance NUMERIC(20, 2) NOT NULL,
  type VARCHAR(32) NULL,
  sub_type VARCHAR(32) NULL,
  category VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  meta JSONB NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  CONSTRAINT transactions_merchant_id_fk FOREIGN KEY (merchant_id)
    REFERENCES merchants (id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX transactions_category_idx ON transactions (category);
CREATE INDEX transactions_status_idx ON transactions (status);
CREATE INDEX transactions_merchant_id_idx ON transactions (merchant_id);
CREATE TRIGGER transactions_set_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE callback_deliveries (
  id VARCHAR(36) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  flow VARCHAR(32) NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  transaction_id VARCHAR(36) NULL,
  url VARCHAR(1024) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_status_code INTEGER NULL,
  last_error TEXT NULL,
  delivered_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT callback_deliveries_transaction_id_fk FOREIGN KEY (transaction_id)
    REFERENCES transactions (id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX callback_deliveries_provider_flow_idx ON callback_deliveries (provider, flow);
CREATE INDEX callback_deliveries_status_idx ON callback_deliveries (status);
CREATE INDEX callback_deliveries_transaction_idx ON callback_deliveries (transaction_id);
CREATE TRIGGER callback_deliveries_set_updated_at BEFORE UPDATE ON callback_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TABLE IF EXISTS callback_deliveries;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS merchants;
DROP FUNCTION IF EXISTS set_updated_at;
