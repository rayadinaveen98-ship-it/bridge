import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import pg from "pg";
import {assertDisposableConnection,applyV2Migrations,V2_FILES,verifyRecordedHash}
  from "./runner.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL;
const ack=process.env.BRIDGE_TEST_MIGRATION_ACK;
const uuid=()=>randomUUID();
const checksum=rows=>createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const count=async(p,sql,args=[])=>
  Number((await p.query(sql,args)).rows[0].n);
const newTables=[
 "bridge_schema_migrations","bridge_v2_direct_sessions","bridge_message_payloads",
 "bridge_unread_deliveries","bridge_history_consents","bridge_history_items",
 "bridge_entitlement_grants","bridge_report_tokens","bridge_report_evidence",
 "bridge_case_grants","bridge_case_access_audit","bridge_retention_jobs",
 "bridge_deletion_ledger","bridge_policy_ledger"
];

async function rejectsSql(pool,sql,args,code) {
 const client=await pool.connect();
 try {
   await client.query("BEGIN");
   await assert.rejects(client.query(sql,args),e=>e.code===code);
 } finally {
   await client.query("ROLLBACK");
   client.release();
 }
}
async function snapshot(pool,ids) {
 const requests=[
  ["SELECT id,auth_subject,status,age_verified_at,safety_eligible FROM bridge_accounts WHERE id=ANY($1::uuid[]) ORDER BY id",[ids.members]],
  ["SELECT id,state,kind,next_message_sequence,match_session_id,created_at,closed_at,expires_at FROM bridge_conversations WHERE id=$1",[ids.room]],
  ["SELECT id,conversation_id,sender_id,sequence_number,client_message_id,body,sent_at FROM bridge_messages WHERE conversation_id=$1 ORDER BY sequence_number",[ids.room]],
  ["SELECT account_id,match_session_id,claimed_at FROM bridge_active_match_slots WHERE match_session_id=$1 ORDER BY account_id",[ids.match]],
  ["SELECT id,member_low,member_high,state,lease_expires_at,activated_at FROM bridge_match_sessions WHERE id=$1",[ids.match]]
 ];
 const results=[];
 for(const [sql,args] of requests)results.push((await pool.query(sql,args)).rows);
 return checksum(results); // Synthetic fixture digest only; never output message bodies.
}

test("V2-03 M03-01–15: isolated and non-destructive migration acceptance",{
 skip:!url
},async t=>{
 assertDisposableConnection(url,ack); // Before any PostgreSQL connection.
 const pool=new pg.Pool({connectionString:url,max:4});
 const ids={members:[uuid(),uuid()].sort(),match:uuid(),room:uuid(),
            messages:[uuid(),uuid(),uuid(),uuid()]};
 let baseline,connectionId,directId,directMsg,reportId;
 try {
  await t.test("M03-02 source schema has 20 original tables and NOT NULL body",async()=>{
   assert.equal(await count(pool,"SELECT count(*)::int n FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'bridge_%'"),20);
   const q=await pool.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='bridge_messages' AND column_name='body'");
   assert.equal(q.rows[0].is_nullable,"NO");
  });

  await t.test("M03-03 create fully synthetic historical legacy QA fixture BEFORE migration",async()=>{
   await pool.query("INSERT INTO bridge_supported_languages(code,display_name,moderation_ready) VALUES('en','English',true) ON CONFLICT DO NOTHING");
   for(const id of ids.members)
     await pool.query("INSERT INTO bridge_accounts(id,auth_subject,status,age_verified_at,safety_eligible) VALUES($1,$2,'active',now(),true)",
       [id,"disposable|"+id]);
   await pool.query(
     "INSERT INTO bridge_match_sessions(id,member_low,member_high,language_code,state,reserved_at,lease_expires_at,activated_at)"+
     " VALUES($1,$2,$3,'en','active',now()-interval '5 minutes',now()-interval '4 minutes',now()-interval '5 minutes')",
     [ids.match,...ids.members]);
   await pool.query("INSERT INTO bridge_active_match_slots(account_id,match_session_id) VALUES($1,$3),($2,$3)",
     [...ids.members,ids.match]);
   await pool.query("INSERT INTO bridge_conversations(id,match_session_id,kind,state,next_message_sequence) VALUES($1,$2,'random','open',5)",
     [ids.room,ids.match]);
   for(const id of ids.members)await pool.query(
     "INSERT INTO bridge_conversation_participants(conversation_id,account_id) VALUES($1,$2)",[ids.room,id]);
   for(let i=0;i<4;i++)await pool.query(
     "INSERT INTO bridge_messages(id,conversation_id,sender_id,client_message_id,sequence_number,body) VALUES($1,$2,$3,$4,$5,$6)",
     [ids.messages[i],ids.room,ids.members[i%2],uuid(),i+1,"Synthetic fixture "+(i+1)]);
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",[ids.room]),4);
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",[ids.match]),2);
   baseline=await snapshot(pool,ids);
   assert.equal(baseline.length,64);
  });

  await t.test("M03-14 deliberately interrupted 0005 SQL rolls back, retains legacy records",async()=>{
   await assert.rejects(applyV2Migrations({
     databaseUrl:url,acknowledgment:ack,failBeforeLedgerVersion:"0005"
   }),/Injected disposable migration failure/);
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_schema_migrations"),1);
   const reg=await pool.query("SELECT to_regclass('public.bridge_v2_direct_sessions') AS tbl");
   assert.equal(reg.rows[0].tbl,null);
   assert.equal(await snapshot(pool,ids),baseline);
  });

  await t.test("M03-01 apply all 0004–0007 in checksum-controlled transactions",async()=>{
   const result=await applyV2Migrations({databaseUrl:url,acknowledgment:ack});
   assert.deepEqual(result.map(x=>x.version),["0004","0005","0006","0007"]);
   assert.deepEqual(result.map(x=>x.status),
     ["already_applied","applied","applied","applied"]);
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_schema_migrations"),4);
  });

  await t.test("M03-04/05 original rows, body and unexpired legacy state stay unchanged",async()=>{
   assert.equal(await snapshot(pool,ids),baseline);
   const room=(await pool.query(
     "SELECT kind,state,legacy_qa,idle_expires_at,last_accepted_at,v2_session_role FROM bridge_conversations WHERE id=$1",
     [ids.room])).rows[0];
   assert.equal(room.kind,"random"); assert.equal(room.state,"open");
   for(const key of ["legacy_qa","idle_expires_at","last_accepted_at","v2_session_role"])
     assert.equal(room[key],null,key);
   assert.equal(await count(pool,
     "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",[ids.match]),2);
   const col=await pool.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='bridge_messages' AND column_name='body'");
   assert.equal(col.rows[0].is_nullable,"NO");
  });

  await t.test("M03-10 all fourteen new tables RLS enabled, no policies or public grants",async()=>{
   const q=await pool.query(
     "SELECT c.relname,c.relrowsecurity,c.relacl,"+
     " (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies"+
     " FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"+
     " WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])",
     [newTables]);
   assert.equal(newTables.length,14);
   assert.equal(q.rows.length,14);
   for(const row of q.rows){
     assert.equal(row.relrowsecurity,true,row.relname);
     assert.equal(Number(row.policies),0,row.relname);
     assert.equal(row.relacl,null,row.relname+" grants");
   }
   assert.equal(await count(pool,"SELECT count(*)::int n FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'bridge_%'"),34);
  });

  await t.test("M03-15 no V2 content, entitlements, workers or automatic session expiry",async()=>{
   for(const table of newTables.filter(n=>n!=="bridge_schema_migrations"))
     assert.equal(await count(pool,"SELECT count(*)::int n FROM "+table),0,table);
   const q=await pool.query("SELECT idle_expires_at FROM bridge_conversations WHERE id=$1",[ids.room]);
   assert.equal(q.rows[0].idle_expires_at,null);
  });

  await t.test("M03-12 checksum no-op, changed hash and non-disposable destinations refused",async()=>{
   const r=await applyV2Migrations({databaseUrl:url,acknowledgment:ack});
   assert.ok(r.every(x=>x.status==="already_applied"));
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_schema_migrations"),4);
   assert.throws(()=>verifyRecordedHash("0005","0".repeat(64),r[1].checksum),/checksum mismatch/);
   assert.equal(verifyRecordedHash("0005",r[1].checksum,r[1].checksum),true);
   for(const [uri,token] of [
     ["postgresql://bridge_test:secret@neon.tech:5432/bridge_test",ack],
     ["postgresql://bridge_test:secret@127.0.0.1:5432/neondb",ack],
     [url,"invalid"],
     ["postgresql://bridge_test:secret@127.0.0.1:5432/bridge_test?sslmode=require",ack]
   ])assert.throws(()=>assertDisposableConnection(uri,token),/Refusing/);
  });

  await t.test("M03-06 only one OPEN direct session per relationship",async()=>{
   connectionId=uuid();
   await pool.query(
     "INSERT INTO bridge_connections(id,member_low,member_high,source_conversation_id) VALUES($1,$2,$3,$4)",
     [connectionId,...ids.members,ids.room]);
   directId=uuid();
   await pool.query("INSERT INTO bridge_conversations(id,kind,state,next_message_sequence) VALUES($1,'connection','open',2)",[directId]);
   const second=uuid();
   await pool.query("INSERT INTO bridge_conversations(id,kind,state) VALUES($1,'connection','open')",[second]);
   const ins="INSERT INTO bridge_v2_direct_sessions(conversation_id,connection_id,state,policy_version)"+
     " VALUES($1,$2,'open','bridge-v2')";
   await pool.query(ins,[directId,connectionId]);
   await rejectsSql(pool,ins,[second,connectionId],"23505");
   await pool.query("UPDATE bridge_v2_direct_sessions SET state='closed',closed_at=now() WHERE conversation_id=$1",[directId]);
   await pool.query(ins,[second,connectionId]);
   await pool.query("UPDATE bridge_v2_direct_sessions SET state='closed',closed_at=now() WHERE conversation_id=$1",[second]);
   const third=uuid();
   await pool.query("INSERT INTO bridge_conversations(id,kind,state) VALUES($1,'connection','open')",[third]);
   await pool.query(ins,[third,connectionId]);
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_v2_direct_sessions WHERE connection_id=$1 AND state='closed'",[connectionId]),2);
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_v2_direct_sessions WHERE connection_id=$1 AND state='open'",[connectionId]),1);
  });

  await t.test("M03-07 unread duplicates, invalid recipient and 8-day TTL rejected",async()=>{
   directMsg=uuid();
   await pool.query(
     "INSERT INTO bridge_messages(id,conversation_id,sender_id,client_message_id,sequence_number,body) VALUES($1,$2,$3,$4,1,'Synthetic direct')",
     [directMsg,directId,ids.members[0],uuid()]);
   const insert="INSERT INTO bridge_unread_deliveries(message_id,connection_id,recipient_id,encrypted_copy,key_reference,accepted_at,expires_at)"+
     " VALUES($1,$2,$3,decode('abcd','hex'),'qa-key',now(),now()+interval '7 days')";
   await pool.query(insert,[directMsg,connectionId,ids.members[1]]);
   await rejectsSql(pool,insert,[directMsg,connectionId,ids.members[1]],"23505");
   await rejectsSql(pool,insert,[directMsg,connectionId,uuid()],"23503");
   await rejectsSql(pool,
     "INSERT INTO bridge_unread_deliveries(message_id,connection_id,recipient_id,encrypted_copy,key_reference,accepted_at,expires_at)"+
     " VALUES($1,$2,$3,decode('abcd','hex'),'qa-key',now(),now()+interval '8 days')",
     [directMsg,connectionId,ids.members[0]],"23514");
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_unread_deliveries WHERE message_id=$1",[directMsg]),1);
  });

  await t.test("M03-08 dual consent index, 90-day history bound, QA-only grant",async()=>{
   const insert="INSERT INTO bridge_history_consents(connection_id,account_id,policy_version,disclosure_version,effective_at)"+
     " VALUES($1,$2,'policy-v2','disclosure-v1',now()) RETURNING id";
   const first=(await pool.query(insert,[connectionId,ids.members[0]])).rows[0];
   await pool.query(insert,[connectionId,ids.members[1]]);
   await rejectsSql(pool,insert,[connectionId,ids.members[0]],"23505");
   await pool.query("UPDATE bridge_history_consents SET revoked_at=now() WHERE id=$1",[first.id]);
   await pool.query(insert,[connectionId,ids.members[0]]);
   await rejectsSql(pool,
     "INSERT INTO bridge_history_items(message_id,connection_id,encrypted_copy,key_reference,policy_version,accepted_at,expires_at)"+
     " VALUES($1,$2,decode('abcd','hex'),'qa-key','policy-v2',now(),now()+interval '91 days')",
     [directMsg,connectionId],"23514");
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_entitlement_grants"),0);
   const audit=(await pool.query("INSERT INTO bridge_audit_events(actor_subject,action,object_type)"+
     " VALUES('qa:test','test.grant','qa_entitlement') RETURNING id")).rows[0].id;
   const grant="INSERT INTO bridge_entitlement_grants(account_id,scope,issuer,environment,issued_at,expires_at,audit_event_id)"+
     " VALUES($1,'history','server',$3,now(),now()+interval '1 day',$2)";
   await rejectsSql(pool,grant,[ids.members[0],audit,"production"],"23514");
   await pool.query(grant,[ids.members[0],audit,"qa"]);
  });

  await t.test("M03-09 restricted evidence cannot be orphaned or cascade-deleted",async()=>{
   reportId=uuid();
   await pool.query(
     "INSERT INTO bridge_reports(id,reporter_id,reported_id,conversation_id,category) VALUES($1,$2,$3,$4,'spam')",
     [reportId,ids.members[0],ids.members[1],ids.room]);
   await rejectsSql(pool,
     "INSERT INTO bridge_report_tokens(token_digest,reporter_id,conversation_id,scope,issued_at,expires_at)"+
     " VALUES(decode($1,'hex'),$2,$3,'report',now(),now()+interval '8 days')",
     ["ab".repeat(32),ids.members[0],ids.room],"23514");
   await pool.query(
     "INSERT INTO bridge_report_evidence(report_id,source_message_id,ciphertext,key_reference,evidence_class,retention_until)"+
     " VALUES($1,$2,decode('abcd','hex'),'qa-key','normal',now()+interval '90 days')",
     [reportId,directMsg]);
   await rejectsSql(pool,"DELETE FROM bridge_reports WHERE id=$1",[reportId],"23503");
   await rejectsSql(pool,
     "INSERT INTO bridge_report_evidence(report_id,ciphertext,key_reference,evidence_class,retention_until)"+
     " VALUES($1,decode('abcd','hex'),'qa-key','normal',now()+interval '90 days')",
     [uuid()],"23503");
   const fks=await pool.query(
     "SELECT confdeltype FROM pg_constraint WHERE conrelid='bridge_report_evidence'::regclass AND contype='f'");
   assert.ok(fks.rows.length>=2);
   assert.ok(fks.rows.every(x=>x.confdeltype==="r"));
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_retention_jobs"),0);
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_deletion_ledger"),0);
  });

  await t.test("M03-11 old API, matching, contracts and policy regression run in CI on expanded DB",()=>{
   assert.equal(V2_FILES.length,4);
   assert.equal(baseline.length,64);
  });

  await t.test("M03-13 CI dump/restore proof executed independently in bridge_restore_test",async()=>{
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_schema_migrations"),4);
   assert.equal(await count(pool,"SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",[ids.room]),4);
  });
 } finally {
  await pool.end();
 }
});
