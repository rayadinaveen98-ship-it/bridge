import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import pg from "pg";
import {createPrivateWriteRepository}
  from "../../../src/messaging/private_repository.mjs";
import {
  checkDisposable,b2SchemaReady,testWriter,repos,randomRoom,connected,
  legacyFixture,legacySnapshot,setRoomDeadline,accounts,qty,uuid,hold,
  tally,perRoomState,sample
} from "./b2_fixtures.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL;
const denied=e=>e?.code==="resource_unavailable"||e?.code==="private_crypto_unavailable";
const input=(f,actorId,clientMessageId=uuid())=>({
  conversationId:f.conversationId??f.room,actorId,clientMessageId,
  syntheticPlaintext:sample
});
test("B2a synthetic-only PG16 races, expiry and import fences",{
  skip:!url
},async t=>{
  checkDisposable();
  const pool=new pg.Pool({connectionString:url,max:9});
  try{
    await b2SchemaReady(pool);
    const {keep,direct}=repos(pool);
    await t.test("A02-08 concurrent two unique sends allocate distinct ordered sequences",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        const result=await Promise.all(f.people.map(actor=>
          writer.repository.acceptSynthetic(input(f,actor))));
        assert.deepEqual(result.map(q=>q.sequenceNumber).sort((a,b)=>a-b),[1,2]);
        assert.notEqual(result[0].id,result[1].id);
        assert.deepEqual(await tally(pool,f.conversationId),
          {messages:2,live:2,unread:2,outbox:2,legacy:0});
        const state=await perRoomState(pool,f.conversationId);
        assert.equal(Number(state.next_message_sequence),3);
      }finally{writer.destroy();}
    });
    await t.test("A02-08 same client ID parallel retry writes once, clock once",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool),payload=input(f,f.people[0]);
      try{
        const [one,two]=await Promise.all([
          writer.repository.acceptSynthetic(payload),
          writer.repository.acceptSynthetic(payload)]);
        assert.equal(one.id,two.id);
        assert.equal(one.sequenceNumber,1);
        assert.equal(two.sequenceNumber,1);
        assert.notEqual(one.duplicate,two.duplicate);
        assert.deepEqual(await tally(pool,f.conversationId),
          {messages:1,live:1,unread:1,outbox:1,legacy:0});
        assert.equal(Number((await perRoomState(pool,f.conversationId)).next_message_sequence),2);
      }finally{writer.destroy();}
    });
    await t.test("A02-12 advisory-lock wait crosses exact expiry: post-wait clock denies",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool),locker=await pool.connect();
      try{
        await locker.query("BEGIN");
        await locker.query("SELECT pg_advisory_xact_lock($1)",[714411]);
        const pending=writer.repository.acceptSynthetic(input(f,f.people[0]));
        await hold(70);
        await setRoomDeadline(pool,f.conversationId,-3000);
        await locker.query("COMMIT");
        await assert.rejects(pending,denied);
        assert.deepEqual(await tally(pool,f.conversationId),
          {messages:0,live:0,unread:0,outbox:0,legacy:0});
      }finally{
        try{await locker.query("ROLLBACK");}catch{}
        locker.release();
        writer.destroy();
      }
    });
    await t.test("A02-13 reciprocal block inserted while send waits wins",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool),locker=await pool.connect();
      try{
        await locker.query("BEGIN");
        await locker.query("SELECT pg_advisory_xact_lock($1)",[714411]);
        const pending=writer.repository.acceptSynthetic(input(f,f.people[0]));
        await hold(40);
        await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
          [f.people[1],f.people[0]]);
        await locker.query("COMMIT");
        await assert.rejects(pending,denied);
        assert.deepEqual(await tally(pool,f.conversationId),
          {messages:0,live:0,unread:0,outbox:0,legacy:0});
      }finally{
        try{await locker.query("ROLLBACK");}catch{}
        locker.release();
        writer.destroy();
      }
    });
    await t.test("A02-13 direct End before send denies; fresh free D2 has independent sequence",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        await direct.end({conversationId:f.conversationId,actorId:f.people[0]});
        await assert.rejects(writer.repository.acceptSynthetic(input(f,f.people[0])),denied);
        const newRoom=await direct.open({connectionId:f.connectionId,actorId:f.people[0]});
        assert.notEqual(newRoom.conversationId,f.conversationId);
        const sent=await writer.repository.acceptSynthetic(
          input({...f,conversationId:newRoom.conversationId},f.people[1]));
        assert.equal(sent.sequenceNumber,1);
        assert.equal((await tally(pool,f.conversationId)).messages,0);
        assert.equal((await tally(pool,newRoom.conversationId)).messages,1);
      }finally{writer.destroy();}
    });
    await t.test("A02-06 two current Keep votes convert random; old random send cannot resurrect",async()=>{
      const f=await randomRoom(pool),writer=testWriter(pool);
      try{
        const v1=await keep.vote({conversationId:f.room,actorId:f.people[0],
          decision:"accept"});
        assert.equal(v1.status,"pending");
        const v2=await keep.vote({conversationId:f.room,actorId:f.people[1],
          decision:"accept"});
        assert.equal(v2.status,"connected");
        await assert.rejects(writer.repository.acceptSynthetic(input(f,f.people[0])),denied);
        assert.equal((await tally(pool,f.room)).messages,0);
      }finally{writer.destroy();}
    });
    await t.test("A02-21 missing injected KEK fails transaction with no seq/outbox advance",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        writer.keyProvider.destroy();
        const before=await perRoomState(pool,f.conversationId);
        await assert.rejects(writer.repository.acceptSynthetic(input(f,f.people[0])),denied);
        assert.equal((await tally(pool,f.conversationId)).messages,0);
        assert.deepEqual(await perRoomState(pool,f.conversationId),before);
      }finally{writer.destroy();}
    });
    await t.test("A02-21 wrap nonce refusal aborts transaction; no content accepted",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        writer.wrapNonceRegistry.destroy();
        await assert.rejects(writer.repository.acceptSynthetic(input(f,f.people[0])),denied);
        assert.deepEqual(await tally(pool,f.conversationId),
          {messages:0,live:0,unread:0,outbox:0,legacy:0});
      }finally{writer.destroy();}
    });
    await t.test("A02-01 cloud/altered-ack rejected at constructor before PG connection",async()=>{
      const writer=testWriter(pool);
      try{
        const fake={
          options:{connectionString:"postgresql://bridge_test:test@neon.tech:5432/bridge_test"},
          connect:()=>{throw Error("SHOULD NOT CONNECT");}
        };
        assert.throws(()=>createPrivateWriteRepository(fake,{
          keyProvider:writer.keyProvider,wrapNonceRegistry:writer.wrapNonceRegistry,
          keyRefs:writer.keyRefs
        }),denied);
        const original=process.env.BRIDGE_TEST_MIGRATION_ACK;
        try {
          process.env.BRIDGE_TEST_MIGRATION_ACK="not-approved";
          await assert.rejects(writer.repository.acceptSynthetic({
            conversationId:uuid(),actorId:uuid(),clientMessageId:uuid(),
            syntheticPlaintext:sample
          }),denied);
        }finally{process.env.BRIDGE_TEST_MIGRATION_ACK=original;}
      }finally{writer.destroy();}
    });
    await t.test("A02-02 and A02-19 legacy fixture hash unchanged after encrypted tests",async()=>{
      const f=await legacyFixture(pool),writer=testWriter(pool);
      try{
        assert.equal(await legacySnapshot(pool,f),f.before);
        await assert.rejects(writer.repository.acceptSynthetic(input(f,f.people[0])),denied);
        assert.equal(await legacySnapshot(pool,f),f.before);
        assert.equal(await qty(pool,
          "SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",
          [f.room]),4);
      }finally{writer.destroy();}
    });
    await t.test("A02-22 no hosted API/bootstrap/outbox import of disconnected adapter",async()=>{
      const root=new URL("../../../src/",import.meta.url);
      for(const file of ["http.mjs","postgres.mjs","start.mjs","outbox.mjs"]){
        const source=await readFile(new URL(file,root),"utf8");
        assert.doesNotMatch(source,/private_repository\.mjs|private_crypto\.mjs/);
      }
      const source=await readFile(new URL("messaging/private_repository.mjs",root),"utf8");
      assert.doesNotMatch(source,/BRIDGE_DATABASE_URL|CREATE TABLE|ALTER TABLE|TRUNCATE|DELETE FROM bridge_messages/);
    });
  }finally{await pool.end();}
});
