-- migrate:up

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
  mpesa_balance DECIMAL(20, 2) NOT NULL DEFAULT 0,
  sasapay_balance DECIMAL(20, 2) NOT NULL DEFAULT 0,
  meta JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY merchants_mpesa_paybill_number_key (mpesa_paybill_number),
  UNIQUE KEY merchants_sasapay_till_number_key (sasapay_till_number),
  UNIQUE KEY merchants_mpesa_consumer_key_key (mpesa_consumer_key),
  UNIQUE KEY merchants_sasapay_client_id_key (sasapay_client_id),
  KEY merchants_name_idx (name),
  KEY merchants_email_idx (email),
  KEY merchants_phone_idx (phone_number)
);

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
  amount DECIMAL(20, 2) NOT NULL,
  fees DECIMAL(20, 2) NOT NULL DEFAULT 0,
  merchant_balance DECIMAL(20, 2) NOT NULL,
  type VARCHAR(32) NULL,
  sub_type VARCHAR(32) NULL,
  category VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  meta JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY transactions_category_idx (category),
  KEY transactions_status_idx (status),
  KEY transactions_merchant_id_idx (merchant_id),
  CONSTRAINT transactions_merchant_id_fk FOREIGN KEY (merchant_id)
    REFERENCES merchants (id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE callback_deliveries (
  id VARCHAR(36) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  flow VARCHAR(32) NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  transaction_id VARCHAR(36) NULL,
  url VARCHAR(1024) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  last_status_code INT NULL,
  last_error TEXT NULL,
  delivered_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY callback_deliveries_provider_flow_idx (provider, flow),
  KEY callback_deliveries_status_idx (status),
  KEY callback_deliveries_transaction_idx (transaction_id),
  CONSTRAINT callback_deliveries_transaction_id_fk FOREIGN KEY (transaction_id)
    REFERENCES transactions (id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- migrate:down

DROP TABLE IF EXISTS callback_deliveries;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS merchants;
