-- migrate:up

-- Per-merchant collaboration. A merchant (paybill/till "resource") is owned by
-- the user who created it and may be shared with other users at a given role.
CREATE TYPE merchant_role AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TABLE merchant_members (
  id VARCHAR(36) NOT NULL,
  merchant_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role merchant_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT merchant_members_unique UNIQUE (merchant_id, user_id),
  CONSTRAINT merchant_members_merchant_id_fk FOREIGN KEY (merchant_id)
    REFERENCES merchants (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT merchant_members_user_id_fk FOREIGN KEY (user_id)
    REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX merchant_members_merchant_id_idx ON merchant_members (merchant_id);
CREATE INDEX merchant_members_user_id_idx ON merchant_members (user_id);
CREATE TRIGGER merchant_members_set_updated_at BEFORE UPDATE ON merchant_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE merchant_invitations (
  id VARCHAR(36) NOT NULL,
  merchant_id VARCHAR(36) NOT NULL,
  email VARCHAR(256) NOT NULL,
  role merchant_role NOT NULL DEFAULT 'member',
  token VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  invited_by VARCHAR(36) NULL,
  accepted_by VARCHAR(36) NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT merchant_invitations_token_key UNIQUE (token),
  CONSTRAINT merchant_invitations_merchant_id_fk FOREIGN KEY (merchant_id)
    REFERENCES merchants (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT merchant_invitations_invited_by_fk FOREIGN KEY (invited_by)
    REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT merchant_invitations_accepted_by_fk FOREIGN KEY (accepted_by)
    REFERENCES users (id) ON UPDATE CASCADE ON DELETE SET NULL
);
-- At most one live invite per (merchant, email); accepted/revoked rows are kept
-- for history and don't block re-inviting.
CREATE UNIQUE INDEX merchant_invitations_pending_idx
  ON merchant_invitations (merchant_id, email) WHERE status = 'pending';
CREATE INDEX merchant_invitations_merchant_id_idx ON merchant_invitations (merchant_id);
CREATE INDEX merchant_invitations_email_idx ON merchant_invitations (email);
CREATE TRIGGER merchant_invitations_set_updated_at BEFORE UPDATE ON merchant_invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down

DROP TABLE IF EXISTS merchant_invitations;
DROP TABLE IF EXISTS merchant_members;
DROP TYPE IF EXISTS merchant_role;
