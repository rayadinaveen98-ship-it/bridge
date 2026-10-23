import test from "node:test";
import assert from "node:assert/strict";
import { transaction, createPostgresService } from "../src/postgres.mjs";
import { ApiError } from "../src/auth.mjs";

function stub(queries) {
  const seen=[];
  const client={release(){seen.push(["RELEASE"])},async query(sql,args){seen.push([sql,args]);return queries(sql,args)}};
  return {seen,pool:{connect:async()=>client,query:client.query}};
}
test("commit and release successful transaction",async()=>{
  const d=stub(async()=>({rows:[]}));
  assert.equal(await transaction(d.pool,async()=>42),42);
  assert.deepEqual(d.seen.filter(x=>["BEGIN","COMMIT","ROLLBACK"].includes(x[0])).map(x=>x[0]),["BEGIN","COMMIT"]);
  assert.equal(d.seen.at(-1)[0],"RELEASE");
});
test("roll back and release rejected transaction",async()=>{
  const d=stub(async()=>({rows:[]}));
  await assert.rejects(transaction(d.pool,async()=>{throw new Error("fail")}),/fail/);
  assert.deepEqual(d.seen.filter(x=>["BEGIN","COMMIT","ROLLBACK"].includes(x[0])).map(x=>x[0]),["BEGIN","ROLLBACK"]);
  assert.equal(d.seen.at(-1)[0],"RELEASE");
});
test("no age-verified account cannot queue",async()=>{
  const d=stub(async(sql,args)=>{
    if(sql.includes("FROM bridge_accounts WHERE auth_subject"))return {rows:[{
      id:"account-a",status:"active",age_verified_at:null,safety_eligible:false
    }]};
    return {rows:[]};
  });
  const service=createPostgresService(d.pool);
  await assert.rejects(service.enqueue("user-a",{topic:null,idempotencyKey:"test"}),e=>e instanceof ApiError&&e.status===403);
  assert.equal(d.seen.some(x=>x[0].includes("INSERT INTO bridge_match_queue")),false);
  assert.equal(d.seen.some(x=>x[0]==="ROLLBACK"),true);
});
test("account restrictions fail-closed before preferences update",async()=>{
  const d=stub(async(sql)=>{
    if(sql.includes("FROM bridge_accounts WHERE auth_subject"))return {rows:[{
      id:"account-a",status:"suspended",age_verified_at:new Date(),safety_eligible:true
    }]};
    return {rows:[]};
  });
  const svc=createPostgresService(d.pool);
  await assert.rejects(svc.setPreferences("test",{languageCodes:["en"],interests:[],intention:"just_chat"}),e=>e instanceof ApiError&&e.status===403);
  assert.ok(!d.seen.some(x=>x[0].startsWith("DELETE FROM bridge_account_languages")));
});
test("report requires reporter/target and does not claim moderation action",async()=>{
  const d=stub(async(sql)=>{
    if(sql.includes("FROM bridge_accounts WHERE auth_subject"))return {rows:[{
      id:"account-a",status:"active",age_verified_at:new Date(),safety_eligible:true
    }]};
    if(sql.includes("SELECT id FROM bridge_accounts WHERE id="))return {rows:[]};
    return {rows:[]};
  });
  const svc=createPostgresService(d.pool);
  await assert.rejects(svc.report("test",{reportedAccountId:"account-b",category:"spam"}),e=>e instanceof ApiError&&e.status===404);
  assert.ok(!d.seen.some(x=>x[0].includes("INSERT INTO bridge_reports")));
});

test("expired pending search is reported as expired",async()=>{
  const d=stub(async sql=>{
    if(sql.includes("SELECT id FROM bridge_accounts WHERE auth_subject"))return {rows:[{id:"account-a"}]};
    if(sql.includes("SELECT q.state,q.expires_at"))return {rows:[{
      state:"waiting",expires_at:new Date(Date.now()-60000),conversation_id:null
    }]};
    return {rows:[]};
  });
  const status=await createPostgresService(d.pool).queueStatus("test","request-id");
  assert.equal(status.state,"expired");
});
test("duplicate message with conflicting content is rejected before message insertion",async()=>{
  const d=stub(async(sql)=>{
    if(sql.includes("FROM bridge_accounts WHERE auth_subject"))return {rows:[{
      id:"a",status:"active",age_verified_at:new Date(),safety_eligible:true
    }]};
    if(sql.includes("FROM bridge_conversations WHERE id="))return {rows:[{
      id:"conversation",state:"open",kind:"random",next_message_sequence:8
    }]};
    if(sql.includes("FROM bridge_conversation_participants WHERE conversation_id="))return {rows:[
      {account_id:"a",left_at:null},{account_id:"b",left_at:null}
    ]};
    if(sql.includes("FROM bridge_blocks WHERE"))return {rows:[]};
    if(sql.includes("FROM bridge_accounts WHERE id="))return {rows:[{
      status:"active",age_verified_at:new Date(),safety_eligible:true
    }]};
    if(sql.includes("FROM bridge_messages")&&sql.includes("client_message_id="))return {rows:[{
      id:"old",conversation_id:"conversation",sender_id:"a",sequence_number:7,
      body:"original",sent_at:new Date()
    }]};
    return {rows:[]};
  });
  await assert.rejects(createPostgresService(d.pool).sendMessage("test","conversation",{
    clientMessageId:"client-id",body:"altered"
  }),e=>e instanceof ApiError&&e.status===409);
  assert.ok(!d.seen.some(x=>x[0].includes("INSERT INTO bridge_messages")));
});
