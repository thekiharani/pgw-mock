-- migrate:up

CREATE TABLE mock_access_tokens (
  id VARCHAR(36) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  token VARCHAR(512) NOT NULL,
  scope VARCHAR(256) NULL,
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
  provider VARCHAR(32) NOT NULL,
  flow VARCHAR(32) NOT NULL,
  selector_type VARCHAR(32) NOT NULL DEFAULT 'default',
  selector_value VARCHAR(128) NULL,
  result_code VARCHAR(32) NOT NULL,
  result_description VARCHAR(256) NOT NULL,
  status VARCHAR(32) NOT NULL,
  payload JSON NULL,
  expires_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY mock_scenarios_lookup_idx (provider, flow, selector_type, selector_value),
  KEY mock_scenarios_expires_at_idx (expires_at)
);

CREATE TABLE waas_onboarding_requests (
  id VARCHAR(36) NOT NULL,
  type ENUM('personal', 'business') NOT NULL,
  merchant_code VARCHAR(32) NOT NULL,
  mobile_number VARCHAR(32) NOT NULL,
  callback_url VARCHAR(1024) NULL,
  display_name VARCHAR(128) NOT NULL,
  account_number VARCHAR(32) NULL,
  otp VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'STAGED',
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
DROP TABLE IF EXISTS mock_scenarios;
DROP TABLE IF EXISTS mock_access_tokens;
