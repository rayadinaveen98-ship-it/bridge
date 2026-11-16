-- Bridge V2-03 M03-A: expand-only metadata. Disposable-DB test approved.
-- Execution is controlled by the checksummed loopback-only test runner.
-- No DML/backfills, no new defaults on legacy rows, no expiry triggers.
CREATE TABLE bridge_schema_migrations (
  version varchar(40) PRIMARY KEY,
  checksum char(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  runner_id varchar(100) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE bridge_schema_migrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE bridge_conversations
  ADD COLUMN policy_version varchar(40),
  ADD COLUMN v2_session_role varchar(16),
  ADD COLUMN connection_id uuid REFERENCES bridge_connections(id) ON DELETE RESTRICT,
  ADD COLUMN last_accepted_at timestamptz,
  ADD COLUMN idle_expires_at timestamptz,
  ADD COLUMN closed_reason varchar(40),
  ADD COLUMN legacy_qa boolean,
  ADD CONSTRAINT bridge_v2_session_role_valid
    CHECK (v2_session_role IS NULL OR v2_session_role IN ('random','direct')),
  ADD CONSTRAINT bridge_v2_idle_clock_consistent CHECK (
    (last_accepted_at IS NULL AND idle_expires_at IS NULL)
    OR (last_accepted_at IS NOT NULL AND idle_expires_at IS NOT NULL
        AND idle_expires_at > last_accepted_at)
  );
CREATE INDEX bridge_v2_conversation_connection_idx
  ON bridge_conversations (connection_id)
  WHERE connection_id IS NOT NULL;

ALTER TABLE bridge_connections
  ADD COLUMN policy_version varchar(40),
  ADD COLUMN revocation_reason varchar(80);

ALTER TABLE bridge_messages
  ADD COLUMN policy_version varchar(40),
  ADD COLUMN payload_scope varchar(24),
  ADD COLUMN content_purged_at timestamptz,
  ADD CONSTRAINT bridge_v2_payload_scope_valid CHECK (
    payload_scope IS NULL OR payload_scope IN ('live','legacy')
  );

ALTER TABLE bridge_reports
  ADD COLUMN policy_version varchar(40),
  ADD COLUMN evidence_status varchar(32),
  ADD CONSTRAINT bridge_v2_report_evidence_status_valid CHECK (
    evidence_status IS NULL OR evidence_status IN ('pending','captured','unavailable','purged')
  );
