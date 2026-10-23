-- Bridge M1 schema proposal (PostgreSQL 15+).
-- NOT APPLIED. Requires security review and transaction/integration testing.
-- Deploy only to a dedicated Bridge database. All tables fail closed to API clients.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE bridge_account_status AS ENUM ('active','restricted','suspended','deleted');
CREATE TYPE bridge_queue_state AS ENUM ('waiting','reserved','cancelled','expired');
CREATE TYPE bridge_match_state AS ENUM ('reserved','active','ended','expired');
CREATE TYPE bridge_conversation_state AS ENUM ('open','closed');
CREATE TYPE bridge_conversation_kind AS ENUM ('random','connection');
CREATE TYPE bridge_vote_status AS ENUM ('accepted','withdrawn');
CREATE TYPE bridge_report_state AS ENUM ('queued','reviewing','resolved','dismissed');

CREATE TABLE bridge_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  status bridge_account_status NOT NULL DEFAULT 'active',
  age_verified_at timestamptz,
  safety_eligible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (length(auth_subject) BETWEEN 1 AND 256)
);
CREATE TABLE bridge_profiles (
  account_id uuid PRIMARY KEY REFERENCES bridge_accounts(id) ON DELETE CASCADE,
  pseudonym varchar(32) NOT NULL,
  avatar_key varchar(64) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(pseudonym)) >= 2)
);
CREATE TABLE bridge_supported_languages (
  code varchar(35) PRIMARY KEY,
  display_name varchar(80) NOT NULL,
  moderation_ready boolean NOT NULL DEFAULT false
);
CREATE TABLE bridge_account_languages (
  account_id uuid NOT NULL REFERENCES bridge_accounts(id) ON DELETE CASCADE,
  language_code varchar(35) NOT NULL REFERENCES bridge_supported_languages(code),
  PRIMARY KEY(account_id,language_code)
);
CREATE INDEX bridge_lang_code_idx ON bridge_account_languages(language_code,account_id);
CREATE TABLE bridge_preferences (
  account_id uuid PRIMARY KEY REFERENCES bridge_accounts(id) ON DELETE CASCADE,
  intention varchar(40) NOT NULL DEFAULT 'just_chat',
  topic varchar(80),
  interests text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bridge_blocks (
  blocker_id uuid NOT NULL REFERENCES bridge_accounts(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES bridge_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id,blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX bridge_blocks_reverse_idx ON bridge_blocks(blocked_id,blocker_id);

CREATE TABLE bridge_match_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_low uuid NOT NULL REFERENCES bridge_accounts(id),
  member_high uuid NOT NULL REFERENCES bridge_accounts(id),
  language_code varchar(35) NOT NULL REFERENCES bridge_supported_languages(code),
  state bridge_match_state NOT NULL DEFAULT 'reserved',
  reserved_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,
  activated_at timestamptz,
  ended_at timestamptz,
  CHECK (member_low < member_high),
  CHECK (lease_expires_at > reserved_at)
);
CREATE INDEX bridge_sessions_low_idx ON bridge_match_sessions(member_low,reserved_at DESC);
CREATE INDEX bridge_sessions_high_idx ON bridge_match_sessions(member_high,reserved_at DESC);

-- Unique per-account slot prevents simultaneous matches. Both inserts in ONE
-- transaction after verifying eligibility, blocks, shared moderated language.
CREATE TABLE bridge_active_match_slots (
  account_id uuid PRIMARY KEY REFERENCES bridge_accounts(id) ON DELETE CASCADE,
  match_session_id uuid NOT NULL REFERENCES bridge_match_sessions(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bridge_active_slots_session_idx ON bridge_active_match_slots(match_session_id);
CREATE TABLE bridge_match_queue (
  account_id uuid PRIMARY KEY REFERENCES bridge_accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL UNIQUE,
  state bridge_queue_state NOT NULL DEFAULT 'waiting',
  intention varchar(40) NOT NULL DEFAULT 'just_chat',
  topic varchar(80),
  queued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  match_session_id uuid REFERENCES bridge_match_sessions(id),
  CHECK (expires_at > queued_at)
);
CREATE INDEX bridge_waiting_queue_idx ON bridge_match_queue(queued_at) WHERE state='waiting';

CREATE TABLE bridge_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_session_id uuid UNIQUE REFERENCES bridge_match_sessions(id),
  kind bridge_conversation_kind NOT NULL DEFAULT 'random',
  state bridge_conversation_state NOT NULL DEFAULT 'open',
  next_message_sequence bigint NOT NULL DEFAULT 1 CHECK (next_message_sequence > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  expires_at timestamptz
);
CREATE TABLE bridge_conversation_participants (
  conversation_id uuid NOT NULL REFERENCES bridge_conversations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES bridge_accounts(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY(conversation_id,account_id)
);
CREATE INDEX bridge_participants_account_idx ON bridge_conversation_participants(account_id,conversation_id);
CREATE TABLE bridge_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES bridge_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES bridge_accounts(id),
  client_message_id uuid NOT NULL,
  sequence_number bigint NOT NULL CHECK (sequence_number>0),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id,sequence_number),
  UNIQUE (conversation_id,sender_id,client_message_id)
);
CREATE INDEX bridge_messages_page_idx ON bridge_messages(conversation_id,sequence_number DESC);

-- Votes must refer to actual participants. Both current votes must be
-- accepted and neither user blocked before server creates a connection.
CREATE TABLE bridge_connection_votes (
  conversation_id uuid NOT NULL,
  voter_id uuid NOT NULL,
  status bridge_vote_status NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(conversation_id,voter_id),
  FOREIGN KEY(conversation_id,voter_id)
    REFERENCES bridge_conversation_participants(conversation_id,account_id)
    ON DELETE CASCADE
);
CREATE TABLE bridge_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_low uuid NOT NULL REFERENCES bridge_accounts(id),
  member_high uuid NOT NULL REFERENCES bridge_accounts(id),
  source_conversation_id uuid NOT NULL UNIQUE REFERENCES bridge_conversations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (member_low < member_high)
);
CREATE UNIQUE INDEX bridge_active_connections_pair_idx ON bridge_connections(member_low,member_high)
  WHERE ended_at IS NULL;

CREATE TABLE bridge_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES bridge_accounts(id),
  reported_id uuid NOT NULL REFERENCES bridge_accounts(id),
  conversation_id uuid REFERENCES bridge_conversations(id),
  category varchar(40) NOT NULL,
  details text CHECK (details IS NULL OR length(details)<=2000),
  state bridge_report_state NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (reporter_id <> reported_id)
);
CREATE INDEX bridge_open_reports_idx ON bridge_reports(created_at)
  WHERE state IN ('queued','reviewing');
CREATE TABLE bridge_enforcement_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES bridge_accounts(id),
  reviewer_subject varchar(256) NOT NULL,
  action varchar(32) NOT NULL,
  reason varchar(512) NOT NULL,
  report_id uuid REFERENCES bridge_reports(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bridge_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_subject varchar(256) NOT NULL,
  action varchar(80) NOT NULL,
  object_type varchar(80) NOT NULL,
  object_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bridge_privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES bridge_accounts(id),
  request_type varchar(32) NOT NULL CHECK(request_type IN ('export','delete')),
  state varchar(32) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz
);

-- No RLS policies = no direct table access to normal API roles.
ALTER TABLE bridge_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_supported_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_account_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_match_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_active_match_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_match_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_connection_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_enforcement_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_privacy_requests ENABLE ROW LEVEL SECURITY;

-- The migration's dedicated DB must be configured to have no unaudited
-- broad grants. In particular, never expose privileged Supabase service keys
-- to client devices. Backend grants are created in a separate reviewed step.
