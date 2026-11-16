import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  b2SchemaReady,disposableUrl,makeAtomic,blocked,perRoomState,
  repos,secureCounts,uuid,ageUnread
} from "./atomic_fixtures.mjs";

const local=!!process.env.BRIDGE_TEST_DATABASE_URL;
test("B3b-2 signed actor current LIVE / direct UNREAD / bounded ACK and recovery",{
  skip:!local
},async t=>{
  const pool=new pg.Pool({connectionString:disposableUrl(),max:10});
  try{
    await b2SchemaReady(pool);
    await t.test("AT03-17/20 recipient-only LIVE+UNREAD, first ACK, transport recovery",async()=>{
      const a=await makeAtomic(pool);
      try{
        const sender=a.f.people[0],recipient=a.f.people[1];
        const sent=await a.send(sender,"one current direct message");
        const roomBefore=await perRoomState(pool,a.room);
        const current=await a.live(recipient);
        assert.deepEqual(current.messages.map(x=>x.text),["one current direct message"]);
        assert.ok(current.cursor);
        assert.equal(Object.hasOwn(current,"history"),false);
        const inbox=await a.unread(recipient);
        assert.equal(inbox.length,1);
        assert.equal(inbox[0].messageId,sent.id);
        assert.equal(inbox[0].text,"one current direct message");
        assert.deepEqual(await a.unread(sender),[]);
        const first=await a.ack(recipient,inbox[0].envelopeId,
          inbox[0].presentationProof);
        assert.equal(first.status,"acknowledged");
        assert.equal(first.recoveryToken.length,43);
        const recovered=await a.recover(recipient,inbox[0].envelopeId,
          first.recoveryToken);
        assert.deepEqual(recovered,{envelopeId:inbox[0].envelopeId,
          messageId:sent.id,text:"one current direct message"});
        assert.deepEqual(await a.unread(recipient),[]);
        assert.deepEqual(await perRoomState(pool,a.room),roomBefore,
          "reads, ACK and recovery never reset 30-minute session deadline");
      }finally{a.destroy();}
    });
    await t.test("AT03-18 D1 expired/ended current inaccessible, free D2 empty",async()=>{
      const a=await makeAtomic(pool);
      try{
        const sender=a.f.people[0],recipient=a.f.people[1];
        await a.send(sender,"D1 source text must stay D1 only");
        const d1=(await a.live(recipient)).cursor;
        const ended=await repos(pool).direct.end({
          conversationId:a.room,actorId:sender
        });
        assert.ok(["closed","already_closed"].includes(ended.status));
        await assert.rejects(a.live(recipient),blocked);
        const d2=await repos(pool).direct.open({
          connectionId:a.f.connectionId,actorId:sender
        });
        assert.notEqual(d2.conversationId,a.room);
        const empty=await a.call(recipient,"live",{
          conversationId:d2.conversationId
        });
        assert.deepEqual(empty.messages,[]);
        await assert.rejects(a.call(recipient,"live",{
          conversationId:d2.conversationId,cursor:d1
        }),blocked);
        const finite=await a.unread(recipient);
        assert.equal(finite.length,1,
          "the separately encrypted recipient envelope survives D1 End while mutual");
        assert.equal(finite[0].text,"D1 source text must stay D1 only");
      }finally{a.destroy();}
    });
    await t.test("AT03-19 other actor cannot view LIVE, ACK or recover recipient",async()=>{
      const a=await makeAtomic(pool);
      try{
        await a.send(a.f.people[0],"private");
        const recipient=a.f.people[1],sender=a.f.people[0];
        const item=(await a.unread(recipient))[0];
        await assert.rejects(a.live(uuid()),blocked);
        await assert.rejects(a.ack(sender,item.envelopeId,item.presentationProof),blocked);
        await assert.rejects(a.recover(sender,item.envelopeId,"x".repeat(43)),blocked);
        await assert.rejects(a.ack(recipient,item.envelopeId,"forged"),blocked);
        assert.equal((await a.unread(recipient)).length,1);
      }finally{a.destroy();}
    });
    await t.test("AT03-21/22 first ACK immutable, 15-minute recovery cap",async()=>{
      const a=await makeAtomic(pool);
      try{
        const body="historical unread for bounded recovery";
        const sent=await a.send(a.f.people[0],body);
        // Test-only: keep accepted-at/AAD and SQL CHECK constraints coherent.
        await ageUnread(pool,a,sent.id,new Date(Date.now()-30*60000),body);
        const who=a.f.people[1],item=(await a.unread(who))[0];
        const first=await a.ack(who,item.envelopeId,item.presentationProof);
        const original=(await pool.query(
          "SELECT first_acknowledged_at FROM bridge_v2_secure_unread WHERE id=$1",
          [item.envelopeId])).rows[0].first_acknowledged_at;
        const again=await a.ack(who,item.envelopeId,item.presentationProof);
        assert.equal(again.status,"already_acknowledged");
        assert.equal(again.recoveryToken,first.recoveryToken);
        const after=(await pool.query(
          "SELECT first_acknowledged_at FROM bridge_v2_secure_unread WHERE id=$1",
          [item.envelopeId])).rows[0].first_acknowledged_at;
        assert.equal(after.getTime(),original.getTime());
        await pool.query(
          "UPDATE bridge_v2_secure_unread SET first_acknowledged_at="+
          "clock_timestamp()-interval '14 minutes' WHERE id=$1",
          [item.envelopeId]);
        assert.equal((await a.recover(who,item.envelopeId,first.recoveryToken)).text,body);
        await pool.query(
          "UPDATE bridge_v2_secure_unread SET first_acknowledged_at="+
          "clock_timestamp()-interval '16 minutes' WHERE id=$1",
          [item.envelopeId]);
        await assert.rejects(a.recover(who,item.envelopeId,first.recoveryToken),blocked);
        await assert.rejects(a.ack(who,item.envelopeId,item.presentationProof),blocked);
      }finally{a.destroy();}
    });
    await t.test("AT03-23 original seven-day UNREAD expiry never becomes history",async()=>{
      const a=await makeAtomic(pool);
      try{
        const body="expired unread";
        const sent=await a.send(a.f.people[0],body);
        const who=a.f.people[1],item=(await a.unread(who))[0];
        await ageUnread(pool,a,sent.id,
          new Date(Date.now()-7*86400000-2000),body);
        assert.deepEqual(await a.unread(who),[]);
        await assert.rejects(a.ack(who,item.envelopeId,item.presentationProof),blocked);
        assert.equal((await secureCounts(pool,a.room)).messages,1,
          "encrypted store remains but unavailable to ordinary free history");
      }finally{a.destroy();}
    });
    await t.test("AT03-24 Block after SEND forbids recipient UNREAD/ACK/recover",async()=>{
      const a=await makeAtomic(pool);
      try{
        await a.send(a.f.people[0]);
        const who=a.f.people[1],item=(await a.unread(who))[0];
        const token=(await a.ack(who,item.envelopeId,item.presentationProof)).recoveryToken;
        await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) "+
          "VALUES($1,$2)",[a.f.people[0],who]);
        assert.deepEqual(await a.unread(who),[]);
        await assert.rejects(a.recover(who,item.envelopeId,token),blocked);
        await assert.rejects(a.live(who),blocked);
      }finally{a.destroy();}
    });
    await t.test("AT03-25 tampered AEAD tag fails closed without plaintext fallback",async()=>{
      const a=await makeAtomic(pool);
      try{
        const sent=await a.send(a.f.people[0],"encrypted ciphertext");
        await pool.query("UPDATE bridge_v2_secure_live SET data_tag=$2 "+
          "WHERE message_id=$1",[sent.id,Buffer.alloc(16,23)]);
        await assert.rejects(a.live(a.f.people[1]),blocked);
        assert.equal((await secureCounts(pool,a.room)).legacy,0);
      }finally{a.destroy();}
    });
    await t.test("AT03-26 two-device ACK returns original token, no clock extension",async()=>{
      const a=await makeAtomic(pool);
      try{
        await a.send(a.f.people[0]);
        const who=a.f.people[1],item=(await a.unread(who))[0];
        const before=await perRoomState(pool,a.room);
        const [x,y]=await Promise.all([
          a.ack(who,item.envelopeId,item.presentationProof),
          a.ack(who,item.envelopeId,item.presentationProof)
        ]);
        assert.deepEqual(new Set([x.status,y.status]),
          new Set(["acknowledged","already_acknowledged"]));
        assert.equal(x.recoveryToken,y.recoveryToken);
        const row=(await pool.query(
          "SELECT first_acknowledged_at,recovery_token_digest "+
          "FROM bridge_v2_secure_unread WHERE id=$1",
          [item.envelopeId])).rows[0];
        assert.ok(row.first_acknowledged_at instanceof Date);
        assert.equal(row.recovery_token_digest.length,32);
        assert.deepEqual(await perRoomState(pool,a.room),before);
      }finally{a.destroy();}
    });
  }finally{await pool.end();}
});
