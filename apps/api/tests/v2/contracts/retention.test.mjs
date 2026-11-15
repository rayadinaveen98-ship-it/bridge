import test from "node:test";
import assert from "node:assert/strict";
import {
  MINUTE,DAY,RANDOM_IDLE,UNREAD_TTL,ACK_RECOVERY,
  REPORT_TTL,RANDOM_BODY_PURGE,HISTORY_TTL
} from "../helpers/clock.mjs";
import {
  randomSession,relationship,delivery,reportToken,legacyQaFixture
} from "../helpers/session_factory.mjs";
import {
  canDeliverUnread,canRecoverAck,consentedHistory,canSubmitPostEndReport,
  canSnapshotEvidence,caseEvidenceRead,authorizePayload,authorizedOldRoute,
  mapLegacyQaFixture,currentAccess
} from "../helpers/reference_contract.mjs";

const connection=relationship();
const acceptedAt=2*DAY;
const historyMessage={
  id:"retained-direct-1",kind:"direct",connectionId:connection.id,
  acceptedAt,retainedProspectively:true,retentionPolicyVersion:"v2.0"
};
const consents=()=>connection.members.map(accountId=>({
  accountId,connectionId:connection.id,policyVersion:"v2.0",
  effectiveAt:acceptedAt-1000,revokedAt:null
}));
const grant=()=>({
  accountId:"a",scope:"history",environment:"qa",
  issuedAt:acceptedAt-1000,expiresAfter:180*DAY,revoked:false
});

test("CT-008 unread delivery is recipient scoped and hard expires at seven days",()=>{
  const item=delivery({acceptedAt:0,recipientId:"b"});
  assert.equal(canDeliverUnread({envelope:item,actorId:"b",
    connection,now:UNREAD_TTL-1}),true);
  assert.equal(canDeliverUnread({envelope:item,actorId:"b",
    connection,now:UNREAD_TTL}),false);
  assert.equal(canDeliverUnread({envelope:item,actorId:"a",
    connection,now:1}),false);
  assert.equal(canDeliverUnread({envelope:{...item,status:"acknowledged"},
    actorId:"b",connection,now:1}),false);
  assert.equal(canDeliverUnread({envelope:item,actorId:"b",
    connection,now:1,blocks:[{blocker:"a",blocked:"b"}]}),false);
});

test("CT-009 recovered acknowledgment is bound to recipient nonce and 15-minute window",()=>{
  const item=delivery({acceptedAt:0,recipientId:"b",
    status:"acknowledged",acknowledgedAt:MINUTE,recoveryNonce:"ack-01"});
  assert.equal(canRecoverAck({envelope:item,actorId:"b",nonce:"ack-01",
    connection,now:MINUTE+ACK_RECOVERY-1}),true);
  assert.equal(canRecoverAck({envelope:item,actorId:"b",nonce:"ack-01",
    connection,now:MINUTE+ACK_RECOVERY}),false);
  assert.equal(canRecoverAck({envelope:item,actorId:"a",nonce:"ack-01",
    connection,now:MINUTE+1}),false);
  assert.equal(canRecoverAck({envelope:item,actorId:"b",nonce:"wrong",
    connection,now:MINUTE+1}),false);
});

test("CT-010 premium history requires prospective direct content, bilateral consent and grant",()=>{
  const params={message:historyMessage,connection,actorId:"a",
    consents:consents(),grant:grant(),now:acceptedAt+1};
  assert.equal(consentedHistory(params),true);
  assert.equal(consentedHistory({...params,consents:consents().slice(0,1)}),false);
  assert.equal(consentedHistory({...params,
    message:{...historyMessage,kind:"random"}}),false);
  assert.equal(consentedHistory({...params,
    message:{...historyMessage,retainedProspectively:false}}),false);
  assert.equal(consentedHistory({...params,
    consents:consents().map(c=>({...c,effectiveAt:acceptedAt+1}))}),false);
  assert.equal(consentedHistory({...params,now:acceptedAt+HISTORY_TTL}),false);
  assert.equal(consentedHistory({...params,actorId:"outsider"}),false);
});

test("CT-011 block, withdrawn consent and revoked entitlement deny instantly, before purge",()=>{
  const params={message:historyMessage,connection,actorId:"a",
    consents:consents(),grant:grant(),now:acceptedAt+1};
  assert.equal(consentedHistory(params),true);
  assert.equal(consentedHistory({...params,
    consents:consents().map(c=>c.accountId==="b"?{...c,revokedAt:acceptedAt}:c)}),false);
  assert.equal(consentedHistory({...params,grant:{...grant(),revoked:true}}),false);
  assert.equal(consentedHistory({...params,
    connection:{...connection,state:"ended"}}),false);
  assert.equal(consentedHistory({...params,
    blocks:[{blocker:"a",blocked:"b"}]}),false);
  assert.equal(consentedHistory({...params,
    grant:{...grant(),scope:"fake-premium-ui-flag"}}),false);
});

test("CT-012 report token permits 7-day case intake but no live transcript",()=>{
  const session={...randomSession(),state:"ended"};
  const token=reportToken({endedAt:0,sessionId:session.id});
  const params={token,session,actorId:"a"};
  assert.equal(canSubmitPostEndReport({...params,now:REPORT_TTL-1}),true);
  assert.equal(canSubmitPostEndReport({...params,now:REPORT_TTL}),false);
  assert.equal(canSubmitPostEndReport({...params,actorId:"outsider",now:1}),false);
  assert.equal(canSubmitPostEndReport({...params,
    token:{...token,valid:false},now:1}),false);
  assert.equal(currentAccess({session,actorId:"a",now:1}),false);
  assert.equal(authorizedOldRoute({scope:"HISTORY",actorId:"a",
    session,now:1}),false);
});

test("CT-013 evidence snapshot and reviewer-specific evidence access are separate",()=>{
  const session={...randomSession(),state:"ended"};
  const token=reportToken({endedAt:0});
  assert.equal(canSnapshotEvidence({session,token,actorId:"a",
    now:RANDOM_BODY_PURGE-1}),true);
  assert.equal(canSnapshotEvidence({session,token,actorId:"a",
    now:RANDOM_BODY_PURGE}),false);
  const grants=[{caseId:"case-1",reviewerId:"reviewer-a",
    role:"case_reviewer",revoked:false}];
  assert.equal(caseEvidenceRead({reviewerId:"reviewer-a",
    caseId:"case-1",authorizedGrants:grants}),true);
  assert.equal(caseEvidenceRead({reviewerId:"reviewer-a",
    caseId:"case-2",authorizedGrants:grants}),false);
  assert.equal(caseEvidenceRead({reviewerId:"outsider",
    caseId:"case-1",authorizedGrants:grants}),false);
});

test("CT-014 old route and forged grant never authorize historic message content",()=>{
  const room=randomSession({lastAcceptedAt:0});
  assert.equal(authorizedOldRoute({scope:"LIVE",actorId:"a",
    session:room,now:1}),true);
  assert.equal(authorizedOldRoute({scope:"HISTORY",actorId:"a",
    session:room,now:1}),false);
  assert.equal(authorizedOldRoute({scope:"HISTORY",actorId:"outsider",
    session:room,now:1}),false);
  assert.equal(authorizePayload({kind:"HISTORY",actorId:"a",
    connection,message:historyMessage,consents:[],
    grant:{...grant(),source:"client-premium-flag"},now:acceptedAt+1}),false);
  assert.equal(authorizePayload({kind:"UNREAD",actorId:"outsider",
    connection,envelope:delivery({acceptedAt:0}),now:1}),false);
  // Actual v1 endpoint remains an OPEN privacy cutover blocker (V2-11).
});

test("CT-015 hypothetical legacy migration preserves fixture, bodies and active slots",()=>{
  const original=legacyQaFixture();
  const originalBefore=structuredClone(original);
  const mapped=mapLegacyQaFixture(original);
  assert.deepEqual(original,originalBefore,"no fixture input mutation");
  assert.equal(mapped.accounts.length,2);
  assert.equal(mapped.sessions.length,1);
  assert.equal(mapped.sessions[0].state,"active");
  assert.equal(mapped.sessions[0].kind,"random");
  assert.equal(mapped.sessions[0].legacyQa,true);
  assert.equal(mapped.sessions[0].idleExpiresAt,null);
  assert.equal(mapped.activeSlots.length,2);
  assert.equal(mapped.messages.length,4);
  assert.deepEqual(mapped.messages,original.messages);
  // This test does not read or migrate the live QA database.
});

test("CT-016 expiry is enforced during access when cleanup worker is stopped",()=>{
  const workerRunning=false;
  const room=randomSession({lastAcceptedAt:0});
  assert.equal(workerRunning,false);
  assert.equal(currentAccess({session:room,actorId:"a",
    now:RANDOM_IDLE-1}),true);
  assert.equal(currentAccess({session:room,actorId:"a",
    now:RANDOM_IDLE}),false);
  assert.equal(authorizePayload({kind:"LIVE",actorId:"a",
    session:room,now:RANDOM_IDLE}),false);
  assert.equal(consentedHistory({message:historyMessage,connection,actorId:"a",
    consents:consents(),grant:grant(),
    now:acceptedAt+HISTORY_TTL}),false);
});
