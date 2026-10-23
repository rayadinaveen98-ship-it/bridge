-- Isolated laboratory authentication data only. Never deploy this table to public chat.
CREATE TABLE bridge_lab_credentials (
  account_id uuid PRIMARY KEY REFERENCES bridge_accounts(id) ON DELETE CASCADE,
  handle varchar(31) NOT NULL UNIQUE CHECK (handle ~ '^[a-z][a-z0-9_-]{2,30}$'),
  salt char(32) NOT NULL CHECK (salt ~ '^[a-f0-9]{32}$'),
  passphrase_hash char(128) NOT NULL CHECK (passphrase_hash ~ '^[a-f0-9]{128}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bridge_lab_credentials ENABLE ROW LEVEL SECURITY;
-- No user-facing policies. No grants to anon or authenticated roles.
