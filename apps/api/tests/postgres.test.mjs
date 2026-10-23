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
