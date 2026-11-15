import test from "node:test";
import assert from "node:assert/strict";
import {authorize} from "../../src/policy/authorize.mjs";
import {createPolicyContext} from "../../src/policy/context.mjs";
import {OPERATIONS as O, CODES, POLICY_VERSION,
  SESSION_IDLE_MS,UNREAD_TTL_MS,ACK_RECOVERY_MS,HISTORY_TTL_MS,
  REPORT_TTL_MS,DAY_MS} from "../../src/policy/operations.mjs";
import {fixture,NOW} from "./fixture.mjs";

function allowed(x) { assert.equal(authorize(x).allow,true); }
function denied(x,code) {
  const d=authorize(x);
  assert.equal(d.allow,false,JSON.stringify({op:x?.operation,code:d.code}));
  assert.equal(d.policyVersion,POLICY_VERSION);
  if(code)assert.equal(d.code,code);
  assert.equal(Object.isFrozen(d),true);
}
function altered(op,which,updates) {
  const x=fixture(op);
  x[which]={...x[which],...updates};
  return x;
}

test("P-001 unknown/missing operation, source proof and clock fail closed",()=>{
  denied(null,CODES.INVALID_CONTEXT);
  denied({},CODES.INVALID_CONTEXT);
  denied({...fixture(O.RANDOM_LIVE_READ),operation:"ALL_MESSAGES"},
    CODES.UNKNOWN_OPERATION);
  denied({...fixture(O.RANDOM_LIVE_READ),operation:undefined},
    CODES.UNKNOWN_OPERATION);
  const c=fixture(O.RANDOM_LIVE_READ);
  delete c.validation;denied(c,CODES.INVALID_CONTEXT);
  c.validation={origin:"client",sourcesVerified:true};denied(c,CODES.INVALID_CONTEXT);
  c.validation={origin:"trusted_server",sourcesVerified:true};
  c.serverClock={timestamp:NaN};denied(c,CODES.INVALID_CONTEXT);
  c.serverClock={timestamp:-1};denied(c,CODES.INVALID_CONTEXT);
  c.serverClock={timestamp:NOW};
  c.policyVersion="bridge-v1";denied(c,CODES.INVALID_CONTEXT);
  c.policyVersion=POLICY_VERSION;
  c.principal.accountId="x\n";denied(c,CODES.INVALID_CONTEXT);
});

test("P-002 eligibility and account status must be server-verified, never UI flags",()=>{
  allowed(fixture(O.DISCOVERY_SEARCH));
  for(const patch of [
    {status:"restricted"},{status:"suspended"},{status:"deleted"},
    {adultEligible:false},{safetyEligible:false},{policyAccepted:false},
    {adultEligible:undefined},{policyAccepted:undefined}
  ]) {
    denied(altered(O.DISCOVERY_SEARCH,"principal",patch));
    denied(altered(O.RANDOM_LIVE_SEND,"principal",patch));
    denied(altered(O.RANDOM_KEEP,"principal",patch));
  }
  const x=fixture(O.DISCOVERY_SEARCH);
  x.target.hasModeratedLanguage=false;denied(x);
  x.target.hasModeratedLanguage=true;x.target.activeSlotFree=false;denied(x);
});

test("P-003 outsider cannot guess a room or saved connection handle",()=>{
  const x=fixture(O.RANDOM_LIVE_READ);
  x.principal.accountId="outsider";
  denied(x,CODES.SESSION_UNAVAILABLE);
  denied(altered(O.CONNECTION_LIST,"target",{ownerId:"other"}),
    CODES.RESOURCE_UNAVAILABLE);
  denied(altered(O.DIRECT_CREATE,"relation",{id:"secret-other-connection"}),
    CODES.RELATIONSHIP_UNAVAILABLE);
  denied(altered(O.DIRECT_LIVE_READ,"target",{connectionId:"guess"}),
    CODES.SESSION_UNAVAILABLE);
});

test("P-004 both directions of blocks and revoked relations deny reads",()=>{
  for(const op of [
    O.RANDOM_LIVE_READ,O.DIRECT_LIVE_SEND,O.DIRECT_CREATE,
    O.UNREAD_DELIVER,O.HISTORY_READ,O.HISTORY_CONSENT
  ]){
    denied(altered(op,"participants",{reciprocalBlock:true}));
    denied(altered(op,"peer",{safetyEligible:false}));
  }
  for(const op of [
    O.DIRECT_CREATE,O.DIRECT_LIVE_READ,O.UNREAD_DELIVER,O.HISTORY_READ
  ])denied(altered(op,"relation",{state:"revoked"}));
  // Reporting/blocking remains available and does not re-enable messaging.
  const report=fixture(O.REPORT_SUBMIT);
  report.participants.reciprocalBlock=true;
  allowed(report);
});

test("P-005 29:59 is live; 30:00 denied even when worker is absent",()=>{
  for(const op of [
    O.RANDOM_LIVE_READ,O.RANDOM_LIVE_SEND,O.RANDOM_KEEP,
    O.DIRECT_LIVE_READ,O.DIRECT_LIVE_SEND
  ]) {
    allowed(altered(op,"target",{lastAcceptedAt:NOW-SESSION_IDLE_MS+1}));
    denied(altered(op,"target",{lastAcceptedAt:NOW-SESSION_IDLE_MS}));
  }
  // No sweeper/worker state is accepted as an authorization input.
  const x=fixture(O.RANDOM_LIVE_SEND);
  x.workerRunning=false;
  x.target.lastAcceptedAt=NOW-SESSION_IDLE_MS;
  denied(x);
});

test("P-006 late Keep, converted/ended room and outsider have no authority",()=>{
  for(const state of ["ended","converted","expired","safety_closed"])
    denied(altered(O.RANDOM_KEEP,"target",{state}));
  denied(altered(O.RANDOM_KEEP,"target",{
    lastAcceptedAt:NOW-SESSION_IDLE_MS
  }));
  denied(altered(O.RANDOM_KEEP,"participants",{memberLow:"other"}));
  // Vote serialization is NOT proven by this pure policy test (V2-05).
});

test("P-007 wrong resource kind, mismatched relation or older room denied",()=>{
  denied(altered(O.DIRECT_LIVE_READ,"target",{kind:"random_session"}));
  denied(altered(O.RANDOM_LIVE_READ,"target",{kind:"direct_session"}));
  denied(altered(O.DIRECT_LIVE_READ,"target",{connectionId:"old-rel"}));
  denied(altered(O.HISTORY_READ,"target",{directMessage:false}));
  denied(altered(O.HISTORY_READ,"target",{prospectivelyRetained:false}));
});

test("P-008 unread belongs only to its authenticated intended recipient",()=>{
  allowed(fixture(O.UNREAD_DELIVER));
  denied(altered(O.UNREAD_DELIVER,"target",{recipientId:"b"}));
  denied(altered(O.UNREAD_DELIVER,"target",{connectionId:"other-connection"}));
  denied(altered(O.UNREAD_RECOVER,"target",{recoveryTokenVerified:false}));
});

test("P-009 unread 7d and recovery 15m are strict exclusive deadlines",()=>{
  allowed(altered(O.UNREAD_DELIVER,"target",{
    acceptedAt:NOW-UNREAD_TTL_MS+1
  }));
  denied(altered(O.UNREAD_DELIVER,"target",{
    acceptedAt:NOW-UNREAD_TTL_MS
  }));
  allowed(altered(O.UNREAD_RECOVER,"target",{
    acknowledgedAt:NOW-ACK_RECOVERY_MS+1,acceptedAt:NOW-DAY_MS
  }));
  denied(altered(O.UNREAD_RECOVER,"target",{
    acknowledgedAt:NOW-ACK_RECOVERY_MS,acceptedAt:NOW-DAY_MS
  }));
  denied(altered(O.UNREAD_RECOVER,"target",{
    acknowledgedAt:NOW-1000,acceptedAt:NOW-UNREAD_TTL_MS
  }));
});

test("P-010 fake client premium, wrong environment and untrusted grants denied",()=>{
  allowed(fixture(O.HISTORY_READ));
  const x=fixture(O.HISTORY_READ);
  x.isPremium=true;delete x.entitlement;denied(x);
  denied(altered(O.HISTORY_READ,"entitlement",{issuer:"client"}));
  denied(altered(O.HISTORY_READ,"entitlement",{environment:"production"}));
  const prod=fixture(O.HISTORY_READ);prod.runtimeEnvironment="production";
  denied(prod);
  denied(altered(O.HISTORY_READ,"entitlement",{scope:"all"}));
  denied(altered(O.TEST_GRANT_MANAGE,"target",{auditContextValid:false}));
});

test("P-011 two affirmative consents predating the message are mandatory",()=>{
  const x=fixture(O.HISTORY_READ);
  allowed(x);
  x.consents=x.consents.slice(0,1);denied(x);
  const late=fixture(O.HISTORY_READ);
  late.consents[1].effectiveAt=NOW;denied(late);
  const mismatched=fixture(O.HISTORY_READ);
  mismatched.consents[1].policyVersion="legacy";denied(mismatched);
  const other=fixture(O.HISTORY_READ);
  other.consents[1].connectionId="unrelated";denied(other);
});

test("P-012 consent withdrawal, entitlement revocation and 90d deny immediately",()=>{
  denied(altered(O.HISTORY_READ,"entitlement",{active:false}));
  denied(altered(O.HISTORY_READ,"entitlement",{revokedAt:NOW-1}));
  denied(altered(O.HISTORY_READ,"entitlement",{expiresAt:NOW}));
  const revoked=fixture(O.HISTORY_READ);
  revoked.consents[1].revokedAt=NOW-1;denied(revoked);
  const justInside=altered(O.HISTORY_READ,"target",{
    acceptedAt:NOW-HISTORY_TTL_MS+1
  });
  justInside.consents=justInside.consents.map(c=>({
    ...c,effectiveAt:NOW-HISTORY_TTL_MS
  }));
  allowed(justInside);
  const justExpired=altered(O.HISTORY_READ,"target",{
    acceptedAt:NOW-HISTORY_TTL_MS
  });
  justExpired.consents=justExpired.consents.map(c=>({
    ...c,effectiveAt:NOW-HISTORY_TTL_MS-1
  }));
  denied(justExpired);
  // A user can withdraw previously granted consent even after connection ends.
  const withdrawal=fixture(O.HISTORY_CONSENT_WITHDRAW);
  withdrawal.relation.state="revoked";allowed(withdrawal);
});

test("P-013 report token expiry, outsider and unauthorized case review denied",()=>{
  const ended=fixture(O.REPORT_SUBMIT);
  ended.target.sessionState="ended";
  delete ended.target.sessionExpiresAt;
  allowed(ended);
  ended.reportToken.endedAt=NOW-REPORT_TTL_MS;denied(ended);
  ended.reportToken.endedAt=NOW-1000;
  ended.reportToken.reporterId="outsider";denied(ended);
  const outsider=fixture(O.REPORT_SUBMIT);
  outsider.target.reportedAccountId="outsider";denied(outsider);
  allowed(fixture(O.EVIDENCE_READ));
  denied(altered(O.EVIDENCE_READ,"caseGrant",{caseId:"another-case"}));
  denied(altered(O.EVIDENCE_READ,"principal",{role:"user"}));
});

test("P-014 post-end late reporting is possible without resurrecting purged text",()=>{
  const x=fixture(O.REPORT_SUBMIT);
  x.target.sessionState="ended";
  x.reportToken.endedAt=NOW-2*DAY_MS; // 24h body target already passed
  allowed(x);
  // No payload/message-body is returned by the policy kernel.
  assert.deepEqual(Object.keys(authorize(x)),["allow","code","policyVersion"]);
});

test("P-015 unknown legacy history/wildcard operations are NOT privileges",()=>{
  for(const op of ["ALL_MESSAGES","HISTORY_READ_V1","V1_BYPASS","*"])
    denied({...fixture(O.RANDOM_LIVE_READ),operation:op},CODES.UNKNOWN_OPERATION);
  // Actual V1 HTTP cutover is an explicit V2-11 integration blocker.
});

test("P-016 expired/revoked login status and multi-device authority cannot persist",()=>{
  for(const op of [O.RANDOM_LIVE_READ,O.HISTORY_READ,O.PRIVACY_DELETE]){
    denied(altered(op,"principal",{authenticationValid:false}),
      CODES.UNAUTHENTICATED);
  }
  denied(altered(O.EVIDENCE_READ,"caseGrant",{active:false}));
  const q=fixture(O.RANDOM_LIVE_READ);
  q.validation.sourcesVerified=false;denied(q,CODES.INVALID_CONTEXT);
});

test("P-017 legacy room must not be silently upgraded by this disconnected kernel",()=>{
  const x=fixture(O.RANDOM_LIVE_READ);
  delete x.target.lastAcceptedAt;
  denied(x,CODES.SESSION_UNAVAILABLE);
  // Existing QA legacy records intentionally have NO V2 idle clock.
  // No V2 migration or live request is allowed in V2-02.
});

test("P-018 privileged role and missing case grant never bypass policy",()=>{
  const x=fixture(O.EVIDENCE_READ);
  x.principal.role="qa_entitlement_admin";denied(x);
  const y=fixture(O.EVIDENCE_READ);delete y.caseGrant;denied(y);
  const z=fixture(O.TEST_GRANT_MANAGE);
  z.principal.role="case_reviewer";denied(z);
  // DB role grants/RLS are NOT inspected or modified in V2-02.
});

test("single-factor mutation of sensitive facts must never preserve access",()=>{
  const cases=[
    [O.RANDOM_LIVE_READ,"target",{state:"ended"}],
    [O.RANDOM_LIVE_READ,"peer",{status:"suspended"}],
    [O.RANDOM_LIVE_READ,"participants",{reciprocalBlock:undefined}],
    [O.DIRECT_CREATE,"relation",{memberHigh:"other"}],
    [O.DIRECT_LIVE_SEND,"target",{connectionId:undefined}],
    [O.UNREAD_DELIVER,"target",{acceptedAt:undefined}],
    [O.HISTORY_READ,"target",{retentionPolicyVersion:undefined}],
    [O.HISTORY_READ,"entitlement",{accountId:"outsider"}],
    [O.REPORT_SUBMIT,"target",{sessionId:undefined}],
    [O.EVIDENCE_READ,"caseGrant",{purposeApproved:false}],
    [O.PRIVACY_ACCESS,"principal",{ownershipVerified:false}],
    [O.TEST_GRANT_MANAGE,"target",{environment:"production"}]
  ];
  for(const [op,kind,patch] of cases){
    const x=altered(op,kind,patch);
    denied(x);
  }
});
