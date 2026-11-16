-- Bridge V2-03 M03-B: new direct segments and scoped payload envelopes.
-- No original conversation is converted or altered by this migration.
-- Bytea storage is NOT proof of encryption; later key management is separately gated.
CREATE TABLE bridge_v2_direct_sessions (
  conversation_id uuid PRIMARY KEY REFERENCES bridge_conversations(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES bridge_connections(id) ON DELETE RESTRICT,
  state varchar(12) NOT NULL CHECK (state IN ('open','closed')),
  policy_version varchar(40) NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK ((state='open' AND closed_at IS NULL)
      OR (state='closed' AND closed_at IS NOT NULL AND closed_at>=opened_at))
);
CREATE UNIQUE INDEX bridge_v2_one_open_direct_per_connection_idx
  ON bridge_v2_direct_sessions (connection_id) WHERE state='open';
CREATE INDEX bridge_v2_direct_connection_idx
  ON bridge_v2_direct_sessions (connection_id,opened_at DESC);
ALTER TABLE bridge_v2_direct_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_message_payloads (
  message_id uuid PRIMARY KEY REFERENCES bridge_messages(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES bridge_conversations(id) ON DELETE RESTRICT,
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext)>0),
  key_reference varchar(200) NOT NULL CHECK (length(trim(key_reference))>0),
  scope varchar(16) NOT NULL CHECK (scope='live'),
  expires_at timestamptz NOT NULL,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (purged_at IS NULL OR purged_at>=created_at)
);
CREATE INDEX bridge_v2_payload_expiry_idx
  ON bridge_message_payloads (expires_at)
  WHERE purged_at IS NULL;
ALTER TABLE bridge_message_payloads ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_unread_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES bridge_messages(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES bridge_connections(id) ON DELETE RESTRICT,
  recipient_id uuid NOT NULL REFERENCES bridge_accounts(id) ON DELETE RESTRICT,
  encrypted_copy bytea NOT NULL CHECK (octet_length(encrypted_copy)>0),
  key_reference varchar(200) NOT NULL CHECK (length(trim(key_reference))>0),
  accepted_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  recovery_token_digest bytea,
  state varchar(16) NOT NULL DEFAULT 'unread'
    CHECK (state IN ('unread','acknowledged','expired','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id,recipient_id),
  CHECK (expires_at>accepted_at AND expires_at<=accepted_at+interval '7 days'),
  CHECK (acknowledged_at IS NULL OR acknowledged_at>=accepted_at),
  CHECK (state<>'acknowledged' OR acknowledged_at IS NOT NULL),
  CHECK (recovery_token_digest IS NULL OR octet_length(recovery_token_digest)=32)
);
CREATE INDEX bridge_v2_unread_recipient_idx
  ON bridge_unread_deliveries (recipient_id,expires_at)
  WHERE state='unread';
ALTER TABLE bridge_unread_deliveries ENABLE ROW LEVEL SECURITY;
