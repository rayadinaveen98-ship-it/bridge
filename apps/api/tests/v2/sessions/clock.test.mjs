import test from "node:test";
import assert from "node:assert/strict";
import {RANDOM_IDLE_MS,RANDOM_POLICY,deadlineFrom,isManagedRandom,evaluateRandom}
  from "../../../src/sessions/clock.mjs";
import {mayResume,mayKeep,maySend,nextAcceptedClock,terminalReason}
  from "../../../src/sessions/random_lifecycle.mjs";
const BASE=Date.UTC(2026,10,16,12,0,0);
const managed=(changes={})=>({
  id:"v2",kind:"random",v2_session_role:"random",policy_version:RANDOM_POLICY,
  legacy_qa:false,state:"open",
  last_accepted_at:new Date(BASE),idle_expires_at:new Date(BASE+RANDOM_IDLE_MS),
  ...changes
});
test("R04-01/02/03: clock starts +30m, 29:59.999 live, 30:00.000 denied",()=>{
  const room=managed();
  assert.equal(deadlineFrom(new Date(BASE)),BASE+RANDOM_IDLE_MS);
  assert.equal(isManagedRandom(room),true);
  assert.equal(evaluateRandom(room,new Date(BASE+RANDOM_IDLE_MS-1)),"active");
  assert.equal(evaluateRandom(room,new Date(BASE+RANDOM_IDLE_MS)),"expired");
  assert.equal(evaluateRandom(room,new Date(BASE+RANDOM_IDLE_MS+1)),"expired");
  assert.equal(mayResume(room,new Date(BASE+RANDOM_IDLE_MS)),false);
  assert.equal(maySend(room,new Date(BASE+RANDOM_IDLE_MS)),false);
  assert.equal(mayKeep(room,new Date(BASE+RANDOM_IDLE_MS)),false);
});
test("R04-04/05: only a new unique accepted message gets a fresh deadline",()=>{
  const room=managed();
  const clock=nextAcceptedClock(room,new Date(BASE+RANDOM_IDLE_MS-1),true);
  assert.equal(clock.lastAcceptedAt.getTime(),BASE+RANDOM_IDLE_MS-1);
  assert.equal(clock.idleExpiresAt.getTime(),BASE+2*RANDOM_IDLE_MS-1);
  assert.equal(nextAcceptedClock(room,new Date(BASE+RANDOM_IDLE_MS-1),false),null);
  assert.equal(nextAcceptedClock(room,new Date(BASE+RANDOM_IDLE_MS),true),null);
});
test("R04-07/08/09/21: passive events never advance a clock or recover expired room",()=>{
  const room=managed();
  const original=room.idle_expires_at.getTime();
  for(const action of ["typing","polling","read","keep","resume","heartbeat","notification"]){
    assert.equal(evaluateRandom(room,new Date(BASE+1000)),"active",action);
    assert.equal(room.idle_expires_at.getTime(),original);
  }
  assert.equal(mayResume(room,new Date(BASE+35*60_000)),false);
});
test("R04-11/13/14: irreversible terminal reason and expiry precedence",()=>{
  assert.equal(terminalReason(managed(),new Date(BASE+1),"ended"),"ended");
  assert.equal(terminalReason(managed(),new Date(BASE+RANDOM_IDLE_MS),"ended"),"expired");
  assert.equal(terminalReason(managed(),new Date(BASE+1),"expired"),null);
  assert.equal(terminalReason(managed(),new Date(BASE+1),"safety_closed"),"safety_closed");
  assert.equal(terminalReason(managed({state:"closed",closed_reason:"safety_closed"}),new Date(BASE+RANDOM_IDLE_MS+1),"expired"),"safety_closed");
  assert.equal(mayKeep(managed({state:"closed",closed_reason:"expired"}),new Date(BASE+1)),false);
});
test("R04-17/18: null legacy state protected; incomplete V2 marker fails closed",()=>{
  const legacy=managed({policy_version:null,legacy_qa:null,
    last_accepted_at:null,idle_expires_at:null});
  assert.equal(isManagedRandom(legacy),false);
  assert.equal(evaluateRandom(legacy,new Date(BASE)),"unavailable");
  for(const change of [
    {legacy_qa:null},{legacy_qa:true},{kind:"connection"},
    {policy_version:null},{v2_session_role:null},{last_accepted_at:null},
    {idle_expires_at:null},{idle_expires_at:new Date(BASE+RANDOM_IDLE_MS+1000)}
  ]){
    assert.equal(mayResume(managed(change),new Date(BASE+1)),false,JSON.stringify(change));
  }
});
test("R04-19: invalid server clock never authorizes protected operations",()=>{
  for(const now of [null,undefined,Number.NaN,-1,Infinity,"bad",new Date("invalid")]){
    assert.equal(evaluateRandom(managed(),now),"unavailable");
  }
  assert.equal(deadlineFrom(undefined),null);
  assert.equal(deadlineFrom(Number.MAX_SAFE_INTEGER),null);
});
