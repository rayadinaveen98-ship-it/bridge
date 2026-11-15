/**
 * REFERENCE ORACLE FOR TESTS ONLY — not production authorization.
 *
 * These minimal pure predicates make founder-approved V1/V2 expectations
 * executable before the corresponding real API/schema modules are built.
 * A green test here is CONTRACT SPEC VALIDATED, never V2 IMPLEMENTED.
 * No code under apps/api/src/** may import this module.
 */
import {
  RANDOM_IDLE, DIRECT_IDLE, UNREAD_TTL, ACK_RECOVERY,
  REPORT_TTL, RANDOM_BODY_PURGE, HISTORY_TTL, beforeDeadline
} from "./clock.mjs";
import {blockedPair} from "./accounts.mjs";

export function eligible(account) {
  return Boolean(account && account.status === "active" &&
    account.adultEligible === true && account.safetyEligible === true);
}

export function canMatch({a,b,language,moderationReady=[],blocks=[],slots=[]}) {
  return eligible(a) && eligible(b) && a.id !== b.id &&
    !blockedPair(a.id,b.id,blocks) &&
    !slots.some(s=>s.accountId===a.id || s.accountId===b.id) &&
    a.selectedLanguages.includes(language) &&
    b.selectedLanguages.includes(language) &&
    moderationReady.includes(language);
}

export function claimMatchSlots(slots,aId,bId) {
  if(aId===bId || slots.some(s=>s.accountId===aId || s.accountId===bId))
    return null;
  return [...slots,{accountId:aId,sessionId:"fresh-match"},
    {accountId:bId,sessionId:"fresh-match"}];
}

export function alive(session,now) {
  if(!session || session.state !== "active")return false;
  const ttl=session.kind==="random"?RANDOM_IDLE:DIRECT_IDLE;
  return beforeDeadline(now,session.lastAcceptedAt,ttl);
}

export function currentAccess({session,actorId,now,blocks=[]}) {
  return alive(session,now) &&
    session.participants.includes(actorId) &&
    !blockedPair(session.participants[0],session.participants[1],blocks);
}

export function acceptUniqueMessage({session,actorId,now,clientMessageId,
  blocks=[]}) {
  if(!currentAccess({session,actorId,now,blocks}))return {status:"denied",session};
  if(!clientMessageId || typeof clientMessageId!=="string")return {status:"denied",session};
  if(session.seenIds?.includes(clientMessageId))return {status:"duplicate",session};
  return {status:"accepted",session:{
    ...session,lastAcceptedAt:now,
    seenIds:[...(session.seenIds||[]),clientMessageId]
  }};
}

export function canCreateConnection({session,votes,now,blocks=[]}) {
  if(session?.kind!=="random" ||
     !currentAccess({session,actorId:session?.participants?.[0],now,blocks}))
    return false;
  return session.participants.every(id=>
    votes.some(v=>v.voterId===id && v.status==="accepted"));
}

export function activeRelationship(connection,actorId,blocks=[]) {
  return Boolean(connection && connection.state==="active" &&
    connection.members.includes(actorId) &&
    !blockedPair(connection.members[0],connection.members[1],blocks));
}

export function startNewDirect({connection,actorId,now,blocks=[]}) {
  if(!activeRelationship(connection,actorId,blocks))return null;
  return {id:`direct-new-${now}`,kind:"direct",
    connectionId:connection.id,participants:[...connection.members],
    state:"active",lastAcceptedAt:now,seenIds:[],messageIds:[]};
}

export function canDeliverUnread({envelope,actorId,connection,now,blocks=[]}) {
  return envelope && envelope.status==="unread" &&
    envelope.recipientId===actorId &&
    envelope.connectionId===connection?.id &&
    activeRelationship(connection,actorId,blocks) &&
    beforeDeadline(now,envelope.acceptedAt,UNREAD_TTL);
}

export function canRecoverAck({envelope,actorId,nonce,now,connection,blocks=[]}) {
  return envelope?.status==="acknowledged" &&
    envelope.recipientId===actorId &&
    envelope.recoveryNonce===nonce &&
    envelope.connectionId===connection?.id &&
    activeRelationship(connection,actorId,blocks) &&
    beforeDeadline(now,envelope.acknowledgedAt,ACK_RECOVERY) &&
    beforeDeadline(now,envelope.acceptedAt,UNREAD_TTL);
}

export function consentedHistory({
  message,connection,actorId,consents,grant,now,blocks=[]
}) {
  if(!activeRelationship(connection,actorId,blocks))return false;
  if(!message || message.kind!=="direct" ||
    message.connectionId!==connection.id ||
    !message.retainedProspectively ||
    !beforeDeadline(now,message.acceptedAt,HISTORY_TTL))return false;
  if(!grant || grant.accountId!==actorId || grant.scope!=="history" ||
    grant.environment!=="qa" || grant.revoked===true ||
    !beforeDeadline(now,grant.issuedAt,grant.expiresAfter))return false;
  return connection.members.every(id=>consents.some(c=>
    c.accountId===id && c.connectionId===connection.id &&
    c.policyVersion===message.retentionPolicyVersion &&
    c.revokedAt==null && c.effectiveAt<=message.acceptedAt));
}

export function canSubmitPostEndReport({token,session,actorId,now}) {
  return session && token?.valid===true && token.scope==="report" &&
    token.reporterId===actorId && token.sessionId===session.id &&
    session.participants.includes(actorId) &&
    beforeDeadline(now,token.endedAt,REPORT_TTL);
}

export function canSnapshotEvidence({token,session,actorId,now}) {
  return canSubmitPostEndReport({token,session,actorId,now}) &&
    beforeDeadline(now,token.endedAt,RANDOM_BODY_PURGE);
}

export function caseEvidenceRead({reviewerId,caseId,authorizedGrants=[]}) {
  return authorizedGrants.some(g=>g.reviewerId===reviewerId &&
    g.caseId===caseId && g.role==="case_reviewer" && g.revoked!==true);
}

export function authorizePayload({
  kind, actorId, session, connection, envelope, message,
  consents=[],grant,blocks=[],now
}) {
  if(kind==="LIVE")return currentAccess({session,actorId,now,blocks});
  if(kind==="UNREAD")return canDeliverUnread({
    envelope,actorId,connection,now,blocks});
  if(kind==="HISTORY")return consentedHistory({
    message,actorId,connection,consents,grant,now,blocks});
  return false;
}

/** The legacy v1 route must not function as a bypass after future cutover. */
export function authorizedOldRoute({scope,actorId,session,now,blocks=[]}) {
  return scope==="LIVE" && currentAccess({session,actorId,now,blocks});
}

/**
 * Hypothetical additive migration of disposable synthetic fixture ONLY.
 * In real migration, data writes and legacy exceptions need new approval.
 */
export function mapLegacyQaFixture(original) {
  const fixture=structuredClone(original);
  fixture.sessions=fixture.sessions.map(session=>({
    ...session,legacyQa:true,
    // Preserve old room; do not manufacture backfilled expiry.
    idleExpiresAt:null
  }));
  return fixture;
}
