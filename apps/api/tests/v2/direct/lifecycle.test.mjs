import test from "node:test";
import assert from "node:assert/strict";
import {DIRECT_IDLE_MS,DIRECT_POLICY,directState,isV2Direct,mayStartDirect}
  from "../../../src/sessions/direct_lifecycle.mjs";
const T=Date.UTC(2026,10,16,12,0,0),REL="rel";
const room={
  id:"dm",kind:"connection",state:"open",policy_version:DIRECT_POLICY,
  v2_session_role:"direct",legacy_qa:false,connection_id:REL,
  last_accepted_at:new Date(T),idle_expires_at:new Date(T+DIRECT_IDLE_MS)
};
const link={conversation_id:"dm",connection_id:REL,state:"open",
  policy_version:DIRECT_POLICY};
test("C05-21 direct +29:59.999 permits; exact 30:00 denies, independent of relationship",()=>{
  assert.equal(isV2Direct(room,link,REL),true);
  assert.equal(directState(room,link,REL,new Date(T+DIRECT_IDLE_MS-1)),"active");
  assert.equal(directState(room,link,REL,new Date(T+DIRECT_IDLE_MS)),"expired");
  assert.equal(directState(room,link,REL,new Date(T+DIRECT_IDLE_MS+1)),"expired");
  assert.equal(mayStartDirect({policy_version:DIRECT_POLICY,ended_at:null}),true);
  assert.equal(mayStartDirect({policy_version:DIRECT_POLICY,ended_at:new Date(T)}),false);
});
test("C05 direct malformed/cross-link or closed segment fails independently of relationship",()=>{
  for(const wrong of [
    {...room,connection_id:"other"},
    {...room,legacy_qa:null},
    {...room,v2_session_role:"random"},
    {...room,last_accepted_at:null},
    {...room,idle_expires_at:new Date(T+DIRECT_IDLE_MS+1)}
  ])assert.equal(directState(wrong,link,REL,T+1),"unavailable");
  assert.equal(directState(room,{...link,connection_id:"other"},REL,T+1),"unavailable");
  assert.equal(directState(room,{...link,state:"closed"},REL,T+1),"closed");
  assert.equal(directState({...room,state:"closed"},link,REL,T+1),"closed");
  assert.equal(directState(room,link,REL,Number.NaN),"unavailable");
});
