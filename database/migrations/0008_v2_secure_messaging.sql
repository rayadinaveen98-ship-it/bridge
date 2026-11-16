-- Bridge V2-06B / B1a: ADDITIVE, INACTIVE V2-only secure-message storage.
-- Source migration only; NEVER run this from Render/Neon or live startup.
-- Execution is restricted to separately approved disposable PostgreSQL 16 tests.
-- No changes to 0001-0007, old V1 rows, bridge_messages.body, roles or policies.
-- Bytea, IV and tag column shape do NOT perform encryption. Real codec is B1b.
-- Application authorization (membership, block, direct vs random) is future B2.
CREATE TABLE bridge_v2_secure_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES bridge_conversations(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL,
  client_message_id uuid NOT NULL,
  sequence_number bigint NOT NULL CHECK (sequence_number>0),
  policy_version varchar(40) NOT NULL CHECK (policy_version='bridge-v2'),
  accepted_at timestamptz NOT NULL,
  FOREIGN KEY (conversation_id,sender_id)
    REFERENCES bridge_conversation_participants(conversation_id,account_id)
    ON DELETE RESTRICT,
  UNIQUE(conversation_id,sequence_number),
  UNIQUE(conversation_id,sender_id,client_message_id)
);
CREATE INDEX bridge_v2_secure_messages_live_idx
  ON bridge_v2_secure_messages(conversation_id,sequence_number);
ALTER TABLE bridge_v2_secure_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_v2_secure_live (
  message_id uuid PRIMARY KEY
    REFERENCES bridge_v2_secure_messages(id) ON DELETE RESTRICT,
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) BETWEEN 1 AND 16384),
  data_iv bytea NOT NULL CHECK (octet_length(data_iv)=12),
  data_tag bytea NOT NULL CHECK (octet_length(data_tag)=16),
  wrapped_dek bytea NOT NULL CHECK (octet_length(wrapped_dek)=32),
  wrap_iv bytea NOT NULL CHECK (octet_length(wrap_iv)=12),
  wrap_tag bytea NOT NULL CHECK (octet_length(wrap_tag)=16),
  kek_id varchar(128) NOT NULL CHECK (length(trim(kek_id))>0),
  kek_version integer NOT NULL CHECK (kek_version>=1),
  cipher_suite varchar(32) NOT NULL CHECK (cipher_suite='aes-256-gcm-v1'),
  aad_version smallint NOT NULL CHECK (aad_version=1),
  encrypted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_due_at timestamptz,
  UNIQUE(kek_id,kek_version,wrap_iv)
);
CREATE INDEX bridge_v2_secure_live_retention_idx
  ON bridge_v2_secure_live(retention_due_at)
  WHERE retention_due_at IS NOT NULL;
ALTER TABLE bridge_v2_secure_live ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_v2_secure_unread (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL
    REFERENCES bridge_v2_secure_messages(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL
    REFERENCES bridge_connections(id) ON DELETE RESTRICT,
  recipient_id uuid NOT NULL
    REFERENCES bridge_accounts(id) ON DELETE RESTRICT,
  accepted_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'unread'
    CHECK (state IN ('unread','acknowledged','expired','revoked')),
  first_acknowledged_at timestamptz,
  recovery_token_digest bytea
    CHECK (recovery_token_digest IS NULL OR octet_length(recovery_token_digest)=32),
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) BETWEEN 1 AND 16384),
  data_iv bytea NOT NULL CHECK (octet_length(data_iv)=12),
  data_tag bytea NOT NULL CHECK (octet_length(data_tag)=16),
  wrapped_dek bytea NOT NULL CHECK (octet_length(wrapped_dek)=32),
  wrap_iv bytea NOT NULL CHECK (octet_length(wrap_iv)=12),
  wrap_tag bytea NOT NULL CHECK (octet_length(wrap_tag)=16),
  kek_id varchar(128) NOT NULL CHECK (length(trim(kek_id))>0),
  kek_version integer NOT NULL CHECK (kek_version>=1),
  cipher_suite varchar(32) NOT NULL CHECK (cipher_suite='aes-256-gcm-v1'),
  aad_version smallint NOT NULL CHECK (aad_version=1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(message_id,recipient_id),
  UNIQUE(kek_id,kek_version,wrap_iv),
  CHECK (expires_at>accepted_at AND
    expires_at<=accepted_at+interval '7 days'),
  CHECK (first_acknowledged_at IS NULL OR
    (first_acknowledged_at>=accepted_at AND first_acknowledged_at<expires_at)),
  CHECK (state<>'acknowledged' OR first_acknowledged_at IS NOT NULL)
);
CREATE INDEX bridge_v2_secure_unread_recipient_idx
  ON bridge_v2_secure_unread(recipient_id,expires_at,accepted_at,id)
  WHERE state='unread';
ALTER TABLE bridge_v2_secure_unread ENABLE ROW LEVEL SECURITY;
