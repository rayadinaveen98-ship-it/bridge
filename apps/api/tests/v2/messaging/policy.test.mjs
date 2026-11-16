import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {liveStatus,unreadStatus,requireLive,MessagingDenied} from "../../../src/messaging/scope.mjs";
import {nextAcceptedSequence,signCursor,verifyCursor} from "../../../src/messaging/sequence.mjs";
import {unreadExpiry,recoveryUntil,tokenForAck,tokenDigest,tokenMatches,recoveryAllowed}
  from "../../../src/messaging/unread.mjs";

const T=Date.UTC(2026,10,16,12), K=Buffer.alloc(32,24), a=randomUUID(),b=randomUUID();
const id=randomUUID(),relId=randomUUID();
const accounts=[a,b].map(id=>({id,status:"active",age_verified_at:new Date(T),safety_eligible:true}));
const direct={
  id,kind:"connection",state:"open",policy_version:"bridge-v2",
  v2_session_role:"direct",legacy_qa:false,connection_id:relId,
  last_accepted_at:new Date(T),idle_expires_at:new Date(T+30*60000)
};
const segment={conversation_id:id,connection_id:relId,state:"open",policy_version:"bridge-v2"};
const relation={id:relId,member_low:a,member_high:b,ended_at:null,policy_version:"bridge-v2"};
const base={room:direct,segment,relation,actorId:a,participants:[a,b],accounts,blocked:false};
const envelope={id:randomUUID(),recipient_id:b,connection_id:relId,
  accepted_at:new Date(T),expires_at:new Date(T+7*86400000),state:"unread",
  acknowledged_at:null};
test("M06-01 direct current eligible at +29:59.999; exact +30:00 closed for reads and sends",()=>{
  assert.equal(liveStatus({...base,now:T+1800000-1}),"active");
  assert.equal(liveStatus({...base,now:T+1800000}),"expired");
  assert.throws(()=>requireLive({...base,now:T+1800000}),MessagingDenied);
});
test("M06-02 random uses distinct V2 source markers and no direct relation",()=>{
  const random={...direct,kind:"random",v2_session_role:"random",connection_id:null};
  const args={...base,room:random,segment:null,relation:null,now:T+1};
  assert.equal(liveStatus(args),"active");
  assert.equal(liveStatus({...args,room:{...random,legacy_qa:null}}),"unavailable");
  assert.equal(liveStatus({...args,segment}),"unavailable");
});
test("M06-03..06 session/relationship/block/account/resource gates deny",()=>{
  const yes={...base,now:T+1};
  assert.equal(liveStatus({...yes,actorId:randomUUID()}),"unavailable");
  assert.equal(liveStatus({...yes,participants:[a,a]}),"unavailable");
  assert.equal(liveStatus({...yes,accounts:[accounts[0],accounts[0]]}),"unavailable");
  assert.equal(liveStatus({...yes,accounts:[accounts[0],{...accounts[1],safety_eligible:false}]}),"unavailable");
  assert.equal(liveStatus({...yes,blocked:true}),"unavailable");
  assert.equal(liveStatus({...yes,relation:{...relation,ended_at:new Date(T)}}),"unavailable");
  assert.equal(liveStatus({...yes,room:{...direct,connection_id:randomUUID()}}),"unavailable");
  assert.equal(liveStatus({...yes,room:{...direct,state:"closed"}}),"closed");
});
test("M06-07..09 sequence advances once and duplicate has unchanged next counter",()=>{
  assert.deepEqual(nextAcceptedSequence(1),{sequence:1,next:2});
  assert.deepEqual(nextAcceptedSequence(2,{duplicate:true}),{sequence:1,next:2});
  assert.throws(()=>nextAcceptedSequence(Number.MAX_SAFE_INTEGER),RangeError);
});
test("M06-13..15 opaque cursor binds actor, scope and room; forgery fails",()=>{
  const token=signCursor({actorId:a,conversationId:id,afterSequence:42,key:K});
  assert.equal(verifyCursor(token,{actorId:a,conversationId:id,key:K}),42);
  assert.equal(verifyCursor(token,{actorId:b,conversationId:id,key:K}),null);
  assert.equal(verifyCursor(token,{actorId:a,conversationId:randomUUID(),key:K}),null);
  assert.equal(verifyCursor(token,{actorId:a,conversationId:id,scope:"unread",key:K}),null);
  assert.equal(verifyCursor(token.slice(0,-1)+"X",{actorId:a,conversationId:id,key:K}),null);
  assert.equal(verifyCursor("nonsense",{actorId:a,conversationId:id,key:K}),null);
});
test("M06-16..21 unread is recipient-only, finite and independent of source chat closure",()=>{
  const ctx={envelope,actorId:b,relation,accounts,now:T+7*86400000-1};
  assert.equal(unreadStatus(ctx),"unread");
  assert.equal(unreadStatus({...ctx,now:T+7*86400000}),"expired");
  assert.equal(unreadStatus({...ctx,actorId:a}),"unavailable");
  assert.equal(unreadStatus({...ctx,blocked:true}),"unavailable");
  assert.equal(unreadStatus({...ctx,relation:{...relation,ended_at:new Date(T)}}),"unavailable");
  assert.equal(unreadStatus({...ctx,envelope:{...envelope,expires_at:new Date(T+8*86400000)}}),"expired");
  assert.equal(unreadExpiry(T).getTime(),T+7*86400000);
});
test("M06-22..24 bounded acknowledgment recovery, digest and wrong token denial",()=>{
  const ack=T+60000,until=recoveryUntil(T,ack);
  assert.equal(until.getTime(),ack+900000);
  const token=tokenForAck({envelopeId:envelope.id,recipientId:b,acknowledgedAt:ack,key:K});
  const digest=tokenDigest(token);
  assert.equal(tokenMatches(token,digest),true);
  assert.equal(tokenMatches(token+"bad",digest),false);
  const consumed={...envelope,state:"acknowledged",acknowledged_at:new Date(ack)};
  assert.equal(recoveryAllowed({envelope:consumed,now:ack+899999,token,digest}),true);
  assert.equal(recoveryAllowed({envelope:consumed,now:ack+900000,token,digest}),false);
  assert.equal(recoveryAllowed({envelope:consumed,now:ack+1,token:"forged",digest}),false);
  assert.equal(recoveryUntil(T,T+7*86400000-1).getTime(),T+7*86400000);
  assert.equal(recoveryUntil(T,T+7*86400000),null);
});
