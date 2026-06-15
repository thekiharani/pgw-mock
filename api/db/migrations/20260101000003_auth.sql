-- migrate:up

CREATE TABLE users (
  id VARCHAR(36) NOT NULL,
  name VARCHAR(256) NOT NULL,
  email VARCHAR(256) NOT NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  image VARCHAR(1024) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_key (email)
);

CREATE TABLE sessions (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  token VARCHAR(256) NOT NULL,
  expires_at DATETIME NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY sessions_token_key (token),
  KEY sessions_user_id_idx (user_id),
  CONSTRAINT sessions_user_id_fk FOREIGN KEY (user_id)
    REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE accounts (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  account_id VARCHAR(256) NOT NULL,
  provider_id VARCHAR(256) NOT NULL,
  access_token TEXT NULL,
  refresh_token TEXT NULL,
  id_token TEXT NULL,
  access_token_expires_at DATETIME NULL,
  refresh_token_expires_at DATETIME NULL,
  scope VARCHAR(512) NULL,
  password VARCHAR(256) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY accounts_user_id_idx (user_id),
  KEY accounts_provider_idx (provider_id, account_id),
  CONSTRAINT accounts_user_id_fk FOREIGN KEY (user_id)
    REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE verifications (
  id VARCHAR(36) NOT NULL,
  identifier VARCHAR(256) NOT NULL,
  value VARCHAR(512) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY verifications_identifier_idx (identifier)
);

-- migrate:down

DROP TABLE IF EXISTS verifications;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
