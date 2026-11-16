import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {randomUUID,randomBytes} from "node:crypto";
import {assertDisposableConnection} from "../migrations/runner.mjs";
import {applyDisposable0008} from "./migration_0008_runner.mjs";
import {seedHistorical,checkHistorical,seedSecureDirect,bytes,insertLive,
  insertUnread,failsSql,count} from "./fixtures.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL;
const ACK=process.env.BRIDGE_TEST_MIGRATION_ACK;
const NEW=["bridge_v2_secure_messages","bridge_v2_secure_live","bridge_v2_secure_unread"];
const uuid=randomUUID;
const total=pool=>count(pool,
  "SELECT count(*)::int n FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'bridge_%'");
const ledger=pool=>count(pool,"SELECT count(*)::int n FROM bridge_schema_migrations");
const reg=async(pool,name)=>(await pool.query("SELECT to_regclass($1) AS item",
  ["public."+name])).rows[0].item;

test("V2-06B/B1a S08-01..16: new 0008 disposable PG16 schema acceptance",{
  skip:!url
},async t=>{
  assertDisposableConnection(url,ACK);
  const pool=new pg.Pool({connectionString:url,max:6});
  try{
    let legacy;
    await t.test("S08-02 existing 34 tables and four-ledger baseline unchanged",async()=>{
      assert.equal(await total(pool),34);
      assert.equal(await ledger(pool),4);
      for(const name of NEW)assert.equal(await reg(pool,name),null);
      const col=await pool.query(
        "SELECT is_nullable FROM information_schema.columns "+
        "WHERE table_name='bridge_messages' AND column_name='body'");
      assert.equal(col.rows[0].is_nullable,"NO");
    });
    await t.test("S08-06 seed independent four-message/room/two-slot fixture and hash",async()=>{
      legacy=await seedHistorical(pool);
      assert.equal(legacy.before.length,64);
      assert.equal(await checkHistorical(pool,legacy),legacy.before);
      assert.equal(await count(pool,
        "SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",
        [legacy.room]),4);
      assert.equal(await count(pool,
        "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",
        [legacy.matchId]),2);
    });
    await t.test("S08-04 failed 0008 receipt injection rolls ALL DDL back",async()=>{
      await assert.rejects(applyDisposable0008({
        databaseUrl:url,acknowledgment:ACK,failBeforeReceipt:true
      }),/Injected B1a disposable failure/);
      assert.equal(await total(pool),34);
      assert.equal(await ledger(pool),4);
      for(const name of NEW)assert.equal(await reg(pool,name),null);
      assert.equal(await checkHistorical(pool,legacy),legacy.before);
    });
    await t.test("S08-01/02 first guarded 0008 apply: exactly three tables",async()=>{
      const result=await applyDisposable0008({databaseUrl:url,acknowledgment:ACK});
      assert.equal(result.version,"0008");
      assert.equal(result.status,"applied");
      assert.match(result.checksum,/^[a-f0-9]{64}$/);
      assert.equal(await total(pool),37);
      assert.equal(await ledger(pool),5);
      for(const name of NEW)assert.ok(await reg(pool,name),name);
      assert.equal(await checkHistorical(pool,legacy),legacy.before);
    });
    await t.test("S08-03 repeated 0008 is checksum-verified no-op",async()=>{
      const result=await applyDisposable0008({databaseUrl:url,acknowledgment:ACK});
      assert.equal(result.status,"already_applied");
      assert.equal(await total(pool),37);
      assert.equal(await ledger(pool),5);
      await assert.rejects(pool.query(
        "UPDATE bridge_schema_migrations SET checksum=$1 WHERE version='0008'",
        ["0".repeat(64)]).then(()=>applyDisposable0008({
          databaseUrl:url,acknowledgment:ACK
        })),/B1a 0008 checksum mismatch/);
      // Restore the TEST ledger to the canonical checksum so later tests/restore remain valid.
      await pool.query("UPDATE bridge_schema_migrations SET checksum=$1 WHERE version='0008'",
        [result.checksum]);
      assert.equal((await applyDisposable0008({
        databaseUrl:url,acknowledgment:ACK})).status,"already_applied");
    });
    await t.test("S08-05 old bridge_messages.body stays NOT NULL and QA hashes unchanged",async()=>{
      const col=await pool.query(
        "SELECT is_nullable FROM information_schema.columns "+
        "WHERE table_name='bridge_messages' AND column_name='body'");
      assert.equal(col.rows[0].is_nullable,"NO");
      assert.equal(await checkHistorical(pool,legacy),legacy.before);
    });

    let fixture,record;
    await t.test("S08-07 participant FK, unique idempotency ID and room sequences",async()=>{
      fixture=await seedSecureDirect(pool);
      record=fixture.message;
      assert.equal(record.policy_version,"bridge-v2");
      const outsider=uuid();
      await failsSql(pool,
        "INSERT INTO bridge_v2_secure_messages"+
        "(conversation_id,sender_id,client_message_id,sequence_number,"+
        "policy_version,accepted_at) VALUES($1,$2,$3,3,'bridge-v2',now())",
        [fixture.conversationId,outsider,uuid()], "23503");
      await failsSql(pool,
        "INSERT INTO bridge_v2_secure_messages"+
        "(conversation_id,sender_id,client_message_id,sequence_number,"+
        "policy_version,accepted_at) VALUES($1,$2,$3,1,'bridge-v2',now())",
        [fixture.conversationId,fixture.senderId,uuid()], "23505");
      await failsSql(pool,
        "INSERT INTO bridge_v2_secure_messages"+
        "(conversation_id,sender_id,client_message_id,sequence_number,"+
        "policy_version,accepted_at) VALUES($1,$2,$3,2,'bridge-v2',now())",
        [fixture.conversationId,fixture.senderId,fixture.clientMessageId], "23505");
      await failsSql(pool,
        "INSERT INTO bridge_v2_secure_messages"+
        "(conversation_id,sender_id,client_message_id,sequence_number,"+
        "policy_version,accepted_at) VALUES($1,$2,$3,2,'legacy',now())",
        [fixture.conversationId,fixture.senderId,uuid()], "23514");
      assert.equal(await count(pool,
        "SELECT count(*)::int n FROM bridge_v2_secure_messages WHERE conversation_id=$1",
        [fixture.conversationId]),1);
    });

    await t.test("S08-08 independent LIVE blob FK and 12/16/32-byte shape checks",async()=>{
      await failsSql(pool,
        "INSERT INTO bridge_v2_secure_live"+
        "(message_id,ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
        "kek_id,kek_version,cipher_suite,aad_version) "+
        "VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,'aes-256-gcm-v1',1)",
        [uuid(),Buffer.from("fake"),randomBytes(12),randomBytes(16),
         randomBytes(32),randomBytes(12),randomBytes(16),"test-only"],"23503");
      const good=await insertLive(pool,fixture.messageId);
      assert.ok(good.ciphertext.length>0);
      await failsSql(pool,
        "UPDATE bridge_v2_secure_live SET data_iv=$2 WHERE message_id=$1",
        [fixture.messageId,randomBytes(11)],"23514");
      await failsSql(pool,
        "UPDATE bridge_v2_secure_live SET wrapped_dek=$2 WHERE message_id=$1",
        [fixture.messageId,randomBytes(31)],"23514");
      await failsSql(pool,
        "UPDATE bridge_v2_secure_live SET cipher_suite='unknown' WHERE message_id=$1",
        [fixture.messageId],"23514");
    });
    await t.test("S08-09 unread FK, unique recipient/message, no false pair-membership claim",async()=>{
      const first=await insertUnread(pool,fixture);
      assert.ok(first.id);
      await failsSql(pool,
        "UPDATE bridge_v2_secure_unread SET recipient_id=$2 WHERE id=$1",
        [first.id,uuid()],"23503");
      const blob=bytes();
      await failsSql(pool,
        "INSERT INTO bridge_v2_secure_unread "+
        "(message_id,connection_id,recipient_id,accepted_at,expires_at,"+
        "ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,kek_id,kek_version,"+
        "cipher_suite,aad_version) "+
        "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,'aes-256-gcm-v1',1)",
        [fixture.messageId,fixture.connectionId,fixture.recipientId,
         fixture.acceptedAt,new Date(fixture.acceptedAt.getTime()+86400000),
         blob.ciphertext,blob.dataIv,blob.dataTag,blob.wrappedDek,
         blob.wrapIv,blob.wrapTag,blob.kekId],"23505");
      assert.equal(await count(pool,
        "SELECT count(*)::int n FROM bridge_v2_secure_unread WHERE message_id=$1",
        [fixture.messageId]),1);
      // Exact pair-member authorization is deliberately deferred to B2.
    });
    await t.test("S08-10 accepted+7d cap, ack timestamp, token and state checks",async()=>{
      const item=(await pool.query(
        "SELECT id FROM bridge_v2_secure_unread WHERE message_id=$1",
        [fixture.messageId])).rows[0].id;
      await failsSql(pool,
        "UPDATE bridge_v2_secure_unread SET expires_at=$2 WHERE id=$1",
        [item,new Date(fixture.acceptedAt.getTime()+7*86400000+1)],"23514");
      await failsSql(pool,
        "UPDATE bridge_v2_secure_unread SET first_acknowledged_at=$2 WHERE id=$1",
        [item,new Date(fixture.acceptedAt.getTime()-1000)],"23514");
      await failsSql(pool,
        "UPDATE bridge_v2_secure_unread SET state='acknowledged' WHERE id=$1",
        [item],"23514");
      await failsSql(pool,
        "UPDATE bridge_v2_secure_unread SET state='invalid' WHERE id=$1",
        [item],"23514");
      await failsSql(pool,
        "UPDATE bridge_v2_secure_unread SET recovery_token_digest=$2 WHERE id=$1",
        [item,randomBytes(31)],"23514");
      const q=(await pool.query(
        "SELECT expires_at,accepted_at FROM bridge_v2_secure_unread WHERE id=$1",
        [item])).rows[0];
      assert.equal(q.expires_at.getTime()-q.accepted_at.getTime(),7*86400000);
    });
    await t.test("S08-11 structurally invalid ciphertext/IV/tag/KEK/version rejected",async()=>{
      const row=(await pool.query(
        "SELECT id FROM bridge_v2_secure_unread WHERE message_id=$1",
        [fixture.messageId])).rows[0].id;
      for(const [col,val] of [
        ["ciphertext",Buffer.alloc(0)],["data_iv",randomBytes(13)],
        ["data_tag",randomBytes(15)],["wrapped_dek",randomBytes(33)],
        ["wrap_iv",randomBytes(11)],["wrap_tag",randomBytes(15)],
        ["kek_id","  "],["kek_version",0],
        ["aad_version",2],["cipher_suite","plaintext"]
      ])await failsSql(pool,
        "UPDATE bridge_v2_secure_unread SET "+col+"=$2 WHERE id=$1",
        [row,val],"23514");
    });
    await t.test("S08-12 all three tables RLS ON, no grants/policies, non-owner denies",async()=>{
      const rows=(await pool.query(
        "SELECT c.relname,c.relrowsecurity,c.relacl,"+
        "(SELECT count(*)::int FROM pg_policies p WHERE p.schemaname='public' "+
        "AND p.tablename=c.relname) AS policies FROM pg_class c "+
        "JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' "+
        "AND c.relkind='r' AND c.relname=ANY($1::text[]) ORDER BY c.relname",
        [NEW])).rows;
      assert.equal(rows.length,3);
      for(const row of rows) {
        assert.equal(row.relrowsecurity,true);
        assert.equal(row.relacl,null);
        assert.equal(Number(row.policies),0);
      }
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        await client.query("CREATE ROLE bridge_b1a_test_nonowner NOLOGIN");
        await client.query("GRANT USAGE ON SCHEMA public TO bridge_b1a_test_nonowner");
        for(const tbl of NEW)await client.query(
          "GRANT SELECT ON "+tbl+" TO bridge_b1a_test_nonowner");
        await client.query("SET LOCAL ROLE bridge_b1a_test_nonowner");
        for(const tbl of NEW)assert.equal((await client.query(
          "SELECT count(*)::int AS n FROM "+tbl)).rows[0].n,0,tbl);
        await client.query("RESET ROLE");
      }finally{
        await client.query("ROLLBACK");
        client.release();
      }
      const role=(await pool.query(
        "SELECT oid FROM pg_roles WHERE rolname='bridge_b1a_test_nonowner'")).rows;
      assert.equal(role.length,0);
    });
    await t.test("S08-13 expected scoped sequence, inbox and expiry indexes exist",async()=>{
      const indexes=(await pool.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' "+
        "AND tablename=ANY($1::text[])",[NEW])).rows.map(x=>x.indexname);
      for(const name of [
        "bridge_v2_secure_messages_live_idx",
        "bridge_v2_secure_live_retention_idx",
        "bridge_v2_secure_unread_recipient_idx"
      ])assert.ok(indexes.includes(name),name);
    });
    await t.test("S08-15 no cloud DB connection or unacknowledged 0008 migrations",async()=>{
      for(const [u,a] of [
        ["postgresql://bridge_test:p@neon.tech:5432/bridge_test",ACK],
        ["postgresql://bridge_test:p@127.0.0.1:5432/neondb",ACK],
        [url,"wrong"],
        ["postgresql://bridge_test:p@localhost:5432/bridge_test?sslmode=require",ACK]
      ])await assert.rejects(applyDisposable0008({databaseUrl:u,acknowledgment:a}),/Refusing/);
      assert.equal(await ledger(pool),5);
    });
    await t.test("S08-06/16 historical QA fixture still exact after all constraints",async()=>{
      assert.equal(await checkHistorical(pool,legacy),legacy.before);
      assert.equal(await count(pool,
        "SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",
        [legacy.room]),4);
    });
  }finally{await pool.end();}
});
