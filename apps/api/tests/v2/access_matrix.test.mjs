import test from "node:test";
import assert from "node:assert/strict";
import {MINUTE,DAY,RANDOM_IDLE} from "./helpers/clock.mjs";
import {randomSession,relationship,delivery} from "./helpers/session_factory.mjs";
import {authorizePayload} from "./helpers/reference_contract.mjs";

/**
 * BR-012 / BR-014 / BR-024: path x participant x session authorization.
 * The real API must replace this isolated model during V2-02/V2-06/V2-11.
 */
test("V2 access matrix: LIVE, UNREAD and HISTORY remain independently scoped",()=>{
  const room=randomSession({lastAcceptedAt:0});
  const connected=relationship();
  const unread=delivery({recipientId:"b",acceptedAt:0});
  const messages=[
    {kind:"direct",connectionId:connected.id,
      acceptedAt:DAY,retainedProspectively:true,retentionPolicyVersion:"v2"}
  ];
  const consent=connected.members.map(accountId=>({
    accountId,connectionId:connected.id,policyVersion:"v2",
    effectiveAt:0,revokedAt:null
  }));
  const grant={accountId:"a",environment:"qa",scope:"history",
    issuedAt:0,expiresAfter:180*DAY,revoked:false};
  const variants=[
    ["LIVE a current",true,{kind:"LIVE",actorId:"a",session:room,now:1}],
    ["LIVE b current",true,{kind:"LIVE",actorId:"b",session:room,now:1}],
    ["LIVE outsider denied",false,{kind:"LIVE",actorId:"outsider",session:room,now:1}],
    ["LIVE expired denied",false,{kind:"LIVE",actorId:"a",session:room,now:RANDOM_IDLE}],
    ["LIVE blocked denied",false,{kind:"LIVE",actorId:"a",session:room,now:1,
      blocks:[{blocker:"b",blocked:"a"}]}],
    ["UNREAD b present",true,{kind:"UNREAD",actorId:"b",connection:connected,envelope:unread,now:1}],
    ["UNREAD sender not recipient",false,{kind:"UNREAD",actorId:"a",connection:connected,envelope:unread,now:1}],
    ["UNREAD outsider denied",false,{kind:"UNREAD",actorId:"outsider",connection:connected,envelope:unread,now:1}],
    ["UNREAD blocked denied",false,{kind:"UNREAD",actorId:"b",connection:connected,envelope:unread,now:1,
      blocks:[{blocker:"a",blocked:"b"}]}],
    ["HISTORY entitled with consent",true,{kind:"HISTORY",actorId:"a",connection:connected,
      message:messages[0],consents:consent,grant,now:DAY+1}],
    ["HISTORY no viewer entitlement denied",false,{kind:"HISTORY",actorId:"b",connection:connected,
      message:messages[0],consents:consent,grant,now:DAY+1}],
    ["HISTORY no bilateral consent denied",false,{kind:"HISTORY",actorId:"a",connection:connected,
      message:messages[0],consents:consent.slice(0,1),grant,now:DAY+1}],
    ["HISTORY stranger-body denied",false,{kind:"HISTORY",actorId:"a",connection:connected,
      message:{...messages[0],kind:"random"},consents:consent,grant,now:DAY+1}],
    ["HISTORY revoked relation denied",false,{kind:"HISTORY",actorId:"a",
      connection:{...connected,state:"ended"},message:messages[0],
      consents:consent,grant,now:DAY+1}],
    ["Unknown scope denied",false,{kind:"ALL_MESSAGES",actorId:"a",session:room,now:1}]
  ];
  for(const [label,expected,request] of variants) {
    assert.equal(authorizePayload(request),expected,label);
  }
});
