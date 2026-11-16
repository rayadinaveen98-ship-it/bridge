/**
 * B1a disposable-only PostgreSQL 16 physical backup/restore certification.
 * Run AFTER schema.test.mjs, in the same synthetic PG16 CI service.
 * Uses docker exec to access the PG16-matched pg_dump/pg_restore binaries.
 * All created rows are synthetic. Never touches hosted Neon/Render.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import pg from "pg";
import {assertDisposableConnection} from "../migrations/runner.mjs";
import {applyDisposable0008} from "./migration_0008_runner.mjs";
import {seedHistorical,seedSecureDirect,insertLive,insertUnread} from "./fixtures.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL;
const ACK=process.env.BRIDGE_TEST_MIGRATION_ACK;
const QUERY_MAX=32*1024*1024;
function command(name,args,{input=null}={}) {
  const res=spawnSync(name,args,{input,maxBuffer:QUERY_MAX,encoding:null,timeout:30000});
  if(res.error||res.status!==0) {
    const msg=(res.stderr||Buffer.alloc(0)).toString("utf8").slice(0,1400);
    throw Error("Disposable backup command failed: "+name+" "+args.slice(0,2).join(" ")+
      " / "+(res.error?.message||msg||"nonzero status"));
  }
  return res.stdout;
}
function serviceId() {
  const ids=command("docker",["ps","--filter","ancestor=postgres:16",
    "--format","{{.ID}}"]).toString("utf8").trim().split(/\s+/).filter(Boolean);
  if(ids.length!==1||!/^[a-f0-9]{12,64}$/.test(ids[0]))
    throw Error("Exactly one disposable PG16 Docker service required");
  return ids[0];
}
function sqlSnapshot(id,db,sql) {
  return command("docker",["exec",id,"psql","-U","bridge_test","-d",db,
    "-X","-A","-t","-c",sql]).toString("utf8").trim();
}
function digestOf(id,db,fixture,linked) {
  const room=fixture.room,match=fixture.matchId,msg=linked.messageId,link=linked.connectionId;
  const query=[
    "SELECT id,auth_subject,status,age_verified_at,safety_eligible FROM bridge_accounts "+
      "WHERE id IN ('"+fixture.people[0]+"','"+fixture.people[1]+"') ORDER BY id",
    "SELECT id,kind,state,next_message_sequence,match_session_id,created_at,closed_at,expires_at "+
      "FROM bridge_conversations WHERE id='"+room+"'",
    "SELECT id,conversation_id,sender_id,sequence_number,client_message_id,body,sent_at "+
      "FROM bridge_messages WHERE conversation_id='"+room+"' ORDER BY sequence_number",
    "SELECT account_id,match_session_id,claimed_at FROM bridge_active_match_slots "+
      "WHERE match_session_id='"+match+"' ORDER BY account_id",
    "SELECT id,member_low,member_high,state,lease_expires_at,activated_at "+
      "FROM bridge_match_sessions WHERE id='"+match+"'",
    "SELECT id,conversation_id,sender_id,client_message_id,sequence_number,policy_version,accepted_at "+
      "FROM bridge_v2_secure_messages WHERE id='"+msg+"'",
    "SELECT message_id,encode(ciphertext,'hex') AS ct,encode(data_iv,'hex') AS iv,"+
      "encode(data_tag,'hex') AS tag,encode(wrapped_dek,'hex') AS dek,encode(wrap_iv,'hex') AS wiv,"+
      "encode(wrap_tag,'hex') AS wtag,kek_id,kek_version,cipher_suite,aad_version "+
      "FROM bridge_v2_secure_live WHERE message_id='"+msg+"'",
    "SELECT message_id,connection_id,recipient_id,accepted_at,expires_at,state,"+
      "encode(ciphertext,'hex') AS ct,encode(data_iv,'hex') AS iv,encode(data_tag,'hex') AS tag,"+
      "encode(wrapped_dek,'hex') AS dek,encode(wrap_iv,'hex') AS wiv,encode(wrap_tag,'hex') AS wtag,"+
      "kek_id,kek_version,cipher_suite,aad_version "+
      "FROM bridge_v2_secure_unread WHERE connection_id='"+link+"' ORDER BY id",
    "SELECT version,trim(checksum),runner_id FROM bridge_schema_migrations ORDER BY version",
    "SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname='public' AND c.relkind='r' "+
      "AND c.relname IN ('bridge_v2_secure_messages','bridge_v2_secure_live','bridge_v2_secure_unread') ORDER BY c.relname",
    "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND "+
      "tablename IN ('bridge_v2_secure_messages','bridge_v2_secure_live','bridge_v2_secure_unread') ORDER BY indexname"
  ];
  const bytes=query.map(q=>sqlSnapshot(id,db,q)).join("\n--fixture-query-boundary--\n");
  return createHash("sha256").update(bytes).digest("hex");
}
test("B1a S08-14: PG16 full custom-format dump/restore validates 0008 and historic fixture hashes",{
  skip:!url
},async t=>{
  assertDisposableConnection(url,ACK);
  const applied=await applyDisposable0008({databaseUrl:url,acknowledgment:ACK});
  assert.equal(applied.status,"already_applied");
  const pool=new pg.Pool({connectionString:url,max:3});
  const id=serviceId();
  const restoreDB="bridge_b1a_restore_"+randomUUID().slice(0,8);
  let created=false;
  try{
    await t.test("S08-14 new disposable fixture hashes before dump",async()=>{
      const fixture=await seedHistorical(pool);
      const linked=await seedSecureDirect(pool);
      await insertLive(pool,linked.messageId);
      await insertUnread(pool,linked);
      assert.equal(sqlSnapshot(id,"bridge_test",
        "SELECT count(*) FROM bridge_schema_migrations"),"5");
      assert.equal(sqlSnapshot(id,"bridge_test",
        "SELECT count(*) FROM pg_tables WHERE schemaname='public' "+
        "AND tablename LIKE 'bridge_%'"),"37");
      const before=digestOf(id,"bridge_test",fixture,linked);
      assert.match(before,/^[a-f0-9]{64}$/);
      const dump=command("docker",["exec",id,"pg_dump","-U","bridge_test",
        "-d","bridge_test","-Fc"]);
      assert.equal(dump.subarray(0,5).toString(),"PGDMP");
      command("docker",["exec",id,"createdb","-U","bridge_test",restoreDB]);
      created=true;
      command("docker",["exec","-i",id,"pg_restore","-U","bridge_test",
        "-d",restoreDB,"--no-owner","--no-acl"],{input:dump});
      assert.equal(sqlSnapshot(id,restoreDB,"SELECT count(*) FROM bridge_schema_migrations"),"5");
      assert.equal(sqlSnapshot(id,restoreDB,
        "SELECT count(*) FROM pg_tables WHERE schemaname='public' "+
        "AND tablename LIKE 'bridge_%'"),"37");
      assert.equal(sqlSnapshot(id,restoreDB,
        "SELECT is_nullable FROM information_schema.columns "+
        "WHERE table_name='bridge_messages' AND column_name='body'"),"NO");
      const after=digestOf(id,restoreDB,fixture,linked);
      assert.equal(after,before,
        "All old four-message/room/slot rows and new ciphertext-structure fixture must match");
    });
  }finally{
    if(created)command("docker",["exec",id,"dropdb","-U","bridge_test",
      "--if-exists",restoreDB]);
    await pool.end();
  }
});
