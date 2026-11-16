-- Bridge V2-03 M03-C: consented future DIRECT history and QA-only grants.
-- No existing random transcript or legacy body is copied or changed.
CREATE TABLE bridge_history_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES bridge_connections(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES bridge_accounts(id) ON DELETE RESTRICT,
  policy_version varchar(40) NOT NULL CHECK (length(trim(policy_version))>0),
  disclosure_version varchar(40) NOT NULL CHECK (length(trim(disclosure_version))>0),
  effective_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id,account_id,policy_version,effective_at),
  CHECK (revoked_at IS NULL OR revoked_at>=effective_at)
);
CREATE UNIQUE INDEX bridge_v2_active_consent_idx
  ON bridge_history_consents (connection_id,account_id,policy_version)
  WHERE revoked_at IS NULL;
ALTER TABLE bridge_history_consents ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_history_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES bridge_messages(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES bridge_connections(id) ON DELETE RESTRICT,
  encrypted_copy bytea NOT NULL CHECK (octet_length(encrypted_copy)>0),
  key_reference varchar(200) NOT NULL CHECK (length(trim(key_reference))>0),
  policy_version varchar(40) NOT NULL,
  accepted_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id,policy_version),
  CHECK (expires_at>accepted_at AND expires_at<=accepted_at+interval '90 days'),
  CHECK (purged_at IS NULL OR purged_at>=created_at)
);
CREATE INDEX bridge_v2_history_expiry_idx
  ON bridge_history_items (connection_id,expires_at)
  WHERE purged_at IS NULL;
ALTER TABLE bridge_history_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_entitlement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES bridge_accounts(id) ON DELETE RESTRICT,
  scope varchar(24) NOT NULL CHECK (scope='history'),
  issuer varchar(32) NOT NULL CHECK (issuer='server'),
  environment varchar(16) NOT NULL CHECK (environment='qa'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  audit_event_id bigint NOT NULL REFERENCES bridge_audit_events(id) ON DELETE RESTRICT,
  CHECK (expires_at>issued_at),
  CHECK (revoked_at IS NULL OR revoked_at>=issued_at)
);
CREATE INDEX bridge_v2_entitlement_active_idx
  ON bridge_entitlement_grants (account_id,scope,expires_at)
  WHERE revoked_at IS NULL;
ALTER TABLE bridge_entitlement_grants ENABLE ROW LEVEL SECURITY;
