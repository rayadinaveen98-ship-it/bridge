import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import {createPrivateDeliveryRepository} from "../../../src/messaging/private_delivery_repository.mjs";
import {encryptSyntheticPrivate} from "../../../src/messaging/private_crypto.mjs";
import {b2SchemaReady,checkDisposable,testWriter,repos,connected,randomRoom,
  accounts,hold,uuid,sample,perRoomState,tally} from "./b2_fixtures.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL;
const denied=e=>e?.code==="resource_unavailable"||e?.code==="private_crypto_unavailable";
const send=(f,actorId)=>({
  conversationId:f.conversationId??f.room,actorId,clientMessageId:uuid(),
  syntheticPlaintext:sample
});
const make=(pool,w)=>createPrivateDeliveryRepository(pool,{
  keyProvider:w.keyProvider,
  cursorKey:randomBytes(32),presentationKey:randomBytes(32),
  recoveryKey:randomBytes(32)
});
async function agedEnvelope(pool,w,f,sent,acceptedAt) {
  // Disposable-only fixture edit: re-encrypt UNREAD with its new immutable AAD
  // and set exactly matching message/unread source acceptance timestamp.
  const accepted=acceptedAt instanceof Date?acceptedAt:new Date(acceptedAt);
  const blob=encryptSyntheticPrivate({
    plaintext:sample,metadata:{
      policyVersion:"bridge-v2",payloadVersion:1,purpose:"unread",
      messageId:sent.id,conversationId:f.conversationId,
      senderId:f.people[0],recipientId:f.people[1],
      acceptedAtMs:accepted.getTime()
    },
    keyProvider:w.keyProvider,wrapNonceRegistry:w.wrapNonceRegistry,
    keyId:w.keyRefs.unread.keyId,keyVersion:w.keyRefs.unread.version
  });
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query(
      "UPDATE bridge_v2_secure_messages SET accepted_at=$2 WHERE id=$1",
      [sent.id,accepted]
    );
    await client.query(
      "UPDATE bridge_v2_secure_unread SET accepted_at=$2,"+
      "expires_at=$3,ciphertext=$4,data_iv=$5,data_tag=$6,wrapped_dek=$7,"+
      "wrap_iv=$8,wrap_tag=$9,kek_id=$10,kek_version=$11,"+
      "cipher_suite=$12,aad_version=$13 WHERE message_id=$1",
      [sent.id,accepted,new Date(accepted.getTime()+7*86400000),
       blob.ciphertext,blob.dataIv,blob.dataTag,blob.wrappedDek,
       blob.wrapIv,blob.wrapTag,blob.kekId,blob.kekVersion,
       blob.cipherSuite,blob.aadVersion]
    );
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}
  finally{client.release();}
}
test("B2b disposable recovery boundaries, two-device ACK and concurrency",{
  skip:!url
},async t=>{
  checkDisposable();
  const pool=new pg.Pool({connectionString:url,max:8});
  try{
    await b2SchemaReady(pool);
    const {keep,direct}=repos(pool);
    await t.test("D02-07 two devices ACK same delivered envelope once; token stable",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=make(pool,w);
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        const item=(await r.unreadInbox({actorId:f.people[1]}))
          .find(x=>x.messageId===sent.id);
        const [a,b]=await Promise.all(Array.from({length:2},()=>r.acknowledge({
          envelopeId:item.envelopeId,actorId:f.people[1],
          presentationProof:item.presentationProof
        })));
        assert.deepEqual([a.status,b.status].sort(),
          ["acknowledged","already_acknowledged"].sort());
        assert.equal(a.recoveryToken,b.recoveryToken);
        assert.equal((await r.unreadInbox({actorId:f.people[1]}))
          .some(x=>x.envelopeId===item.envelopeId),false);
        assert.equal((await r.recover({envelopeId:item.envelopeId,
          actorId:f.people[1],recoveryToken:a.recoveryToken})).text,sample.normalize("NFC"));
      }finally{w.destroy();}
    });
    await t.test("D02-08/09 first ACK + 15 minutes, bounded by accepted+7 days",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=make(pool,w);
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        const aged=new Date(Date.now()-6*86400000-22*3600000);
        await agedEnvelope(pool,w,f,sent,aged);
        const item=(await r.unreadInbox({actorId:f.people[1]}))
          .find(x=>x.messageId===sent.id);
        assert.ok(item,"eligible aged UNREAD up to original seven-day expiry");
        const ack=await r.acknowledge({envelopeId:item.envelopeId,
          actorId:f.people[1],presentationProof:item.presentationProof});
        const first=(await pool.query(
          "SELECT first_acknowledged_at FROM bridge_v2_secure_unread WHERE id=$1",
          [item.envelopeId])).rows[0].first_acknowledged_at;
        const within=new Date(Date.now()-14*60000);
        assert.ok(within.getTime()>aged.getTime());
        await pool.query(
          "UPDATE bridge_v2_secure_unread SET first_acknowledged_at=$2 WHERE id=$1",
          [item.envelopeId,within]
        );
        assert.equal((await r.recover({envelopeId:item.envelopeId,
          actorId:f.people[1],recoveryToken:ack.recoveryToken})).text,sample.normalize("NFC"));
        await pool.query(
          "UPDATE bridge_v2_secure_unread SET first_acknowledged_at=$2 WHERE id=$1",
          [item.envelopeId,new Date(Date.now()-15*60000-1500)]
        );
        await assert.rejects(r.recover({envelopeId:item.envelopeId,
          actorId:f.people[1],recoveryToken:ack.recoveryToken}),denied);
        await pool.query(
          "UPDATE bridge_v2_secure_unread SET first_acknowledged_at=$2 WHERE id=$1",
          [item.envelopeId,within]
        );
        // Expire the envelope while honoring both database CHECK constraints:
        // firstAck < expiresAt and acceptedAt < expiresAt. Never extend TTL.
        await pool.query(
          "UPDATE bridge_v2_secure_unread SET expires_at=$2 WHERE id=$1",
          [item.envelopeId,new Date(Date.now()-1000)]
        );
        await assert.rejects(r.recover({envelopeId:item.envelopeId,
          actorId:f.people[1],recoveryToken:ack.recoveryToken}),denied);
      }finally{w.destroy();}
    });
    await t.test("D02-06 exactly expired 7-day unread never returns a previous transcript",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=make(pool,w);
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        await agedEnvelope(pool,w,f,sent,
          new Date(Date.now()-7*86400000-2000));
        const inbox=await r.unreadInbox({actorId:f.people[1]});
        assert.equal(inbox.some(x=>x.messageId===sent.id),false);
        assert.equal((await tally(pool,f.conversationId)).unread,1,
          "expired bytes remain physically present in synthetic fixture but unavailable");
      }finally{w.destroy();}
    });
    await t.test("D02-11 block committed before queued LIVE read denies after lock wait",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=make(pool,w);
      const locker=await pool.connect();
      try{
        await w.repository.acceptSynthetic(send(f,f.people[0]));
        await locker.query("BEGIN");
        await locker.query("SELECT pg_advisory_xact_lock($1)",[714411]);
        const pending=r.readCurrent({conversationId:f.conversationId,actorId:f.people[1]});
        await hold(60);
        await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
          [f.people[0],f.people[1]]);
        await locker.query("COMMIT");
        await assert.rejects(pending,denied);
      }finally{
        try{await locker.query("ROLLBACK");}catch{}
        locker.release();w.destroy();
      }
    });
    await t.test("D02-11 blocked peer never receives queued UNREAD or recovery",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=make(pool,w);
      const locker=await pool.connect();
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        const item=(await r.unreadInbox({actorId:f.people[1]}))
          .find(x=>x.messageId===sent.id);
        const ack=await r.acknowledge({envelopeId:item.envelopeId,
          actorId:f.people[1],presentationProof:item.presentationProof});
        await locker.query("BEGIN");
        await locker.query("SELECT pg_advisory_xact_lock($1)",[714411]);
        const pending=r.recover({envelopeId:item.envelopeId,
          actorId:f.people[1],recoveryToken:ack.recoveryToken});
        await hold(60);
        await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
          [f.people[1],f.people[0]]);
        await locker.query("COMMIT");
        await assert.rejects(pending,denied);
        assert.equal((await r.unreadInbox({actorId:f.people[1]}))
          .some(x=>x.envelopeId===item.envelopeId),false);
      }finally{
        try{await locker.query("ROLLBACK");}catch{}
        locker.release();w.destroy();
      }
    });
    await t.test("D02-02 End revokes queued LIVE, but eligible UNREAD survives End",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool),r=make(pool,w);
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        await direct.end({conversationId:f.conversationId,actorId:f.people[0]});
        await assert.rejects(r.readCurrent({conversationId:f.conversationId,
          actorId:f.people[1]}),denied);
        const inbox=await r.unreadInbox({actorId:f.people[1]});
        assert.equal(inbox.some(x=>x.messageId===sent.id),true);
      }finally{w.destroy();}
    });
    await t.test("D02-15 active room encrypted LIVE tombstone advances cursor, never reveals old body",async()=>{
      const f=await randomRoom(pool),w=testWriter(pool),r=make(pool,w);
      try{
        const sent=await w.repository.acceptSynthetic(send(f,f.people[0]));
        await pool.query("DELETE FROM bridge_v2_secure_live WHERE message_id=$1",
          [sent.id]);
        const page=await r.readCurrent({conversationId:f.room,actorId:f.people[1]});
        assert.deepEqual(page.messages,[{id:sent.id,sequenceNumber:1,deleted:true}]);
        assert.equal((await r.readCurrent({conversationId:f.room,actorId:f.people[1],
          cursor:page.cursor})).messages.length,0);
      }finally{w.destroy();}
    });
    await t.test("D02-17 test-only DB guard, no cloud/old API imports or HTTP reader",async()=>{
      const f=await connected(pool,keep),w=testWriter(pool);
      try{
        assert.throws(()=>createPrivateDeliveryRepository({
          options:{connectionString:"postgresql://bridge_test:x@neon.tech/bridge_test"},
          connect:()=>{throw Error("FORBIDDEN CLOUD CONNECTION");}
        },{keyProvider:w.keyProvider,cursorKey:randomBytes(32),
          presentationKey:randomBytes(32),recoveryKey:randomBytes(32)}),denied);
        const src=await readFile(new URL("../../../src/messaging/private_delivery_repository.mjs",
          import.meta.url),"utf8");
        assert.doesNotMatch(src,/BRIDGE_DATABASE_URL|CREATE TABLE|ALTER TABLE|bridge_messages\.body/);
        for(const path of ["http.mjs","postgres.mjs","start.mjs","outbox.mjs"]){
          const raw=await readFile(new URL("../../../src/"+path,import.meta.url),"utf8");
          assert.doesNotMatch(raw,/private_delivery_repository\.mjs/);
        }
      }finally{w.destroy();}
    });
  }finally{await pool.end();}
});
