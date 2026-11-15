/**
 * Bridge V2 policy operation catalog.
 *
 * Internal-only names; NEVER resolve the operation directly from a caller's
 * JSON or query string. HTTP routes will be explicitly bound by a future PR.
 */
export const POLICY_VERSION = "bridge-v2";
export const OPERATIONS = Object.freeze({
  DISCOVERY_SEARCH: "DISCOVERY_SEARCH",
  SEARCH_CANCEL: "SEARCH_CANCEL",
  RANDOM_LIVE_READ: "RANDOM_LIVE_READ",
  RANDOM_LIVE_SEND: "RANDOM_LIVE_SEND",
  RANDOM_KEEP: "RANDOM_KEEP",
  RANDOM_END: "RANDOM_END",
  CONNECTION_LIST: "CONNECTION_LIST",
  DIRECT_CREATE: "DIRECT_CREATE",
  DIRECT_LIVE_READ: "DIRECT_LIVE_READ",
  DIRECT_LIVE_SEND: "DIRECT_LIVE_SEND",
  UNREAD_DELIVER: "UNREAD_DELIVER",
  UNREAD_RECOVER: "UNREAD_RECOVER",
  HISTORY_READ: "HISTORY_READ",
  HISTORY_CONSENT: "HISTORY_CONSENT",
  HISTORY_CONSENT_WITHDRAW: "HISTORY_CONSENT_WITHDRAW",
  REPORT_SUBMIT: "REPORT_SUBMIT",
  EVIDENCE_READ: "EVIDENCE_READ",
  BLOCK: "BLOCK",
  UNBLOCK: "UNBLOCK",
  PRIVACY_ACCESS: "PRIVACY_ACCESS",
  PRIVACY_DELETE: "PRIVACY_DELETE",
  TEST_GRANT_MANAGE: "TEST_GRANT_MANAGE"
});
export const OPERATION_NAMES = Object.freeze(Object.values(OPERATIONS));
export const RESOURCE_KINDS = Object.freeze({
  DISCOVERY: "discovery",
  QUEUE: "queue",
  RANDOM: "random_session",
  DIRECT: "direct_session",
  CONNECTION: "connection",
  CONNECTION_INDEX: "connection_index",
  UNREAD: "unread_envelope",
  HISTORY: "history_item",
  REPORT: "report",
  EVIDENCE: "case_evidence",
  ACCOUNT: "account",
  PRIVACY: "privacy_request",
  QA_GRANT: "qa_entitlement"
});
export const CODES = Object.freeze({
  ALLOW: "allowed",
  INVALID_CONTEXT: "invalid_context",
  UNKNOWN_OPERATION: "unknown_operation",
  UNAUTHENTICATED: "unauthenticated",
  ACCOUNT_INELIGIBLE: "account_ineligible",
  RESOURCE_UNAVAILABLE: "resource_unavailable",
  SESSION_UNAVAILABLE: "session_unavailable",
  RELATIONSHIP_UNAVAILABLE: "relationship_unavailable",
  HISTORY_NOT_AUTHORIZED: "history_not_authorized",
  REPORT_NOT_AUTHORIZED: "report_not_authorized",
  EVIDENCE_NOT_AUTHORIZED: "evidence_not_authorized",
  QA_GRANT_DENIED: "qa_grant_denied"
});
export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;
export const SESSION_IDLE_MS = 30 * MINUTE_MS;
export const UNREAD_TTL_MS = 7 * DAY_MS;
export const ACK_RECOVERY_MS = 15 * MINUTE_MS;
export const REPORT_TTL_MS = 7 * DAY_MS;
export const HISTORY_TTL_MS = 90 * DAY_MS;
