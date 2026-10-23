import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresService } from "../src/postgres.mjs";
import { createOutboxDispatcher } from "../src/outbox.mjs";
import { ApiError } from "../src/auth.mjs";

/** Only runs in an explicitly isolated database. Migration must be applied first. */
test("real PostgreSQL: matchmaking, durable messaging, votes and block", {
  skip: !process.env.BRIDGE_TEST_DATABASE_URL
}, async () => {
  const dbUrl = new URL(process.env.BRIDGE_TEST_DATABASE_URL);
  if (dbUrl.pathname !== "/bridge_test" ||
      !["127.0.0.1", "localhost", "::1"].includes(dbUrl.hostname)) {
    throw new Error("Refusing to run destructive integration test outside loopback bridge_test database");
  }
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.BRIDGE_TEST_DATABASE_URL, max: 6 });
  const a = { id: randomUUID(), subject: "test|a|" + randomUUID() };
  const b = { id: randomUUID(), subject: "test|b|" + randomUUID() };
  const c = { id: randomUUID(), subject: "test|c|" + randomUUID() };
  const ids = [a,b,c];
  try {
    await pool.query(
      "INSERT INTO bridge_supported_languages(code,display_name,moderation_ready) " +
      "VALUES('en','English',true) ON CONFLICT(code) DO UPDATE SET moderation_ready=true");
    await pool.query(
      "INSERT INTO bridge_supported_languages(code,display_name,moderation_ready) " +
      "VALUES('zz','Unmoderated',false) ON CONFLICT(code) DO UPDATE SET moderation_ready=false");
    for(const x of ids) {
      await pool.query(
        "INSERT INTO bridge_accounts(id,auth_subject,status,age_verified_at,safety_eligible) " +
        "VALUES($1,$2,'active',now(),true)",[x.id,x.subject]);
      await pool.query(
        "INSERT INTO bridge_profiles(account_id,pseudonym,avatar_key) VALUES($1,$2,'moon')",
        [x.id,"User" + x.id.slice(0,8)]);
    }
    const service=createPostgresService(pool);
    for(const x of ids) await service.setPreferences(x.subject,{
      languageCodes:["en"],intention:"just_chat",interests:["cinema"],topic:null
    });
    await assert.rejects(service.setPreferences(c.subject,{
      languageCodes:["zz"],intention:"just_chat",interests:[],topic:null
    }),e=>e instanceof ApiError&&e.status===422);

    const searchA=randomUUID(),searchB=randomUUID();
    const qa=await service.enqueue(a.subject,{topic:"cinema",idempotencyKey:searchA});
    assert.equal(qa.state,"waiting");
    const qb=await service.enqueue(b.subject,{topic:"cinema",idempotencyKey:searchB});
    assert.equal(qb.state,"connected");
    const qaNow=await service.queueStatus(a.subject,searchA);
    assert.equal(qaNow.state,"connected");
    const conversationId=qb.conversationId;
    assert.equal(conversationId,qaNow.conversationId);
    assert.ok(conversationId);

    await assert.rejects(service.enqueue(a.subject,{topic:null,idempotencyKey:randomUUID()}),
      e=>e instanceof ApiError&&e.status===409);
    await assert.rejects(service.messages(c.subject,conversationId,0),
      e=>e instanceof ApiError&&e.status===404);

    const keyA=randomUUID();
    const first=await service.sendMessage(a.subject,conversationId,{
      clientMessageId:keyA,body:"Hello there"
    });
    assert.equal(first.sequenceNumber,1);
    const outboxOne=await pool.query(
      "SELECT event_key,payload,published_at FROM bridge_event_outbox WHERE event_key=$1",
      ["message:"+first.id]);
    assert.equal(outboxOne.rows.length,1);
    assert.equal(outboxOne.rows[0].payload.messageId,first.id);
    assert.equal(outboxOne.rows[0].payload.sequenceNumber,1);
    assert.equal(outboxOne.rows[0].payload.body,undefined);
    const again=await service.sendMessage(a.subject,conversationId,{
      clientMessageId:keyA,body:"Hello there"
    });
    assert.equal(again.id,first.id);
    const replayCount=await pool.query(
      "SELECT count(*)::int AS total FROM bridge_event_outbox WHERE event_key=$1",
      ["message:"+first.id]);
    assert.equal(replayCount.rows[0].total,1);
    await assert.rejects(service.sendMessage(a.subject,conversationId,{
      clientMessageId:keyA,body:"tampered retry"
    }),e=>e instanceof ApiError&&e.status===409);
    const concurrent=await Promise.all([
      service.sendMessage(a.subject,conversationId,{clientMessageId:randomUUID(),body:"A2"}),
      service.sendMessage(b.subject,conversationId,{clientMessageId:randomUUID(),body:"B2"})
    ]);
    assert.deepEqual(concurrent.map(x=>x.sequenceNumber).sort((x,y)=>x-y),[2,3]);
    const messages=await service.messages(a.subject,conversationId,0);
    assert.deepEqual(messages.map(x=>x.sequenceNumber),[1,2,3]);

    // The first outbox publish fails: event remains available after retry delay.
    const observed = [];
    const failing=createOutboxDispatcher(pool,async payload => {
      observed.push(payload.id);
      throw new Error("simulated transport unavailable");
    });
    const failedAttempt=await failing.drainOnce(10);
    assert.equal(failedAttempt.failed,3);
    const notYet=await pool.query(
      "SELECT count(*)::int AS total FROM bridge_event_outbox WHERE published_at IS NOT NULL");
    assert.equal(notYet.rows[0].total,0);
    // A test-only clock adjustment simulates the retry delay without slowing CI.
    await pool.query("UPDATE bridge_event_outbox SET available_at=now()-interval '1 second'");
    const delivered=[];
    const success=createOutboxDispatcher(pool,async payload => {
      delivered.push(payload);
    });
    const succeeded=await success.drainOnce(10);
    assert.equal(succeeded.published,3);
    assert.equal(succeeded.failed,0);
    assert.equal(new Set(delivered.map(x=>x.payload.messageId)).size,3);
    assert.ok(delivered.every(x=>!Object.hasOwn(x.payload,"body")));
    const finished=await pool.query(
      "SELECT count(*)::int AS total FROM bridge_event_outbox WHERE published_at IS NOT NULL");
    assert.equal(finished.rows[0].total,3);
    assert.deepEqual(await success.drainOnce(10),{claimed:0,published:0,failed:0});

    await service.closeConversation(a.subject,conversationId);
    assert.equal((await service.castVote(a.subject,conversationId,"accept")).status,"pending");
    const connected=await service.castVote(b.subject,conversationId,"accept");
    assert.equal(connected.status,"connected");
    assert.ok(connected.connectionId);
    const dm=await service.sendMessage(a.subject,conversationId,{
      clientMessageId:randomUUID(),body:"Reconnected"
    });
    assert.equal(dm.sequenceNumber,4);

    await service.block(a.subject,b.id);
    await assert.rejects(service.sendMessage(b.subject,conversationId,{
      clientMessageId:randomUUID(),body:"should be blocked"
    }),e=>e instanceof ApiError&&e.status===403);
    assert.equal((await service.connections(a.subject)).length,0);
    const report=await service.report(a.subject,{
      reportedAccountId:b.id,conversationId,category:"spam",details:"Synthetic integration test"
    });
    assert.equal(report.state,"queued");
  } finally {
    // CI uses a disposable test DB; tests insert only synthetic subjects and data.
    // Intentionally avoid cascade-deleting reports or evidence in a shared DB.
    await pool.end();
  }
});

test("real PostgreSQL: public-style database role cannot directly read protected tables", {
  skip: !process.env.BRIDGE_TEST_DATABASE_URL
}, async () => {
  const dbUrl = new URL(process.env.BRIDGE_TEST_DATABASE_URL);
  if (dbUrl.pathname !== "/bridge_test" ||
      !["127.0.0.1","localhost","::1"].includes(dbUrl.hostname)) {
    throw new Error("Refusing to run security check outside isolated local bridge_test");
  }
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.BRIDGE_TEST_DATABASE_URL, max: 2 });
  const c=await pool.connect();
  try {
    // Test simulates a non-owner DB role. RLS should suppress rows even with SELECT.
    await c.query("CREATE ROLE bridge_guest_test NOLOGIN");
    await c.query("GRANT USAGE ON SCHEMA public TO bridge_guest_test");
    await c.query("GRANT SELECT ON bridge_messages,bridge_accounts,bridge_event_outbox TO bridge_guest_test");
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE bridge_guest_test");
    for (const table of ["bridge_messages","bridge_accounts","bridge_event_outbox"]) {
      const rows=await c.query("SELECT * FROM " + table + " LIMIT 10");
      assert.equal(rows.rows.length,0,table+" unexpectedly visible");
    }
    await c.query("ROLLBACK");
  } finally {
    await c.query("RESET ROLE").catch(()=>{});
    c.release();
    await pool.end();
  }
});
