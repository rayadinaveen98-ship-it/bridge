import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  b2SchemaReady,disposableUrl,makeAtomic,blocked,perRoomState,
  secureCounts,uuid,sleep,guardedPoolSpy
} from "./atomic_fixtures.mjs";
import {signedToken,subject} from "./fixtures.mjs";

const local=!!process.env.BRIDGE_TEST_DATABASE_URL;
test("B3b-2 signed identity, Block, peer lock, expiry and rollback PG16 races",{
  skip:!local
},async t=>{
  const pool=new pg.Pool({connectionString:disposableUrl(),max:12});
  try{
    await b2SchemaReady(pool);
    await t.test("AT03-04 account status commits while V2 waits on advisory mutex",async()=>{
      const a=await makeAtomic(pool);
      const locker=await pool.connect();
      try{
        await locker.query("BEGIN");
        await locker.query("SELECT pg_advisory_xact_lock($1)",[714411]);
        const before=await perRoomState(pool,a.room);
        const pending=a.send(a.f.people[0]).then(
          x=>({success:true,x}),e=>({success:false,e}));
        await sleep(80);
        await pool.query("UPDATE bridge_accounts SET status='restricted' WHERE id=$1",
          [a.f.people[0]]);
        await locker.query("COMMIT");
        const result=await pending;
        assert.equal(result.success,false);
        assert.equal(blocked(result.e),true);
        assert.equal((await secureCounts(pool,a.room)).messages,0);
        assert.deepEqual(await perRoomState(pool,a.room),before);
      }finally{
        await locker.query("ROLLBACK").catch(()=>{});
        locker.release();a.destroy();
      }
    });
    await t.test("AT03-09 reassigned signed subject cannot become B actor",async()=>{
      const a=await makeAtomic(pool);
      try{
        const [one,two]=a.f.people;
        const actorToken=a.tokenFor(one);
        await pool.query("UPDATE bridge_accounts SET auth_subject=$2 WHERE id=$1",
          [one,"removed-"+uuid()]);
        await pool.query("UPDATE bridge_accounts SET auth_subject=$2 WHERE id=$1",
          [two,subject(one)]);
        await assert.rejects(a.facade.dispatchSynthetic({
          authorization:actorToken,operation:"send",
          payload:{conversationId:a.room,clientMessageId:uuid(),
            syntheticPlaintext:"deny old actor"}
        }),blocked);
        assert.equal((await secureCounts(pool,a.room)).messages,0);
      }finally{a.destroy();}
    });
    await t.test("AT03-08 peer account FOR SHARE holds while status UPDATE queues",async()=>{
      let entered,release;
      const enteredGate=new Promise(r=>{entered=r});
      const hold=new Promise(r=>{release=r});
      const a=await makeAtomic(pool,{testGate:async({point})=>{
        if(point==="after_operation_before_final_token"){
          entered();await hold;
        }
      }});
      let update;
      try{
        const active=a.send(a.f.people[0]);
        await enteredGate;
        let mutated=false;
        update=pool.query("UPDATE bridge_accounts SET safety_eligible=false "+
          "WHERE id=$1",[a.f.people[1]]).then(()=>{mutated=true});
        await sleep(100);
        assert.equal(mutated,false,
          "peer account row SHARE lock must serialize status changes");
        release();
        const receipt=await active;
        assert.equal(receipt.sequenceNumber,1);
        await update;
        assert.equal(mutated,true);
        await assert.rejects(a.send(a.f.people[0]),blocked);
      }finally{
        release();await update?.catch(()=>{});
        a.destroy();
      }
    });
    await t.test("AT03-05 JWT expires AFTER B2 encrypted write but BEFORE COMMIT",async()=>{
      const a=await makeAtomic(pool,{testGate:async({point})=>{
        if(point==="after_operation_before_final_token")await sleep(2450);
      }});
      try{
        const before=await perRoomState(pool,a.room);
        const soon=signedToken(a.keys,{sub:subject(a.f.people[0]),claims:{
          exp:Math.floor(Date.now()/1000)+2
        }});
        await assert.rejects(a.facade.dispatchSynthetic({
          authorization:soon,operation:"send",payload:{
            conversationId:a.room,clientMessageId:uuid(),
            syntheticPlaintext:"expires in B2 while holding client"
          }
        }),blocked);
        assert.deepEqual(await perRoomState(pool,a.room),before);
        assert.deepEqual(await secureCounts(pool,a.room),
          {messages:0,live:0,unread:0,outbox:0,legacy:0});
      }finally{a.destroy();}
    });
    await t.test("AT03-06 synthetic restricted/removed account denies five operations",async()=>{
      const a=await makeAtomic(pool);
      try{
        const sender=a.f.people[0],receiver=a.f.people[1];
        const sent=await a.send(sender);
        const item=(await a.unread(receiver))[0];
        await pool.query("UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",
          [receiver]);
        const options=[
          ["send",{conversationId:a.room,clientMessageId:uuid(),
            syntheticPlaintext:"restricted"}],
          ["live",{conversationId:a.room}],
          ["unread",{}],
          ["ack",{envelopeId:item.envelopeId,presentationProof:item.presentationProof}],
          ["recover",{envelopeId:item.envelopeId,recoveryToken:"r".repeat(43)}]
        ];
        for(const [op,payload] of options)
          await assert.rejects(a.call(receiver,op,payload),blocked,op);
        assert.equal((await secureCounts(pool,a.room)).messages,1);
        assert.equal(sent.sequenceNumber,1);
      }finally{a.destroy();}
    });
    await t.test("AT03-24 Block commits while signed operation queued; deny then no revives",async()=>{
      const a=await makeAtomic(pool);
      const locker=await pool.connect();
      try{
        await locker.query("BEGIN");
        await locker.query("SELECT pg_advisory_xact_lock($1)",[714411]);
        const pending=a.send(a.f.people[0]).then(
          x=>({ok:true,x}),e=>({ok:false,e}));
        await sleep(70);
        await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) "+
          "VALUES($1,$2)",[a.f.people[1],a.f.people[0]]);
        await locker.query("COMMIT");
        const done=await pending;
        assert.equal(done.ok,false);
        assert.equal(blocked(done.e),true);
        assert.equal((await secureCounts(pool,a.room)).messages,0);
        await pool.query("DELETE FROM bridge_blocks WHERE blocker_id=$1 AND "+
          "blocked_id=$2",[a.f.people[1],a.f.people[0]]);
        // Unblock cannot itself manufacture old V2 transcript data.
        assert.equal((await secureCounts(pool,a.room)).messages,0);
      }finally{
        await locker.query("ROLLBACK").catch(()=>{});
        locker.release();a.destroy();
      }
    });
    await t.test("AT03-21 failed post-ACK hook rolls back entire first ACK",async()=>{
      const a=await makeAtomic(pool,{testGate:({point})=>{
        if(point==="after_ack")throw Error("ACK_ROLLBACK_TEST_ONLY");
      }});
      try{
        await a.send(a.f.people[0]);
        const who=a.f.people[1],item=(await a.unread(who))[0];
        await assert.rejects(a.ack(who,item.envelopeId,item.presentationProof),blocked);
        const row=(await pool.query(
          "SELECT state,first_acknowledged_at,recovery_token_digest "+
          "FROM bridge_v2_secure_unread WHERE id=$1",[item.envelopeId])).rows[0];
        assert.equal(row.state,"unread");
        assert.equal(row.first_acknowledged_at,null);
        assert.equal(row.recovery_token_digest,null);
        assert.equal((await a.unread(who)).length,1);
      }finally{a.destroy();}
    });
    await t.test("AT03-28 source import fence: no hosted HTTP/PG/start/SSE/outbox wiring",async()=>{
      const {readFile}=await import("node:fs/promises");
      const root=new URL("../../../src/",import.meta.url);
      for(const name of ["http.mjs","postgres.mjs","start.mjs",
        "live.mjs","outbox.mjs","auth.mjs"]){
        const content=await readFile(new URL(name,root),"utf8");
        assert.doesNotMatch(content,/private_atomic_facade\.mjs|private_subject_adapter\.mjs/);
      }
      const atomic=await readFile(new URL("v2/private_atomic_facade.mjs",root),"utf8");
      assert.doesNotMatch(atomic,/\bBRIDGE_DATABASE_URL\b|NEON_DATABASE_URL|RENDER_API_KEY/);
      assert.doesNotMatch(atomic,/\/v1\/conversations|\/v2\/conversations/);
    });
    await t.test("AT03-27 signed LIVE+UNREAD+ACK+recover all same client per call",async()=>{
      const spy=guardedPoolSpy(pool);
      const a=await makeAtomic(pool,{facadePool:spy.pool});
      try{
        const sender=a.f.people[0],recipient=a.f.people[1];
        await a.send(sender);
        const msgs=await a.live(recipient);
        assert.equal(msgs.messages.length,1);
        const item=(await a.unread(recipient))[0];
        const receipt=await a.ack(recipient,item.envelopeId,item.presentationProof);
        await a.recover(recipient,item.envelopeId,receipt.recoveryToken);
        assert.equal(spy.audit.checkout,5);
        assert.equal(spy.audit.begin,5);
        assert.equal(spy.audit.commit,5);
        assert.equal(spy.audit.rollback,0);
        assert.equal(spy.audit.mutex,5);
        assert.equal(spy.audit.clients.size<=5,true);
      }finally{a.destroy();}
    });
  }finally{await pool.end();}
});
