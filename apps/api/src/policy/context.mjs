/**
 * Pure, allowlisted normalization for a future *trusted server* read adapter.
 *
 * This function does NOT authenticate callers. In particular, any HTTP client
 * can forge a `validation` object. A future adapter must create it itself only
 * after authenticated DB-backed fact collection, within the relevant tx.
 * Never pass arbitrary user JSON to createPolicyContext/authorize.
 */
import { POLICY_VERSION } from "./operations.mjs";

const record = value =>
  value !== null && typeof value === "object" &&
  !Array.isArray(value) && !(value instanceof Date);

export const trustedIdentifier = value =>
  typeof value === "string" && value.length > 0 && value.length <= 256 &&
  !/[\x00-\x1f\x7f]/.test(value);

export const timestamp = value =>
  Number.isSafeInteger(value) && value >= 0;

function copy(recordValue, fields) {
  if (!record(recordValue)) return null;
  const picked = Object.create(null);
  for (const field of fields) {
    if (Object.hasOwn(recordValue,field)) picked[field]=recordValue[field];
  }
  return Object.freeze(picked);
}

const PRINCIPAL_FIELDS = [
  "accountId","authenticationValid","status","role",
  "adultEligible","safetyEligible","policyAccepted","ownershipVerified"
];
const PEER_FIELDS = ["accountId","status","adultEligible","safetyEligible","policyAccepted"];
const TARGET_FIELDS = [
  "kind","id","ownerId","accountId","queueId","state",
  "hasModeratedLanguage","activeSlotFree",
  "lastAcceptedAt","connectionId","hasActiveSegment",
  "acceptedAt","acknowledgedAt","recipientId",
  "recoveryTokenVerified","reportedAccountId","sessionId",
  "sessionState","sessionExpiresAt","prospectivelyRetained",
  "directMessage","retentionPolicyVersion","policyDisclosureComplete",
  "explicitAffirmative","auditContextValid","environment"
];
const PARTICIPANT_FIELDS = ["memberLow","memberHigh","reciprocalBlock"];
const RELATION_FIELDS = ["id","state","memberLow","memberHigh"];
const CONSENT_FIELDS = ["accountId","connectionId","policyVersion","effectiveAt","revokedAt"];
const ENTITLEMENT_FIELDS = [
  "accountId","scope","issuer","environment","active",
  "issuedAt","expiresAt","revokedAt"
];
const REPORT_TOKEN_FIELDS = [
  "tokenVerified","scope","reporterId","sessionId","endedAt"
];
const CASE_GRANT_FIELDS = [
  "reviewerId","caseId","scope","active","purposeApproved","expiresAt"
];

/**
 * Normalization copies *only* approved structural facts and freezes the copy.
 * It does NOT prove facts are true: origin verification is an adapter contract.
 * No message bodies, raw tokens, premium booleans or credentials are copied.
 */
export function createPolicyContext(value) {
  if (!record(value) ||
      value.policyVersion !== POLICY_VERSION ||
      value.validation?.origin !== "trusted_server" ||
      value.validation?.sourcesVerified !== true ||
      !timestamp(value.serverClock?.timestamp)) return null;
  const principal = copy(value.principal,PRINCIPAL_FIELDS);
  if (!principal || !trustedIdentifier(principal.accountId)) return null;
  const consents = Array.isArray(value.consents)
    ? Object.freeze(value.consents.map(item=>copy(item,CONSENT_FIELDS)))
    : null;
  if (consents?.some(item=>item===null)) return null;
  return Object.freeze({
    operation:value.operation,
    policyVersion:POLICY_VERSION,
    runtimeEnvironment:value.runtimeEnvironment,
    now:value.serverClock.timestamp,
    principal,
    peer:copy(value.peer,PEER_FIELDS),
    target:copy(value.target,TARGET_FIELDS),
    participants:copy(value.participants,PARTICIPANT_FIELDS),
    relation:copy(value.relation,RELATION_FIELDS),
    consents,
    entitlement:copy(value.entitlement,ENTITLEMENT_FIELDS),
    reportToken:copy(value.reportToken,REPORT_TOKEN_FIELDS),
    caseGrant:copy(value.caseGrant,CASE_GRANT_FIELDS)
  });
}
