-- migrate:up

CREATE TABLE merchants (
  id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone_number VARCHAR(255) NULL,
  mpesa_paybill_number VARCHAR(255) NOT NULL,
  sasapay_till_number VARCHAR(255) NOT NULL,
  mpesa_balance DECIMAL(20, 2) NOT NULL DEFAULT 0,
  sasapay_balance DECIMAL(20, 2) NOT NULL DEFAULT 0,
  meta JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY merchants_mpesa_paybill_number_key (mpesa_paybill_number),
  UNIQUE KEY merchants_sasapay_till_number_key (sasapay_till_number),
  KEY merchants_name_idx (name),
  KEY merchants_email_idx (email),
  KEY merchants_phone_idx (phone_number)
);

CREATE TABLE transactions (
  id VARCHAR(36) NOT NULL,
  transaction_code VARCHAR(36) NOT NULL,
  linked_transaction_code VARCHAR(36) NULL,
  third_party_transaction_code VARCHAR(36) NULL,
  merchant_id VARCHAR(36) NULL,
  merchant_request_id VARCHAR(255) NULL,
  merchant_reference VARCHAR(255) NULL,
  checkout_request_id VARCHAR(255) NULL,
  result_code VARCHAR(255) NULL,
  result_description VARCHAR(255) NULL,
  gateway VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255) NULL,
  sender_account_number VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255) NULL,
  recipient_account_number VARCHAR(255) NOT NULL DEFAULT '',
  amount DECIMAL(20, 2) NOT NULL,
  fees DECIMAL(20, 2) NOT NULL DEFAULT 0,
  merchant_balance DECIMAL(20, 2) NOT NULL,
  type VARCHAR(100) NULL,
  sub_type VARCHAR(100) NULL,
  category VARCHAR(100) NOT NULL,
  status VARCHAR(100) NOT NULL DEFAULT 'PENDING',
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

CREATE TABLE mock_access_tokens (
  id VARCHAR(36) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  token VARCHAR(512) NOT NULL,
  scope VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  meta JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY mock_access_tokens_token_key (token),
  KEY mock_access_tokens_provider_idx (provider),
  KEY mock_access_tokens_expires_at_idx (expires_at)
);

CREATE TABLE mock_scenarios (
  id VARCHAR(36) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  flow VARCHAR(100) NOT NULL,
  selector_type VARCHAR(50) NOT NULL DEFAULT 'default',
  selector_value VARCHAR(255) NULL,
  result_code VARCHAR(50) NOT NULL,
  result_description VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  payload JSON NULL,
  expires_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY mock_scenarios_lookup_idx (provider, flow, selector_type, selector_value),
  KEY mock_scenarios_expires_at_idx (expires_at)
);

CREATE TABLE callback_deliveries (
  id VARCHAR(36) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  flow VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  transaction_id VARCHAR(36) NULL,
  url VARCHAR(1024) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  last_status_code INT NULL,
  last_error VARCHAR(1024) NULL,
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

CREATE TABLE waas_onboarding_requests (
  id VARCHAR(36) NOT NULL,
  type ENUM('personal', 'business') NOT NULL,
  merchant_code VARCHAR(255) NOT NULL,
  mobile_number VARCHAR(255) NOT NULL,
  callback_url VARCHAR(1024) NULL,
  display_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(255) NULL,
  otp VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'STAGED',
  payload JSON NULL,
  directors JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY waas_merchant_code_idx (merchant_code),
  KEY waas_mobile_number_idx (mobile_number),
  KEY waas_type_idx (type)
);

-- migrate:down

DROP TABLE IF EXISTS waas_onboarding_requests;
DROP TABLE IF EXISTS callback_deliveries;
DROP TABLE IF EXISTS mock_scenarios;
DROP TABLE IF EXISTS mock_access_tokens;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS merchants;
