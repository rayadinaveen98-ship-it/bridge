import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {createMessagingRepository} from "../../../src/messaging/repository.mjs";
import {MessagingDenied} from "../../../src/messaging/scope.mjs";
import {createKeepRepository} from "../../../src/connections/keep_repository.mjs";
import {createDirectSessionRepository} from "../../../src/sessions/direct_repository.mjs";
import {checkDisposable,connected,randomRoom,legacyFixture,legacySnapshot,
  setRoomDeadline,accounts,qty,single,uuid} from "../connections/fixtures.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL;
const fixture=()=>Buffer.from("V206-only-synthetic-opaque-fixture-"+uuid());
const denied=e=>e instanceof MessagingDenied||e?.code==="resource_unavailable";
test("V2-06A M06 disconnected synthetic PG16 metadata/unread proofs",{
  skip:!url
},async t=>{
  checkDisposable();
  const pool=new pg.Pool({connectionString:url,max:8});
  const repo=createMessagingRepository(pool,{recoveryKey:Buffer.alloc(32,36)});
  const keep=createKeepRepository(pool),direct=createDirectSessionRepository(pool);
  try{
    await t.test("M06-07..09 unique D1 accept, retry and conflict, no duplicate outbox",async()=>{
      const f=await connected(pool,keep),clientMessageId=uuid(),opaque=fixture();
      const input={conversationId:f.conversationId,actorId:f.people[0],
        clientMessageId,opaqueFixture:opaque};
      const first=await repo.acceptSynthetic(input);
      const replay=await repo.acceptSynthetic(input);
      assert.equal(first.sequenceNumber,1);
      assert.equal(first.duplicate,false);
      assert.deepEqual(replay,{...first,duplicate:true});
      await assert.rejects(repo.acceptSynthetic({...input,opaqueFixture:fixture()}),denied);
      assert.equal(await qty(pool,"SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",
        [f.conversationId]),1);
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_event_outbox WHERE event_key=$1",
        ["message:"+first.id]),1);
      const room=await single(pool,
        "SELECT next_message_sequence,last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",
        [f.conversationId]);
      assert.equal(Number(room.next_message_sequence),2);
      assert.equal(room.idle_expires_at.getTime()-room.last_accepted_at.getTime(),1800000);
      const stored=await single(pool,"SELECT body FROM bridge_messages WHERE id=$1",[first.id]);
      assert.equal(stored.body,"[Bridge V2-06A synthetic fixture - no user body]");
      const payload=await single(pool,
        "SELECT ciphertext,key_reference FROM bridge_message_payloads WHERE message_id=$1",[first.id]);
      assert.ok(payload.ciphertext.equals(opaque));
      assert.equal(payload.key_reference,"disposable-v206-synthetic-not-encrypted");
    });
    await t.test("M06-10..12 concurrent two-device sends get distinct ordered sequences",async()=>{
      const f=await connected(pool,keep);
      const [left,right]=await Promise.all(f.people.map(actorId=>
        repo.acceptSynthetic({conversationId:f.conversationId,
          actorId,clientMessageId:uuid(),opaqueFixture:fixture()})));
      assert.deepEqual([left.sequenceNumber,right.sequenceNumber].sort((a,b)=>a-b),[1,2]);
      const next=await single(pool,"SELECT next_message_sequence FROM bridge_conversations WHERE id=$1",
        [f.conversationId]);
      assert.equal(Number(next.next_message_sequence),3);
    });
    await t.test("M06-13..15 current-only cursor, never body, session isolation after End",async()=>{
      const f=await connected(pool,keep);
      await repo.acceptSynthetic({conversationId:f.conversationId,
        actorId:f.people[0],clientMessageId:uuid(),opaqueFixture:fixture()});
      const first=await repo.liveMetadata({conversationId:f.conversationId,actorId:f.people[1]});
      assert.equal(first.messages.length,1);
      assert.equal(first.messages[0].sequenceNumber,1);
      assert.equal(JSON.stringify(first).includes("opaque-fixture"),false);
      assert.equal(JSON.stringify(first).includes("body"),false);
      const replay=await repo.liveMetadata({
        conversationId:f.conversationId,actorId:f.people[1],cursor:first.cursor});
      assert.equal(replay.messages.length,0);
      await assert.rejects(repo.liveMetadata({
        conversationId:f.conversationId,actorId:f.people[0],cursor:first.cursor}),denied);
      await direct.end({conversationId:f.conversationId,actorId:f.people[0]});
      await assert.rejects(repo.liveMetadata({
        conversationId:f.conversationId,actorId:f.people[1]}),denied);
      const next=await direct.open({connectionId:f.connectionId,actorId:f.people[1]});
      const empty=await repo.liveMetadata({conversationId:next.conversationId,actorId:f.people[0]});
      assert.deepEqual(empty.messages,[]);
    });
    await t.test("M06-16..24 recipient-only inbox, ack/retry/recover, ended D1 still unread",async()=>{
      const f=await connected(pool,keep);
      await repo.acceptSynthetic({conversationId:f.conversationId,
        actorId:f.people[0],clientMessageId:uuid(),opaqueFixture:fixture()});
      const inbox=await repo.unreadMetadata({actorId:f.people[1]});
      assert.ok(inbox.length>=1);
      const mine=inbox[inbox.length-1];
      assert.equal(mine.state,"unread");
      assert.ok(!Object.hasOwn(mine,"encrypted_copy"));
      assert.ok(!Object.hasOwn(mine,"conversationId"));
      const senderInbox=await repo.unreadMetadata({actorId:f.people[0]});
      assert.equal(senderInbox.some(x=>x.id===mine.id),false);
      await direct.end({conversationId:f.conversationId,actorId:f.people[0]});
      assert.equal((await repo.unreadMetadata({actorId:f.people[1]}))
        .some(x=>x.id===mine.id),true);
      const ack=await repo.acknowledge({envelopeId:mine.id,actorId:f.people[1]});
      assert.equal(ack.status,"acknowledged");
      assert.equal(ack.recoveryToken.length,43);
      const repeat=await repo.acknowledge({envelopeId:mine.id,actorId:f.people[1]});
      assert.equal(repeat.status,"already_acknowledged");
      assert.equal(repeat.recoveryToken,ack.recoveryToken);
      assert.equal((await repo.recoverMetadata({
        envelopeId:mine.id,actorId:f.people[1],recoveryToken:ack.recoveryToken
      })).id,mine.id);
      await assert.rejects(repo.recoverMetadata({
        envelopeId:mine.id,actorId:f.people[0],recoveryToken:ack.recoveryToken
      }),denied);
      await assert.rejects(repo.recoverMetadata({
        envelopeId:mine.id,actorId:f.people[1],recoveryToken:"forged"
      }),denied);
    });
    await t.test("M06-19 recipient expired envelope denied without purge worker",async()=>{
      const f=await connected(pool,keep);
      await repo.acceptSynthetic({conversationId:f.conversationId,
        actorId:f.people[0],clientMessageId:uuid(),opaqueFixture:fixture()});
      const id=(await repo.unreadMetadata({actorId:f.people[1]})).at(-1).id;
      await pool.query("UPDATE bridge_unread_deliveries SET "+
        "accepted_at=now()-interval '8 days',"+
        "expires_at=now()-interval '1 day' WHERE id=$1",[id]);
      assert.equal((await repo.unreadMetadata({actorId:f.people[1]}))
        .some(x=>x.id===id),false);
      await assert.rejects(repo.acknowledge({envelopeId:id,actorId:f.people[1]}),denied);
    });
    await t.test("M06-04..06 expired direct / unsafe pair / outsider fail closed",async()=>{
      const f=await connected(pool,keep);
      const outsider=(await accounts(pool,1))[0];
      await assert.rejects(repo.liveMetadata({
        conversationId:f.conversationId,actorId:outsider}),denied);
      await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
        [f.people[0],f.people[1]]);
      await assert.rejects(repo.acceptSynthetic({
        conversationId:f.conversationId,actorId:f.people[0],
        clientMessageId:uuid(),opaqueFixture:fixture()
      }),denied);
      await pool.query("DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",
        [f.people[0],f.people[1]]);
      await setRoomDeadline(pool,f.conversationId,-1500);
      await assert.rejects(repo.acceptSynthetic({
        conversationId:f.conversationId,actorId:f.people[0],
        clientMessageId:uuid(),opaqueFixture:fixture()
      }),denied);
    });
    await t.test("M06-16 random messages never create direct unread envelopes",async()=>{
      const f=await randomRoom(pool);
      const result=await repo.acceptSynthetic({conversationId:f.room,
        actorId:f.people[0],clientMessageId:uuid(),opaqueFixture:fixture()});
      assert.equal(result.sequenceNumber,1);
      assert.equal(await qty(pool,"SELECT count(*)::int n FROM bridge_unread_deliveries WHERE message_id=$1",
        [result.id]),0);
    });
    await t.test("M06-28 atomic rollback of synthetic message, unread and clock",async()=>{
      const f=await connected(pool,keep),bytes=fixture();
      const before=await single(pool,
        "SELECT next_message_sequence,idle_expires_at FROM bridge_conversations WHERE id=$1",
        [f.conversationId]);
      await assert.rejects(repo.acceptSynthetic({
        conversationId:f.conversationId,actorId:f.people[0],
        clientMessageId:uuid(),opaqueFixture:bytes,
        failureHook:async stage=>{if(stage==="after_envelope")throw Error("synthetic failure");}
      }),/synthetic failure/);
      assert.equal(await qty(pool,"SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",
        [f.conversationId]),0);
      const after=await single(pool,
        "SELECT next_message_sequence,idle_expires_at FROM bridge_conversations WHERE id=$1",
        [f.conversationId]);
      assert.deepEqual(after,before);
    });
    await t.test("M06-29 historical four-message QA manifest preserved",async()=>{
      const old=await legacyFixture(pool);
      const f=await connected(pool,keep);
      await repo.acceptSynthetic({conversationId:f.conversationId,
        actorId:f.people[0],clientMessageId:uuid(),opaqueFixture:fixture()});
      assert.equal(await legacySnapshot(pool,old),old.before);
      await assert.rejects(repo.liveMetadata({
        conversationId:old.room,actorId:old.people[0]}),denied);
    });
    await t.test("M06-14 deterministic tombstone advances LIVE sequence without exposing bytes",async()=>{
      const f=await connected(pool,keep);
      const msg=await repo.acceptSynthetic({conversationId:f.conversationId,
        actorId:f.people[0],clientMessageId:uuid(),opaqueFixture:fixture()});
      const before=await repo.liveMetadata({
        conversationId:f.conversationId,actorId:f.people[1]});
      assert.equal(before.messages[0].state,"present");
      await pool.query("UPDATE bridge_message_payloads SET purged_at=now() WHERE message_id=$1",
        [msg.id]); // test-only simulated prior data removal; NO retention service is activated
      const after=await repo.liveMetadata({
        conversationId:f.conversationId,actorId:f.people[1]});
      assert.equal(after.messages[0].state,"tombstone");
      assert.equal(after.messages[0].sequenceNumber,1);
      assert.equal(JSON.stringify(after).includes("opaque-fixture"),false);
      assert.deepEqual((await repo.liveMetadata({
        conversationId:f.conversationId,actorId:f.people[1],cursor:after.cursor
      })).messages,[]);
    });
    await t.test("M06-19..24 blocked inbox/ack race is denied; restored access cannot revive ended relation",async()=>{
      const f=await connected(pool,keep);
      await repo.acceptSynthetic({conversationId:f.conversationId,
        actorId:f.people[0],clientMessageId:uuid(),opaqueFixture:fixture()});
      const id=(await repo.unreadMetadata({actorId:f.people[1]})).at(-1).id;
      await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
        [f.people[0],f.people[1]]);
      assert.equal((await repo.unreadMetadata({actorId:f.people[1]}))
        .some(x=>x.id===id),false);
      await assert.rejects(repo.acknowledge({envelopeId:id,actorId:f.people[1]}),denied);
      assert.equal((await single(pool,
        "SELECT state FROM bridge_unread_deliveries WHERE id=$1",[id])).state,"unread");
      await direct.endRelationship({connectionId:f.connectionId,actorId:f.people[0]});
      await pool.query("DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",
        [f.people[0],f.people[1]]);
      await assert.rejects(repo.acknowledge({envelopeId:id,actorId:f.people[1]}),denied);
    });
    await t.test("M06-22 concurrent repeated first ack has one durable timestamp and token",async()=>{
      const f=await connected(pool,keep);
      await repo.acceptSynthetic({conversationId:f.conversationId,
        actorId:f.people[0],clientMessageId:uuid(),opaqueFixture:fixture()});
      const id=(await repo.unreadMetadata({actorId:f.people[1]})).at(-1).id;
      const responses=await Promise.all([
        repo.acknowledge({envelopeId:id,actorId:f.people[1]}),
        repo.acknowledge({envelopeId:id,actorId:f.people[1]})
      ]);
      assert.deepEqual(responses.map(x=>x.status).sort(),
        ["acknowledged","already_acknowledged"]);
      assert.equal(responses[0].recoveryToken,responses[1].recoveryToken);
      const row=await single(pool,
        "SELECT state,acknowledged_at,recovery_token_digest FROM bridge_unread_deliveries WHERE id=$1",
        [id]);
      assert.equal(row.state,"acknowledged");
      assert.ok(row.acknowledged_at);
      assert.equal(row.recovery_token_digest.length,32);
    });
    await t.test("M06-24 recovery access expires at 15m independent of pending purge",async()=>{
      const f=await connected(pool,keep);
      await repo.acceptSynthetic({conversationId:f.conversationId,
        actorId:f.people[0],clientMessageId:uuid(),opaqueFixture:fixture()});
      const id=(await repo.unreadMetadata({actorId:f.people[1]})).at(-1).id;
      const ack=await repo.acknowledge({envelopeId:id,actorId:f.people[1]});
      await pool.query("UPDATE bridge_unread_deliveries SET "+
        "accepted_at=now()-interval '1 hour',"+
        "acknowledged_at=now()-interval '16 minutes',"+
        "expires_at=now()+interval '6 days' WHERE id=$1",[id]);
      await assert.rejects(repo.recoverMetadata({
        envelopeId:id,actorId:f.people[1],recoveryToken:ack.recoveryToken
      }),denied);
      assert.equal((await repo.acknowledge({
        envelopeId:id,actorId:f.people[1]})).recoveryToken,null);
    });
    await t.test("M06-25 envelope event contains IDs/sequence only, never fixture bytes",async()=>{
      const f=await connected(pool,keep),raw=fixture();
      const msg=await repo.acceptSynthetic({
        conversationId:f.conversationId,actorId:f.people[0],
        clientMessageId:uuid(),opaqueFixture:raw});
      const out=await single(pool,
        "SELECT payload FROM bridge_event_outbox WHERE event_key=$1",["message:"+msg.id]);
      assert.equal(out.payload.messageId,msg.id);
      assert.equal(out.payload.sequenceNumber,msg.sequenceNumber);
      assert.deepEqual(Object.keys(out.payload).sort(),["messageId","sequenceNumber"]);
      assert.equal(JSON.stringify(out.payload).includes(raw.toString()),false);
    });
    await t.test("M06-10 delayed lock past expiry refuses late acceptance",async()=>{
      const f=await connected(pool,keep);
      const c=await pool.connect();
      try{
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock($1)",[714411]);
        const pending=repo.acceptSynthetic({
          conversationId:f.conversationId,actorId:f.people[0],
          clientMessageId:uuid(),opaqueFixture:fixture()});
        await new Promise(resolve=>setTimeout(resolve,40));
        await setRoomDeadline(pool,f.conversationId,-2000);
        await c.query("COMMIT");
        await assert.rejects(pending,denied);
      }finally{
        try{await c.query("ROLLBACK");}catch{}
        c.release();
      }
    });
  } finally {await pool.end();}
});
