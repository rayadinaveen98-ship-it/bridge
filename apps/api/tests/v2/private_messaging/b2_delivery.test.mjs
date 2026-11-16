import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {randomBytes} from "node:crypto";
import {createPrivateDeliveryRepository} from "../../../src/messaging/private_delivery_repository.mjs";
import {b2SchemaReady,checkDisposable,testWriter,repos,randomRoom,connected,legacyFixture,legacySnapshot,accounts,setRoomDeadline,perRoomState,tally,uuid,sample} from "./b2_fixtures.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL;
const denied=e=>e?.code==="resource_unavailable"||e?.code==="private_crypto_unavailable";
const send=(f,a)=>({conversationId:f.conversationId??f.room,actorId:a,clientMessageId:uuid(),syntheticPlaintext:sample});
const reader=(pool,w)=>createPrivateDeliveryRepository(pool,{
  keyProvider:w.keyProvider,cursorKey:randomBytes(32),
  presentationKey:randomBytes(32),recoveryKey:randomBytes(32)
});
test("B2b LIVE and UNREAD secure scoped delivery (synthetic PG16 only)",{skip:!url},async t=>{
  checkDisposable();const pool=new pg.Pool({connectionString:url,max:8});
  try{
    await b2SchemaReady(pool);
    const {keep,direct}=repos(pool);
    await t.test("D02-01 random current-only read, signed cursor and no random unread",async()=>{
      const f=await randomRoom(pool),w=testWriter(pool),r=reader(pool,w);
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        const page=await r.readCurrent({conversationId:f.room,actorId:f.people[1]});
        assert.equal(page.messages.length,1);
        assert.deepEqual(page.messages[0],{id:sent.id,sequenceNumber:1,
          senderId:f.people[0],deleted:false,text:sample.normalize("NFC")});
        assert.equal((await r.readCurrent({conversationId:f.room,actorId:f.people[1],
          cursor:page.cursor})).messages.length,0);
        assert.deepEqual(await r.unreadInbox({actorId:f.people[1]}),[]);
        assert.equal((await tally(pool,f.room)).legacy,0);
      }finally{w.destroy();}
    });
    await t.test("D02-02/03 cursor rejects other actor, room and tampered MAC",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=reader(pool,w);
      try{
        await w.repository.acceptSynthetic(send(f,f.people[0]));
        const first=await r.readCurrent({conversationId:f.conversationId,actorId:f.people[1]});
        await assert.rejects(r.readCurrent({conversationId:f.conversationId,
          actorId:f.people[0],cursor:first.cursor}),denied);
        const forged=first.cursor.slice(0,-1)+(first.cursor.at(-1)==="A"?"B":"A");
        await assert.rejects(r.readCurrent({conversationId:f.conversationId,
          actorId:f.people[1],cursor:forged}),denied);
        const outsider=(await accounts(pool,1))[0];
        await assert.rejects(r.readCurrent({conversationId:f.conversationId,
          actorId:outsider}),denied);
      }finally{w.destroy();}
    });
    await t.test("D02-04 expired random or closed D1 not historical D2 timeline",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=reader(pool,w);
      try{
        await w.repository.acceptSynthetic(send(f,f.people[0]));
        const first=await r.readCurrent({conversationId:f.conversationId,actorId:f.people[1]});
        await direct.end({conversationId:f.conversationId,actorId:f.people[0]});
        await assert.rejects(r.readCurrent({conversationId:f.conversationId,actorId:f.people[1]}),denied);
        const next=await direct.open({connectionId:f.connectionId,actorId:f.people[0]});
        const blank=await r.readCurrent({conversationId:next.conversationId,actorId:f.people[1]});
        assert.deepEqual(blank.messages,[]);
        await assert.rejects(r.readCurrent({conversationId:next.conversationId,
          actorId:f.people[1],cursor:first.cursor}),denied);
        const random=await randomRoom(pool);
        await w.repository.acceptSynthetic(send(random,random.people[0]));
        await setRoomDeadline(pool,random.room,-3000);
        await assert.rejects(r.readCurrent({conversationId:random.room,
          actorId:random.people[1]}),denied);
      }finally{w.destroy();}
    });
    await t.test("D02-05/06 UNREAD only recipient, allowed after D1 End, never general history",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=reader(pool,w);
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        await direct.end({conversationId:f.conversationId,actorId:f.people[0]});
        const item=(await r.unreadInbox({actorId:f.people[1]}))
          .find(x=>x.messageId===sent.id);
        assert.equal(item.text,sample.normalize("NFC"));
        assert.equal(typeof item.presentationProof,"string");
        assert.equal(Object.hasOwn(item,"conversationId"),false);
        assert.equal((await r.unreadInbox({actorId:f.people[0]}))
          .some(x=>x.envelopeId===item.envelopeId),false);
        await assert.rejects(r.acknowledge({envelopeId:item.envelopeId,
          actorId:f.people[0],presentationProof:item.presentationProof}),denied);
      }finally{w.destroy();}
    });
    await t.test("D02-09 ACK requires presentation, immutable clock and digest-only recovery",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=reader(pool,w);
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        const room=await perRoomState(pool,f.conversationId);
        const item=(await r.unreadInbox({actorId:f.people[1]}))
          .find(x=>x.messageId===sent.id);
        await assert.rejects(r.acknowledge({envelopeId:item.envelopeId,actorId:f.people[1]}),denied);
        const ack=await r.acknowledge({envelopeId:item.envelopeId,
          actorId:f.people[1],presentationProof:item.presentationProof});
        assert.equal(ack.status,"acknowledged");
        assert.match(ack.recoveryToken,/^[A-Za-z0-9_-]{43}$/);
        const before=(await pool.query("SELECT first_acknowledged_at,recovery_token_digest "+
          "FROM bridge_v2_secure_unread WHERE id=$1",[item.envelopeId])).rows[0];
        assert.equal(before.recovery_token_digest.length,32);
        assert.equal(before.recovery_token_digest.equals(Buffer.from(ack.recoveryToken)),false);
        const repeat=await r.acknowledge({envelopeId:item.envelopeId,
          actorId:f.people[1],presentationProof:item.presentationProof});
        assert.equal(repeat.status,"already_acknowledged");
        assert.equal(repeat.recoveryToken,ack.recoveryToken);
        const after=(await pool.query("SELECT first_acknowledged_at FROM "+
          "bridge_v2_secure_unread WHERE id=$1",[item.envelopeId])).rows[0];
        assert.equal(before.first_acknowledged_at.getTime(),after.first_acknowledged_at.getTime());
        assert.equal((await r.unreadInbox({actorId:f.people[1]}))
          .some(x=>x.envelopeId===item.envelopeId),false);
        assert.deepEqual(await perRoomState(pool,f.conversationId),room);
      }finally{w.destroy();}
    });
    await t.test("D02-10 capability recipient/scope/bytes bound; no partial decrypt",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=reader(pool,w);
      try{
        const a=await w.repository.acceptSynthetic(send(f,f.people[0]));
        const b=await w.repository.acceptSynthetic(send(f,f.people[0]));
        const inbox=await r.unreadInbox({actorId:f.people[1]});
        const first=inbox.find(x=>x.messageId===a.id),second=inbox.find(x=>x.messageId===b.id);
        const ack=await r.acknowledge({envelopeId:first.envelopeId,
          actorId:f.people[1],presentationProof:first.presentationProof});
        assert.equal((await r.recover({envelopeId:first.envelopeId,actorId:f.people[1],
          recoveryToken:ack.recoveryToken})).text,sample.normalize("NFC"));
        await assert.rejects(r.recover({envelopeId:first.envelopeId,
          actorId:f.people[0],recoveryToken:ack.recoveryToken}),denied);
        await assert.rejects(r.recover({envelopeId:second.envelopeId,
          actorId:f.people[1],recoveryToken:ack.recoveryToken}),denied);
        const forged=(ack.recoveryToken[0]==="A"?"B":"A")+ack.recoveryToken.slice(1);
        await assert.rejects(r.recover({envelopeId:first.envelopeId,
          actorId:f.people[1],recoveryToken:forged}),denied);
      }finally{w.destroy();}
    });
    await t.test("D02-13 block, revocation and tampered data deny protected UNREAD",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=reader(pool,w);
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        const item=(await r.unreadInbox({actorId:f.people[1]}))
          .find(x=>x.messageId===sent.id);
        const ack=await r.acknowledge({envelopeId:item.envelopeId,
          actorId:f.people[1],presentationProof:item.presentationProof});
        await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
          [f.people[0],f.people[1]]);
        await assert.rejects(r.recover({envelopeId:item.envelopeId,
          actorId:f.people[1],recoveryToken:ack.recoveryToken}),denied);
        await pool.query("DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",
          [f.people[0],f.people[1]]);
        await direct.endRelationship({connectionId:f.connectionId,actorId:f.people[0]});
        await assert.rejects(r.recover({envelopeId:item.envelopeId,
          actorId:f.people[1],recoveryToken:ack.recoveryToken}),denied);
      }finally{w.destroy();}
    });
    await t.test("D02-12/16 bad AEAD tag fails and reads never update room clock",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=reader(pool,w);
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        const original=await perRoomState(pool,f.conversationId);
        const message=await r.readCurrent({conversationId:f.conversationId,actorId:f.people[1]});
        assert.equal(message.messages.length,1);
        await r.unreadInbox({actorId:f.people[1]});
        assert.deepEqual(await perRoomState(pool,f.conversationId),original);
        const u=(await pool.query("SELECT id FROM bridge_v2_secure_unread WHERE message_id=$1",
          [sent.id])).rows[0].id;
        await pool.query("UPDATE bridge_v2_secure_unread SET data_tag=$2 WHERE id=$1",
          [u,Buffer.alloc(16,31)]);
        await assert.rejects(r.unreadInbox({actorId:f.people[1]}),denied);
        assert.deepEqual(await perRoomState(pool,f.conversationId),original);
      }finally{w.destroy();}
    });
    await t.test("D02-14 legacy QA never readable by disconnected encrypted reader",async()=>{
      const f=await legacyFixture(pool),w=testWriter(pool),r=reader(pool,w);
      try{
        await assert.rejects(r.readCurrent({conversationId:f.room,actorId:f.people[0]}),denied);
        assert.equal(await legacySnapshot(pool,f),f.before);
      }finally{w.destroy();}
    });
  }finally{await pool.end();}
});
