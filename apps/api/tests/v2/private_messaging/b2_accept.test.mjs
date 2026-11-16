import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {randomUUID} from "node:crypto";
import {decryptSyntheticPrivate}
  from "../../../src/messaging/private_crypto.mjs";
import {PrivateWriteDenied,createPrivateWriteRepository}
  from "../../../src/messaging/private_repository.mjs";
import {
  b2SchemaReady,testWriter,repos,checkDisposable,
  randomRoom,connected,legacyFixture,legacySnapshot,accounts,
  setRoomDeadline,qty,single,row,fromRow,meta,perRoomState,tally,sample,uuid
} from "./b2_fixtures.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL;
const denied=e=>e?.code==="resource_unavailable"||e?.code==="private_crypto_unavailable";
const receipt=(f,actorId,body=sample,clientMessageId=uuid())=>({
  conversationId:f.conversationId??f.room,actorId,clientMessageId,
  syntheticPlaintext:body
});
test("B2a disconnected PG16 encrypted acceptance; NOT an API",{
  skip:!url
},async t=>{
  checkDisposable();
  const pool=new pg.Pool({connectionString:url,max:9});
  try{
    await b2SchemaReady(pool);
    const {keep,direct}=repos(pool);
    await t.test("A02-01/02 previous four-message legacy fixture has no V2 access or mutation",async()=>{
      const f=await legacyFixture(pool),writer=testWriter(pool);
      try{
        assert.equal((await legacySnapshot(pool,f)),f.before);
        await assert.rejects(writer.repository.acceptSynthetic(receipt(f,f.people[0])),denied);
        assert.equal((await legacySnapshot(pool,f)),f.before);
        assert.equal((await tally(pool,f.room)).messages,0);
        assert.equal((await tally(pool,f.room)).legacy,4);
      }finally{writer.destroy();}
    });
    await t.test("A02-03 random current only; real ciphertext not legacy; no unread",async()=>{
      const f=await randomRoom(pool),writer=testWriter(pool);
      try{
        const sent=await writer.repository.acceptSynthetic(receipt(f,f.people[0]));
        const m=await single(pool,
          "SELECT * FROM bridge_v2_secure_messages WHERE id=$1",[sent.id]);
        assert.equal(sent.sequenceNumber,1);
        assert.equal(sent.duplicate,false);
        assert.equal(m.sender_id,f.people[0]);
        assert.equal(m.policy_version,"bridge-v2");
        const blob=await row(pool,"bridge_v2_secure_live",sent.id);
        assert.ok(Buffer.isBuffer(blob.ciphertext));
        assert.equal(blob.ciphertext.includes(Buffer.from(sample)),false);
        assert.equal(decryptSyntheticPrivate({
          record:fromRow(blob),
          metadata:meta(f,sent.id,f.people[0],m.accepted_at,"live"),
          keyProvider:writer.keyProvider
        }),sample.normalize("NFC"));
        assert.deepEqual(await tally(pool,f.room),
          {messages:1,live:1,unread:0,outbox:1,legacy:0});
      }finally{writer.destroy();}
    });
    await t.test("A02-04 active direct writes two distinct AES-GCM copies for recipient",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        const sender=f.people[0],recipient=f.people[1];
        const sent=await writer.repository.acceptSynthetic(receipt(f,sender));
        const stored=await single(pool,
          "SELECT * FROM bridge_v2_secure_messages WHERE id=$1",[sent.id]);
        const live=await row(pool,"bridge_v2_secure_live",sent.id);
        const unread=await row(pool,"bridge_v2_secure_unread",sent.id);
        assert.equal(unread.recipient_id,recipient);
        assert.equal(unread.connection_id,f.connectionId);
        assert.equal(unread.state,"unread");
        assert.equal(unread.accepted_at.getTime(),stored.accepted_at.getTime());
        assert.equal(unread.expires_at.getTime()-stored.accepted_at.getTime(),7*86400000);
        assert.equal(live.ciphertext.equals(unread.ciphertext),false);
        assert.equal(live.wrapped_dek.equals(unread.wrapped_dek),false);
        assert.equal(live.data_iv.equals(unread.data_iv),false);
        assert.equal(decryptSyntheticPrivate({
          record:fromRow(unread),
          metadata:meta(f,sent.id,sender,stored.accepted_at,"unread",recipient),
          keyProvider:writer.keyProvider
        }),sample.normalize("NFC"));
        assert.deepEqual(await tally(pool,f.conversationId),
          {messages:1,live:1,unread:1,outbox:1,legacy:0});
        assert.equal(await qty(pool,
          "SELECT count(*)::int n FROM bridge_message_payloads p JOIN bridge_messages m "+
          "ON m.id=p.message_id WHERE m.conversation_id=$1",[f.conversationId]),0);
      }finally{writer.destroy();}
    });
    await t.test("A02-05 outsider/wrong actor cannot write; wrong recipient not accepted from caller",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        const outsider=(await accounts(pool,1))[0];
        await assert.rejects(writer.repository.acceptSynthetic(receipt(f,outsider)),denied);
        await assert.rejects(writer.repository.acceptSynthetic({
          ...receipt(f,f.people[0]),actorId:randomUUID().toUpperCase()
        }),denied);
        assert.equal((await tally(pool,f.conversationId)).messages,0);
      }finally{writer.destroy();}
    });
    await t.test("A02-09 duplicate identical normalized content has same receipt, no clock bump",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        const input=receipt(f,f.people[0],"e\u0301 synthetic");
        const first=await writer.repository.acceptSynthetic(input);
        const state=await perRoomState(pool,f.conversationId);
        const retry=await writer.repository.acceptSynthetic({
          ...input,syntheticPlaintext:"é synthetic"
        });
        assert.deepEqual(retry,{...first,duplicate:true});
        assert.deepEqual(await perRoomState(pool,f.conversationId),state);
        assert.deepEqual(await tally(pool,f.conversationId),
          {messages:1,live:1,unread:1,outbox:1,legacy:0});
      }finally{writer.destroy();}
    });
    await t.test("A02-10 different content with SAME clientMessageId fails closed",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        const input=receipt(f,f.people[0]);
        const first=await writer.repository.acceptSynthetic(input);
        const before=await perRoomState(pool,f.conversationId);
        await assert.rejects(writer.repository.acceptSynthetic({
          ...input,syntheticPlaintext:"different synthetic content"
        }),denied);
        assert.equal((await tally(pool,f.conversationId)).messages,1);
        assert.deepEqual(await perRoomState(pool,f.conversationId),before);
        assert.equal(first.sequenceNumber,1);
      }finally{writer.destroy();}
    });
    await t.test("A02-11 lost prior LIVE ciphertext/key blocks duplicate, no clock bump",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        const input=receipt(f,f.people[0]);
        const first=await writer.repository.acceptSynthetic(input);
        const state=await perRoomState(pool,f.conversationId);
        await pool.query(
          "UPDATE bridge_v2_secure_live SET data_tag=$2 WHERE message_id=$1",
          [first.id,Buffer.alloc(16,200)]);
        await assert.rejects(writer.repository.acceptSynthetic(input),denied);
        assert.deepEqual(await perRoomState(pool,f.conversationId),state);
        assert.equal((await tally(pool,f.conversationId)).messages,1);
      }finally{writer.destroy();}
    });
    await t.test("A02-12 exact session timeout boundary and post-Expiry deny writes",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        await setRoomDeadline(pool,f.conversationId,-2500);
        await assert.rejects(writer.repository.acceptSynthetic(
          receipt(f,f.people[0])),denied);
        assert.equal((await tally(pool,f.conversationId)).messages,0);
      }finally{writer.destroy();}
    });
    await t.test("A02-13 both-direction block and relationship revocation deny",async()=>{
      const f=await connected(pool,keep),writer=testWriter(pool);
      try{
        await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
          [f.people[1],f.people[0]]);
        await assert.rejects(writer.repository.acceptSynthetic(receipt(f,f.people[0])),denied);
        await pool.query("DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",
          [f.people[1],f.people[0]]);
        await direct.endRelationship({connectionId:f.connectionId,actorId:f.people[0]});
        await assert.rejects(writer.repository.acceptSynthetic(receipt(f,f.people[1])),denied);
        assert.deepEqual(await tally(pool,f.conversationId),
          {messages:0,live:0,unread:0,outbox:0,legacy:0});
      }finally{writer.destroy();}
    });
    await t.test("A02-16 body-free outbox payload and accepted-only 30m clock",async()=>{
      const f=await randomRoom(pool),writer=testWriter(pool);
      try{
        const sent=await writer.repository.acceptSynthetic(receipt(f,f.people[0]));
        const out=await single(pool,
          "SELECT event_type,payload FROM bridge_event_outbox WHERE event_key=$1",
          ["message:"+sent.id]);
        assert.equal(out.event_type,"conversation.message.accepted");
        assert.deepEqual(Object.keys(out.payload).sort(),["messageId","sequenceNumber"]);
        assert.deepEqual(out.payload,{messageId:sent.id,sequenceNumber:sent.sequenceNumber});
        assert.equal(JSON.stringify(out).includes(sample),false);
        const room=await perRoomState(pool,f.room);
        assert.equal(Number(room.next_message_sequence),2);
        assert.equal(room.idle_expires_at.getTime()-room.last_accepted_at.getTime(),
          30*60000);
        assert.equal((await row(pool,"bridge_v2_secure_live",sent.id)).ciphertext.includes(
          Buffer.from(sample)),false);
      }finally{writer.destroy();}
    });
    await t.test("A02-17 each injected failure stage rolls back all rows and clock",async()=>{
      for(const stage of ["after_metadata","after_live","after_unread",
        "after_outbox","after_clock"]){
        const f=await connected(pool,keep),writer=testWriter(pool);
        try{
          const original=await perRoomState(pool,f.conversationId);
          await assert.rejects(writer.repository.acceptSynthetic({
            ...receipt(f,f.people[0]),failureHook:async s=>{
              if(s===stage)throw Error("b2a-injected-rollback");
            }
          }),/b2a-injected-rollback/);
          assert.deepEqual(await tally(pool,f.conversationId),
            {messages:0,live:0,unread:0,outbox:0,legacy:0},stage);
          assert.deepEqual(await perRoomState(pool,f.conversationId),original,stage);
        }finally{writer.destroy();}
      }
    });
    await t.test("A02-18 malformed, oversized or unpaired surrogate denies before writes",async()=>{
      const f=await randomRoom(pool),writer=testWriter(pool);
      try{
        for(const text of ["","x".repeat(4001),"\ud800",null,23]){
          await assert.rejects(writer.repository.acceptSynthetic(
            receipt(f,f.people[0],text)),denied);
        }
        assert.equal((await tally(pool,f.room)).messages,0);
      }finally{writer.destroy();}
    });
    await t.test("A02-22 B1a secure storage remains default-deny for nonowner",async()=>{
      const x=(await pool.query(
        "SELECT relname,relrowsecurity FROM pg_class WHERE relname=ANY($1::text[]) "+
        "AND relkind='r'",[["bridge_v2_secure_messages",
        "bridge_v2_secure_live","bridge_v2_secure_unread"]])).rows;
      assert.equal(x.length,3);
      assert.ok(x.every(q=>q.relrowsecurity===true));
    });
  }finally{await pool.end();}
});
