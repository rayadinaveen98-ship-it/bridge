/**
 * Bridge V2 — deliberately disconnected, pure and default-deny policy kernel.
 *
 * This file is not imported by the V1 HTTP/PostgreSQL/runtime modules.
 * Future adapters MUST fetch/lock facts in the same DB transaction as an
 * operation, enforce token validity, and construct trusted contexts themselves.
 * Never pass HTTP body/query/header JSON directly to authorize().
 *
 * Input: trusted server fact snapshot; Output: frozen safe decision, NO payload.
 */
import {
  POLICY_VERSION, OPERATIONS, OPERATION_NAMES, RESOURCE_KINDS as K,
  CODES, SESSION_IDLE_MS, UNREAD_TTL_MS, ACK_RECOVERY_MS,
  HISTORY_TTL_MS, REPORT_TTL_MS
} from "./operations.mjs";
import {createPolicyContext, trustedIdentifier, timestamp} from "./context.mjs";

const permit = Object.freeze({
  allow:true, code:CODES.ALLOW, policyVersion:POLICY_VERSION
});
const deny = code => Object.freeze({
  allow:false, code, policyVersion:POLICY_VERSION
});
const safeResource=()=>deny(CODES.RESOURCE_UNAVAILABLE);
const safeSession=()=>deny(CODES.SESSION_UNAVAILABLE);
const safeRelation=()=>deny(CODES.RELATIONSHIP_UNAVAILABLE);
const safeHistory=()=>deny(CODES.HISTORY_NOT_AUTHORIZED);
const safeReport=()=>deny(CODES.REPORT_NOT_AUTHORIZED);
const safeEvidence=()=>deny(CODES.EVIDENCE_NOT_AUTHORIZED);

const validIdentity = p =>
  trustedIdentifier(p?.accountId) && p?.authenticationValid===true &&
  p?.status!==undefined && p?.status!=="deleted";
const currentUser = p =>
  validIdentity(p) && p.role==="user" &&
  p.status==="active" && p.adultEligible===true &&
  p.safetyEligible===true && p.policyAccepted===true;
const peerEligible = peer =>
  peer?.status==="active" && peer?.adultEligible===true &&
  peer?.safetyEligible===true && peer?.policyAccepted===true;
const memberIds = pair =>
  trustedIdentifier(pair?.memberLow) &&
  trustedIdentifier(pair?.memberHigh) &&
  pair.memberLow!==pair.memberHigh;
const isPairMember=(pair,id)=>
  memberIds(pair) && (pair.memberLow===id || pair.memberHigh===id);
const otherId=(pair,id)=>
  pair?.memberLow===id?pair.memberHigh:pair?.memberHigh===id?pair.memberLow:null;
const member = ctx =>
  isPairMember(ctx.participants,ctx.principal.accountId) &&
  ctx.peer?.accountId===otherId(ctx.participants,ctx.principal.accountId);
const safePair = ctx =>
  member(ctx) && ctx.participants.reciprocalBlock===false &&
  peerEligible(ctx.peer);
const relationshipMember = ctx =>
  trustedIdentifier(ctx.relation?.id) &&
  isPairMember(ctx.relation,ctx.principal.accountId);
const relationshipActive = ctx =>
  relationshipMember(ctx) &&
  ctx.relation.state==="active" &&
  memberIds(ctx.participants) &&
  ctx.relation.memberLow===ctx.participants.memberLow &&
  ctx.relation.memberHigh===ctx.participants.memberHigh &&
  safePair(ctx);

const targetKind=(ctx,kind)=>ctx.target?.kind===kind &&
  trustedIdentifier(ctx.target?.id);
const inWindow=(now,started,ttl)=>
  timestamp(now) && timestamp(started) &&
  now>=started && Number.isSafeInteger(started+ttl) &&
  now<started+ttl;
const liveSession=(ctx,kind)=>
  targetKind(ctx,kind) && ctx.target.state==="active" &&
  inWindow(ctx.now,ctx.target.lastAcceptedAt,SESSION_IDLE_MS);

const consentedHistory=ctx=>{
  const t=ctx.target, ent=ctx.entitlement;
  if(!targetKind(ctx,K.HISTORY) || !relationshipActive(ctx) ||
      t.connectionId!==ctx.relation.id || t.directMessage!==true ||
      t.prospectivelyRetained!==true ||
      !trustedIdentifier(t.retentionPolicyVersion) ||
      !inWindow(ctx.now,t.acceptedAt,HISTORY_TTL) ||
      !Array.isArray(ctx.consents))return false;
  if(!ctx.relation || ctx.consents.length!==2 ||
     ![ctx.relation.memberLow,ctx.relation.memberHigh].every(id=>
       ctx.consents.some(c=>c?.accountId===id &&
         c.connectionId===ctx.relation.id &&
         c.policyVersion===t.retentionPolicyVersion &&
         timestamp(c.effectiveAt) && c.effectiveAt<=t.acceptedAt &&
         c.revokedAt===null)))return false;
  // QA grants ONLY. Production billing/receipt verification is later scope.
  return ctx.runtimeEnvironment==="qa" &&
    ent?.issuer==="server" && ent.environment==="qa" &&
    ent.accountId===ctx.principal.accountId &&
    ent.scope==="history" && ent.active===true &&
    ent.revokedAt===null && timestamp(ent.issuedAt) &&
    timestamp(ent.expiresAt) && ent.issuedAt<=ctx.now &&
    ctx.now<ent.expiresAt;
};

const allowedReport=ctx=>{
  const t=ctx.target;
  if(!targetKind(ctx,K.REPORT) ||
     !trustedIdentifier(t.reportedAccountId) ||
     !trustedIdentifier(t.sessionId) ||
     !member(ctx) || t.reportedAccountId!==ctx.peer.accountId)return false;
  // Report (not block) is allowed if peer blocked or currently ineligible.
  if(t.sessionState==="active" &&
     timestamp(t.sessionExpiresAt) && ctx.now<t.sessionExpiresAt)return true;
  const token=ctx.reportToken;
  return ["ended","expired","converted","safety_closed"].includes(t.sessionState) &&
    token?.tokenVerified===true && token.scope==="report" &&
    token.reporterId===ctx.principal.accountId &&
    token.sessionId===t.sessionId &&
    inWindow(ctx.now,token.endedAt,REPORT_TTL);
};

function decide(ctx){
  const {operation:op,principal:p,target:t,now}=ctx;
  if(!OPERATION_NAMES.includes(op))return deny(CODES.UNKNOWN_OPERATION);
  if(!validIdentity(p))return deny(CODES.UNAUTHENTICATED);

  // Allow authenticated owner safety/privacy actions regardless of normal
  // matchmaking eligibility; such operations NEVER grant chat/history access.
  if(op===OPERATIONS.BLOCK || op===OPERATIONS.UNBLOCK){
    return p.role==="user" && targetKind(ctx,K.ACCOUNT) &&
      trustedIdentifier(t.accountId) &&
      t.accountId!==p.accountId ? permit : safeResource();
  }
  if(op===OPERATIONS.PRIVACY_ACCESS || op===OPERATIONS.PRIVACY_DELETE){
    return p.role==="user" && p.ownershipVerified===true &&
      targetKind(ctx,K.PRIVACY) && t.ownerId===p.accountId
      ? permit:safeResource();
  }
  if(op===OPERATIONS.EVIDENCE_READ){
    const g=ctx.caseGrant;
    return p.role==="case_reviewer" && p.status==="active" &&
      targetKind(ctx,K.EVIDENCE) &&
      g?.reviewerId===p.accountId && g.caseId===t.id &&
      g.scope==="evidence_read" && g.active===true &&
      g.purposeApproved===true && timestamp(g.expiresAt) &&
      now<g.expiresAt ? permit:safeEvidence();
  }
  if(op===OPERATIONS.TEST_GRANT_MANAGE){
    return p.role==="qa_entitlement_admin" && p.status==="active" &&
      ctx.runtimeEnvironment==="qa" && targetKind(ctx,K.QA_GRANT) &&
      trustedIdentifier(t.accountId) &&
      t.environment==="qa" && t.auditContextValid===true
      ? permit:deny(CODES.QA_GRANT_DENIED);
  }
  if(op===OPERATIONS.REPORT_SUBMIT){
    // Report intake remains available to blocked or restricted users when
    // they can still authenticate and prove the original participation.
    return p.role==="user" && allowedReport(ctx)?permit:safeReport();
  }
  if(op===OPERATIONS.SEARCH_CANCEL){
    return p.role==="user" && targetKind(ctx,K.QUEUE) &&
      t.ownerId===p.accountId &&
      ["waiting","reserved","cancelled"].includes(t.state)
      ? permit:safeResource();
  }
  if(op===OPERATIONS.RANDOM_END){
    return p.role==="user" && targetKind(ctx,K.RANDOM) &&
      t.state==="active" &&
      isPairMember(ctx.participants,p.accountId)
      ? permit:safeSession();
  }
  if(op===OPERATIONS.HISTORY_CONSENT_WITHDRAW){
    return p.role==="user" && targetKind(ctx,K.CONNECTION) &&
      relationshipMember(ctx) && t.id===ctx.relation.id
      ? permit:safeRelation();
  }

  // Strict adult, safety and policy gates for new social interaction/reads.
  if(!currentUser(p))return deny(CODES.ACCOUNT_INELIGIBLE);
  switch(op){
    case OPERATIONS.DISCOVERY_SEARCH:
      return targetKind(ctx,K.DISCOVERY) &&
        t.ownerId===p.accountId &&
        t.hasModeratedLanguage===true &&
        t.activeSlotFree===true ? permit:safeResource();
    case OPERATIONS.CONNECTION_LIST:
      return targetKind(ctx,K.CONNECTION_INDEX) &&
        t.ownerId===p.accountId ? permit:safeResource();
    case OPERATIONS.RANDOM_LIVE_READ:
    case OPERATIONS.RANDOM_LIVE_SEND:
    case OPERATIONS.RANDOM_KEEP:
      return liveSession(ctx,K.RANDOM) && safePair(ctx)
        ? permit:safeSession();
    case OPERATIONS.DIRECT_CREATE:
      return targetKind(ctx,K.CONNECTION) &&
        t.id===ctx.relation?.id && t.hasActiveSegment===false &&
        relationshipActive(ctx) ? permit:safeRelation();
    case OPERATIONS.DIRECT_LIVE_READ:
    case OPERATIONS.DIRECT_LIVE_SEND:
      return liveSession(ctx,K.DIRECT) &&
        t.connectionId===ctx.relation?.id &&
        relationshipActive(ctx) ? permit:safeSession();
    case OPERATIONS.UNREAD_DELIVER:
    case OPERATIONS.UNREAD_RECOVER: {
      if(!targetKind(ctx,K.UNREAD) ||
         t.connectionId!==ctx.relation?.id ||
         t.recipientId!==p.accountId ||
         !relationshipActive(ctx) ||
         !inWindow(now,t.acceptedAt,UNREAD_TTL))return safeResource();
      if(op===OPERATIONS.UNREAD_DELIVER)
        return t.state==="unread"?permit:safeResource();
      return t.state==="acknowledged" &&
        t.recoveryTokenVerified===true &&
        inWindow(now,t.acknowledgedAt,ACK_RECOVERY_MS)
        ? permit:safeResource();
    }
    case OPERATIONS.HISTORY_READ:
      return consentedHistory(ctx)?permit:safeHistory();
    case OPERATIONS.HISTORY_CONSENT:
      return targetKind(ctx,K.CONNECTION) &&
        t.id===ctx.relation?.id &&
        relationshipActive(ctx) &&
        t.policyDisclosureComplete===true &&
        t.explicitAffirmative===true &&
        trustedIdentifier(t.retentionPolicyVersion)
        ? permit:safeRelation();
    default:
      return deny(CODES.UNKNOWN_OPERATION);
  }
}

/**
 * Frozen {allow, code, policyVersion}. Never includes identifiers or content.
 * Missing/malformed fields fail closed; no API response mapping in this stage.
 */
export function authorize(rawContext) {
  const ctx = createPolicyContext(rawContext);
  return ctx?decide(ctx):deny(CODES.INVALID_CONTEXT);
}
