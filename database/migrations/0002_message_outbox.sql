-- M1 durable message notification outbox. Apply after 0001 in a dedicated Bridge DB.
-- Messages and their delivery intent are committed atomically, without message bodies in events.
CREATE TABLE bridge_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key varchar(100) NOT NULL UNIQUE,
  event_type varchar(64) NOT NULL CHECK (event_type = 'conversation.message.accepted'),
  conversation_id uuid NOT NULL REFERENCES bridge_conversations(id) ON DELETE CASCADE,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bridge_outbox_ready_idx
  ON bridge_event_outbox (available_at, id)
  WHERE published_at IS NULL;
ALTER TABLE bridge_event_outbox ENABLE ROW LEVEL SECURITY;
-- No public policies or direct API table grants: trusted backend role only.
