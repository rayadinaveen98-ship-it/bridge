import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {randomUUID} from "node:crypto";
import {setRoomDeadline} from "../private_messaging/b2_fixtures.mjs";
import {
  b2SchemaReady,disposableUrl,makeAtomic,blocked,secureCounts,
  perRoomState,uuid,guardedPoolSpy,actualLegacySnapshot,legacySnapshot
} from "./atomic_fixtures.mjs";

const local=!!process.env.BRIDGE_TEST_DATABASE_URL;
test("B3b-2 signed actor + AES-GCM write in ONE disposable transaction",{
  skip:!local
},async t=>{
  const pool=new pg.Pool({connectionString:disposableUrl(),max:10});
  try{
    await b2SchemaReady(pool);
    await t.test("AT03-01/13 signed A sends direct encrypted row, separate recipient unread",async()=>{
      const a=await makeAtomic(pool);
      try{
        const result=await a.send(a.f.people[0]);
        assert.equal(result.sequenceNumber,1);
        assert.equal(result.duplicate,false);
        assert.deepEqual(await secureCounts(pool,a.room),
          {messages:1,live:1,unread:1,outbox:1,legacy:0});
        const live=(await pool.query(
          "SELECT l.ciphertext FROM bridge_v2_secure_live l WHERE l.message_id=$1",
          [result.id])).rows[0];
        const unread=(await pool.query(
          "SELECT u.ciphertext,u.recipient_id,u.expires_at,u.accepted_at "+
          "FROM bridge_v2_secure_unread u WHERE u.message_id=$1",[result.id])).rows[0];
        assert.ok(Buffer.isBuffer(live.ciphertext));
        assert.equal(live.ciphertext.includes(Buffer.from("B3b-2 encrypted")),false);
        assert.equal(live.ciphertext.equals(unread.ciphertext),false);
        assert.equal(unread.recipient_id,a.f.people[1]);
        assert.equal(unread.expires_at-unread.accepted_at,7*86400000);
      }finally{a.destroy();}
    });
    await t.test("AT03-11 random acceptance current-only; no direct unread",async()=>{
      const a=await makeAtomic(pool,{kind:"random"});
      try{
        const result=await a.send(a.f.people[0],"Random no history");
        assert.equal(result.sequenceNumber,1);
        assert.deepEqual(await secureCounts(pool,a.room),
          {messages:1,live:1,unread:0,outbox:1,legacy:0});
        assert.deepEqual((await a.live(a.f.people[1])).messages.map(x=>x.text),
          ["Random no history"]);
        assert.deepEqual(await a.unread(a.f.people[1]),[]);
      }finally{a.destroy();}
    });
    await t.test("AT03-11 signed 30-minute clock boundary; only unique accepted extends",async()=>{
      const a=await makeAtomic(pool,{kind:"random"});
      try{
        const who=a.f.people[0];
        // 2 seconds before server idle expiry: unique new accepted content
        // is authorized and resets clock from authoritative DB time.
        await setRoomDeadline(pool,a.room,2000);
        const before=await perRoomState(pool,a.room);
        const accepted=await a.send(who,"unique at late idle boundary");
        const after=await perRoomState(pool,a.room);
        assert.equal(accepted.sequenceNumber,1);
        assert.ok(after.last_accepted_at>before.last_accepted_at);
        assert.equal(after.idle_expires_at.getTime()-
          after.last_accepted_at.getTime(),30*60000);
        // 2 seconds past expiry: no new message/clock mutation allowed.
        await setRoomDeadline(pool,a.room,-2000);
        const alreadyExpired=await perRoomState(pool,a.room);
        await assert.rejects(a.send(who,"too late"),blocked);
        assert.deepEqual(await perRoomState(pool,a.room),alreadyExpired);
        assert.equal((await secureCounts(pool,a.room)).messages,1);
      }finally{a.destroy();}
    });
    await t.test("AT03-02/03 modified actor, role, premium, wrong signed token denied",async()=>{
      const a=await makeAtomic(pool);
      try{
        const own=a.f.people[0],other=a.f.people[1];
        const payload={conversationId:a.room,clientMessageId:uuid(),
          syntheticPlaintext:"deny spoof"};
        for(const extra of [
          {actorId:other},{role:"admin"},{premium:true},
          {auth_subject:"b3b-disposable:"+other},{status:"active"}
        ])await assert.rejects(a.facade.dispatchSynthetic({
          authorization:a.tokenFor(own),operation:"send",payload:{...payload,...extra}
        }),blocked);
        await assert.rejects(a.facade.dispatchSynthetic({
          authorization:"Bearer fake.unsigned.token",operation:"send",payload
        }),blocked);
        await assert.rejects(a.facade.dispatchSynthetic({
          authorization:a.tokenFor(own),operation:"archive",payload
        }),blocked);
        await assert.rejects(a.facade.dispatchSynthetic({
          authorization:a.tokenFor(own),operation:"send",payload,
          work:()=>true
        }),blocked);
        assert.equal((await secureCounts(pool,a.room)).messages,0);
      }finally{a.destroy();}
    });
    await t.test("AT03-12 duplicate is same receipt, does not shift clock or sequence",async()=>{
      const a=await makeAtomic(pool);
      try{
        const m=uuid(),own=a.f.people[0];
        const first=await a.send(own,"Á test",m);
        const before=await perRoomState(pool,a.room);
        const again=await a.send(own,"Á test",m);
        assert.deepEqual(again,{...first,duplicate:true});
        assert.deepEqual(await perRoomState(pool,a.room),before);
        assert.deepEqual(await secureCounts(pool,a.room),
          {messages:1,live:1,unread:1,outbox:1,legacy:0});
      }finally{a.destroy();}
    });
    await t.test("AT03-14/15/16 metadata/live/unread/outbox/clock fault rollback",async()=>{
      for(const failurePoint of ["after_metadata","after_live","after_unread",
        "after_outbox","after_clock"]){
        const a=await makeAtomic(pool,{testGate:({point})=>{
          if(point===failurePoint)throw Error("SYNTHETIC-INJECTED");
        }});
        try{
          const before=await perRoomState(pool,a.room);
          const counts=await secureCounts(pool,a.room);
          await assert.rejects(a.send(a.f.people[0]),blocked);
          assert.deepEqual(await secureCounts(pool,a.room),counts,
            "failure point "+failurePoint+" rolled back all rows");
          assert.deepEqual(await perRoomState(pool,a.room),before);
        }finally{a.destroy();}
      }
    });
    await t.test("AT03-10/24 committed Block, forbidden actor and expired room deny",async()=>{
      const a=await makeAtomic(pool);
      try{
        const outsider=randomUUID();
        await assert.rejects(a.send(outsider),blocked);
        await pool.query(
          "INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
          [a.f.people[1],a.f.people[0]]
        );
        await assert.rejects(a.send(a.f.people[0]),blocked);
        assert.equal((await secureCounts(pool,a.room)).messages,0);
      }finally{a.destroy();}
    });
    await t.test("AT03-27 one signed send uses exactly one checkout and BEGIN/mutex/COMMIT",async()=>{
      const spy=guardedPoolSpy(pool);
      const a=await makeAtomic(pool,{facadePool:spy.pool});
      try{
        const sent=await a.send(a.f.people[0]);
        assert.equal(sent.sequenceNumber,1);
        assert.deepEqual({
          checkout:spy.audit.checkout,begin:spy.audit.begin,
          commit:spy.audit.commit,rollback:spy.audit.rollback,
          mutex:spy.audit.mutex,clients:spy.audit.clients.size
        },{checkout:1,begin:1,commit:1,rollback:0,mutex:1,clients:1});
      }finally{a.destroy();}
    });
    await t.test("AT03-28 original four-message synthetic QA hash unchanged",async()=>{
      const {fixture,before}=await actualLegacySnapshot(pool);
      const a=await makeAtomic(pool);
      try{
        await a.send(a.f.people[0]);
        assert.equal(await legacySnapshot(pool,fixture),before);
      }finally{a.destroy();}
    });
  }finally{await pool.end();}
});
