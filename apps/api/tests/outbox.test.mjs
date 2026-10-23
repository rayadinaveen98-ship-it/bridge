import test from "node:test";
import assert from "node:assert/strict";
import { createOutboxDispatcher } from "../src/outbox.mjs";

const event = {id:"e1",event_key:"message:m1",event_type:"conversation.message.accepted",
  conversation_id:"c1",payload:{messageId:"m1",sequenceNumber:1},attempts:1};

test("acknowledges delivery only after publisher completes",async()=>{
  const calls=[];
  const pool={async query(sql,args){
    calls.push(sql);
    if(sql.includes("WITH claim"))return {rows:[event]};
    if(sql.includes("published_at=now()"))return {rows:[{id:"e1"}]};
    throw new Error("unexpected SQL");
  }};
  const result=await createOutboxDispatcher(pool,async x=>{
    assert.equal(x.payload.messageId,"m1");
    calls.push("published to transport");
  }).drainOnce();
  assert.deepEqual(result,{claimed:1,published:1,failed:0});
  assert.ok(calls.indexOf("published to transport") < calls.findIndex(x=>x.includes("published_at=now()")));
});
test("publisher failures leave event retryable instead of acknowledging",async()=>{
  const calls=[];
  const pool={async query(sql){
    calls.push(sql);
    if(sql.includes("WITH claim"))return {rows:[event]};
    if(sql.includes("available_at=now()"))return {rows:[]};
    throw new Error("must not acknowledge");
  }};
  const errors=[];
  const result=await createOutboxDispatcher(pool,async()=>{throw new Error("offline")},
    e=>errors.push(e.message)).drainOnce();
  assert.deepEqual(result,{claimed:1,published:0,failed:1});
  assert.ok(calls.some(x=>x.includes("available_at=now()")));
  assert.ok(!calls.some(x=>x.includes("published_at=now()")));
  assert.deepEqual(errors,["offline"]);
});
test("requires bounded batch size",async()=>{
  const pool={query:async()=>({rows:[]})};
  await assert.rejects(createOutboxDispatcher(pool,async()=>{}).drainOnce(0),RangeError);
  await assert.rejects(createOutboxDispatcher(pool,async()=>{}).drainOnce(101),RangeError);
});
