import test from "node:test";
import assert from "node:assert/strict";
import {createClock, MINUTE, RANDOM_IDLE} from "../helpers/clock.mjs";
import {user,users} from "../helpers/accounts.mjs";
import {randomSession,relationship} from "../helpers/session_factory.mjs";
import {
  canMatch,claimMatchSlots,alive,currentAccess,acceptUniqueMessage,
  canCreateConnection,startNewDirect
} from "../helpers/reference_contract.mjs";

// Every assertion here is against a test-only reference oracle, NOT the API.
test("CT-001 eligible pair with common moderated choice; outsiders, blocks and minors fail",()=>{
  const pair={a:users.a,b:users.b,language:"en",
    moderationReady:["en","te"],blocks:[],slots:[]};
  assert.equal(canMatch(pair),true);
  assert.equal(canMatch({...pair,a:users.underage}),false);
  assert.equal(canMatch({...pair,a:users.restricted}),false);
  assert.equal(canMatch({...pair,b:user("b",{selectedLanguages:["te"]})}),false);
  assert.equal(canMatch({...pair,moderationReady:["te"]}),false);
  assert.equal(canMatch({...pair,blocks:[{blocker:"b",blocked:"a"}]}),false);
  assert.equal(canMatch({...pair,a:users.a,b:users.a}),false);
});

test("CT-002 one active match slot per account contract across competing attempts",()=>{
  const first=claimMatchSlots([],"a","b");
  assert.equal(first.length,2);
  assert.equal(claimMatchSlots(first,"a","outsider"),null);
  assert.equal(claimMatchSlots(first,"b","outsider"),null);
  assert.equal(claimMatchSlots([],"a","a"),null);
  assert.equal(first.length,2,"a rejected request must not mutate committed slots");
  assert.equal(canMatch({a:users.a,b:users.outsider,language:"en",
    moderationReady:["en"],slots:first}),false);
  // Transactional SQL enforcement belongs to V2-04; this is an expected contract.
});

test("CT-003 random session is live at 29:59 and expires at exactly 30:00",()=>{
  const clock=createClock(0),room=randomSession({lastAcceptedAt:clock.now()});
  clock.set(RANDOM_IDLE-1000);
  assert.equal(alive(room,clock.now()),true);
  clock.advance(1000);
  assert.equal(alive(room,clock.now()),false);
  assert.equal(currentAccess({session:room,actorId:"a",now:clock.now()}),false);
  assert.equal(currentAccess({session:room,actorId:"outsider",now:0}),false);
});

test("CT-004 new accepted unique message resets clock; repeat and passive events cannot",()=>{
  const clock=createClock(0);
  const room=randomSession({lastAcceptedAt:0});
  clock.set(29*MINUTE);
  const first=acceptUniqueMessage({session:room,actorId:"a",now:clock.now(),clientMessageId:"id-1"});
  assert.equal(first.status,"accepted");
  assert.equal(first.session.lastAcceptedAt,29*MINUTE);
  const duplicate=acceptUniqueMessage({session:first.session,actorId:"a",
    now:clock.now()+20*MINUTE,clientMessageId:"id-1"});
  assert.equal(duplicate.status,"duplicate");
  assert.equal(duplicate.session.lastAcceptedAt,29*MINUTE);
  // The model has no state-mutating read, typing, notification or Keep method.
  assert.equal(alive(duplicate.session,59*MINUTE),false);
  const blocked=acceptUniqueMessage({session:room,actorId:"outsider",
    now:1,clientMessageId:"id-2"});
  assert.equal(blocked.status,"denied");
  assert.equal(blocked.session.lastAcceptedAt,0);
});

test("CT-005 Back/reopen can only rejoin same open unexpired session",()=>{
  const room=randomSession({id:"room-a",lastAcceptedAt:0});
  assert.equal(currentAccess({session:room,actorId:"a",now:1}),true);
  assert.equal(currentAccess({session:room,actorId:"b",now:1}),true);
  assert.equal(currentAccess({session:room,actorId:"c",now:1}),false);
  assert.equal(currentAccess({session:{...room,state:"ended"},actorId:"a",now:1}),false);
  assert.equal(currentAccess({session:room,actorId:"a",now:RANDOM_IDLE}),false);
  assert.equal(currentAccess({session:{...room,state:"converted"},actorId:"a",now:1}),false);
});

test("CT-006 two current Keep votes required before idle expiry, End or block",()=>{
  const room=randomSession({lastAcceptedAt:0});
  const both=[{voterId:"a",status:"accepted"},{voterId:"b",status:"accepted"}];
  assert.equal(canCreateConnection({session:room,votes:both,now:1}),true);
  assert.equal(canCreateConnection({session:room,votes:both.slice(0,1),now:1}),false);
  assert.equal(canCreateConnection({session:room,
    votes:[both[0],{voterId:"b",status:"withdrawn"}],now:1}),false);
  assert.equal(canCreateConnection({session:room,votes:both,now:RANDOM_IDLE}),false);
  assert.equal(canCreateConnection({session:{...room,state:"ended"},votes:both,now:1}),false);
  assert.equal(canCreateConnection({session:room,votes:both,now:1,
    blocks:[{blocker:"a",blocked:"b"}]}),false);
  // Real Keep/End/expiry interleavings need PostgreSQL lock tests in V2-05.
});

test("CT-007 mutual relationship creates clean new free direct segment",()=>{
  const source=randomSession({messageIds:["stranger-1","stranger-2"]});
  const saved=relationship();
  const direct=startNewDirect({connection:saved,actorId:"a",now:0});
  assert.equal(direct.kind,"direct");
  assert.equal(direct.connectionId,saved.id);
  assert.notEqual(direct.id,source.id);
  assert.deepEqual(direct.messageIds,[]);
  assert.deepEqual(source.messageIds,["stranger-1","stranger-2"]);
  assert.equal(startNewDirect({connection:saved,actorId:"outsider",now:0}),null);
  assert.equal(startNewDirect({connection:{...saved,state:"ended"},actorId:"a",now:0}),null);
  assert.equal(startNewDirect({connection:saved,actorId:"a",now:0,
    blocks:[{blocker:"b",blocked:"a"}]}),null);
  assert.equal(alive(direct,30*MINUTE),false);
  assert.equal(startNewDirect({connection:saved,actorId:"b",now:31*MINUTE})!==null,true);
});
