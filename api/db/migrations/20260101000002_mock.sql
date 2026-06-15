-- migrate:up

CREATE TABLE mock_access_tokens (
  id VARCHAR(36) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  token VARCHAR(512) NOT NULL,
  scope VARCHAR(256) NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  meta JSONB NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT mock_access_tokens_token_key UNIQUE (token)
);
CREATE INDEX mock_access_tokens_provider_idx ON mock_access_tokens (provider);
CREATE INDEX mock_access_tokens_expires_at_idx ON mock_access_tokens (expires_at);

CREATE TABLE mock_scenarios (
  id VARCHAR(36) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  flow VARCHAR(32) NOT NULL,
  selector_type VARCHAR(32) NOT NULL DEFAULT 'default',
  selector_value VARCHAR(128) NULL,
  result_code VARCHAR(32) NOT NULL,
  result_description VARCHAR(256) NOT NULL,
  status VARCHAR(32) NOT NULL,
  payload JSONB NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX mock_scenarios_lookup_idx ON mock_scenarios (provider, flow, selector_type, selector_value);
CREATE INDEX mock_scenarios_expires_at_idx ON mock_scenarios (expires_at);
CREATE TRIGGER mock_scenarios_set_updated_at BEFORE UPDATE ON mock_scenarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE waas_type AS ENUM ('personal', 'business');

CREATE TABLE waas_onboarding_requests (
  id VARCHAR(36) NOT NULL,
  type waas_type NOT NULL,
  merchant_code VARCHAR(32) NOT NULL,
  mobile_number VARCHAR(32) NOT NULL,
  callback_url VARCHAR(1024) NULL,
  display_name VARCHAR(128) NOT NULL,
  account_number VARCHAR(32) NULL,
  otp VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'STAGED',
  payload JSONB NULL,
  directors JSONB NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE INDEX waas_merchant_code_idx ON waas_onboarding_requests (merchant_code);
CREATE INDEX waas_mobile_number_idx ON waas_onboarding_requests (mobile_number);
CREATE INDEX waas_type_idx ON waas_onboarding_requests (type);
CREATE TRIGGER waas_onboarding_requests_set_updated_at BEFORE UPDATE ON waas_onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TABLE IF EXISTS waas_onboarding_requests;
DROP TYPE IF EXISTS waas_type;
DROP TABLE IF EXISTS mock_scenarios;
DROP TABLE IF EXISTS mock_access_tokens;
