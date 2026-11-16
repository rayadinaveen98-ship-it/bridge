-- Bridge V2-03 M03-D: report capability, restricted evidence and retention ledgers.
-- No report snapshot, purge worker, legal hold, grant or billing is activated.
CREATE TABLE bridge_report_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest)=32),
  reporter_id uuid NOT NULL REFERENCES bridge_accounts(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES bridge_conversations(id) ON DELETE RESTRICT,
  scope varchar(16) NOT NULL CHECK (scope='report'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at>issued_at AND expires_at<=issued_at+interval '7 days'),
  CHECK (revoked_at IS NULL OR revoked_at>=issued_at)
);
CREATE INDEX bridge_v2_report_token_reporter_idx
  ON bridge_report_tokens (reporter_id,expires_at);
ALTER TABLE bridge_report_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_report_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES bridge_reports(id) ON DELETE RESTRICT,
  source_message_id uuid REFERENCES bridge_messages(id) ON DELETE RESTRICT,
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext)>0),
  key_reference varchar(200) NOT NULL CHECK (length(trim(key_reference))>0),
  evidence_class varchar(16) NOT NULL CHECK (
    evidence_class IN ('normal','serious','appeal')
  ),
  retention_until timestamptz NOT NULL,
  legal_hold_reference varchar(128),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (retention_until>created_at)
);
CREATE INDEX bridge_v2_evidence_report_idx
  ON bridge_report_evidence (report_id,retention_until);
ALTER TABLE bridge_report_evidence ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_case_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES bridge_reports(id) ON DELETE RESTRICT,
  reviewer_subject varchar(256) NOT NULL,
  scope varchar(32) NOT NULL CHECK (scope='evidence_read'),
  purpose varchar(200) NOT NULL CHECK (length(trim(purpose))>0),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at>issued_at),
  CHECK (revoked_at IS NULL OR revoked_at>=issued_at)
);
CREATE INDEX bridge_v2_case_grant_scope_idx
  ON bridge_case_grants (report_id,reviewer_subject,expires_at)
  WHERE revoked_at IS NULL;
ALTER TABLE bridge_case_grants ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_case_access_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES bridge_reports(id) ON DELETE RESTRICT,
  reviewer_subject varchar(256) NOT NULL,
  action varchar(60) NOT NULL,
  decision varchar(24) NOT NULL CHECK (decision IN ('allow','deny')),
  purpose varchar(200) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bridge_case_access_audit ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_retention_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind varchar(48) NOT NULL,
  target_id uuid NOT NULL,
  policy_version varchar(40) NOT NULL,
  due_at timestamptz NOT NULL,
  state varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','leased','completed','blocked')),
  leased_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  legal_hold_checked_at timestamptz,
  last_error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_kind,target_id,policy_version),
  CHECK (state<>'leased' OR leased_until IS NOT NULL)
);
CREATE INDEX bridge_v2_retention_due_idx
  ON bridge_retention_jobs (due_at,id) WHERE state='pending';
ALTER TABLE bridge_retention_jobs ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_deletion_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind varchar(48) NOT NULL,
  target_digest bytea NOT NULL CHECK (octet_length(target_digest)=32),
  scope varchar(32) NOT NULL,
  policy_version varchar(40) NOT NULL,
  logical_denied_at timestamptz NOT NULL,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_kind,target_digest,scope),
  CHECK (purged_at IS NULL OR purged_at>=logical_denied_at)
);
ALTER TABLE bridge_deletion_ledger ENABLE ROW LEVEL SECURITY;

CREATE TABLE bridge_policy_ledger (
  policy_id varchar(80) NOT NULL,
  version varchar(40) NOT NULL,
  approved_at timestamptz NOT NULL,
  effective_from timestamptz NOT NULL,
  checksum char(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(policy_id,version),
  CHECK (effective_from>=approved_at)
);
ALTER TABLE bridge_policy_ledger ENABLE ROW LEVEL SECURITY;
