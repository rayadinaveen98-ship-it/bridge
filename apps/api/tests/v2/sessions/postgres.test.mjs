import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import pg from "pg";
import {assertDisposableConnection} from "../migrations/runner.mjs";
import {createRandomSessionRepository,RandomSessionDenied}
  from "../../../src/sessions/random_repository.mjs";
import {RANDOM_IDLE_MS} from "../../../src/sessions/clock.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL,ack=process.env.BRIDGE_TEST_MIGRATION_ACK;
const uuid=()=>randomUUID();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function denied(code) {
 return e=>e instanceof RandomSessionDenied && (!code||e.code===code);
}
async function one(pool,sql,args=[]){return (await pool.query(sql,args)).rows[0];}
async function scalar(pool,sql,args=[]){return Number((await one(pool,sql,args)).n);}
async function seedAccounts(pool,num=2){
 const people=Array.from({length:num},()=>uuid()).sort();
 for(const id of people)await pool.query(
   "INSERT INTO bridge_accounts(id,auth_subject,status,age_verified_at,safety_eligible) "+
   "VALUES($1,$2,'active',clock_timestamp(),true)",[id,"v2-04a-test|"+id]);
 return people;
}
async function seedMatch(pool,members,{withQueue=false}={}){
 const matchId=uuid();
 await pool.query(
   "INSERT INTO bridge_supported_languages(code,display_name,moderation_ready) "+
   "VALUES('en','English',true) ON CONFLICT DO NOTHING");
 await pool.query(
   "INSERT INTO bridge_match_sessions(id,member_low,member_high,language_code,state,"+
   "reserved_at,lease_expires_at,activated_at) VALUES($1,$2,$3,'en','active',"+
   "clock_timestamp()-interval '5 minutes',clock_timestamp()-interval '4 minutes',"+
   "clock_timestamp()-interval '5 minutes')",[matchId,...members]);
 for(const person of members)await pool.query(
   "INSERT INTO bridge_active_match_slots(account_id,match_session_id) VALUES($1,$2)",
   [person,matchId]);
 if(withQueue)for(const person of members)await pool.query(
   "INSERT INTO bridge_match_queue(account_id,request_id,state,expires_at,match_session_id)"+
   " VALUES($1,$2,'reserved',clock_timestamp()+interval '2 minutes',$3)",
   [person,uuid(),matchId]);
 return matchId;
}
async function setDeadline(pool,roomId,deltaMs){
 // TEST TIME TRAVEL of synthetic V2 row only. No live database connection.
 const last=new Date(Date.now()-RANDOM_IDLE_MS+deltaMs);
 await pool.query("UPDATE bridge_conversations SET last_accepted_at=$2,"+
  "idle_expires_at=($2::timestamptz)+interval '30 minutes' WHERE id=$1",[roomId,last]);
}
async function digestLegacy(pool,legacy){
 const arrays=[];
 for(const [sql,args] of [
   ["SELECT id,kind,state,last_accepted_at,idle_expires_at,legacy_qa FROM bridge_conversations WHERE id=$1",[legacy.room]],
   ["SELECT id,body,sequence_number FROM bridge_messages WHERE conversation_id=$1 ORDER BY sequence_number",[legacy.room]],
   ["SELECT account_id,match_session_id FROM bridge_active_match_slots WHERE match_session_id=$1 ORDER BY account_id",[legacy.match]]
 ])arrays.push((await pool.query(sql,args)).rows);
 return createHash("sha256").update(JSON.stringify(arrays)).digest("hex");
}

test("V2-04A R04-01–24: real disposable PostgreSQL state and race rehearsal",{
 skip:!url
},async t=>{
 // A hard, explicit loopback guard BEFORE any SQL/client creation.
 assertDisposableConnection(url,ack);
 const pool=new pg.Pool({connectionString:url,max:7});
 const repo=createRandomSessionRepository(pool);
 let legacyHash,legacy,actors,roomId,matchId;
 try{
  await t.test("R04-17 legacy open chat/2 testers/4 bodies/2 slots never auto-upgraded",async()=>{
    const people=await seedAccounts(pool);
    const match=await seedMatch(pool,people);
    const room=uuid();
    await pool.query(
      "INSERT INTO bridge_conversations(id,match_session_id,kind,state,next_message_sequence)"+
      " VALUES($1,$2,'random','open',5)",[room,match]);
    for(const p of people)await pool.query(
      "INSERT INTO bridge_conversation_participants(conversation_id,account_id) VALUES($1,$2)",
      [room,p]);
    for(let i=0;i<4;i++)await pool.query(
      "INSERT INTO bridge_messages(conversation_id,sender_id,client_message_id,sequence_number,body) "+
      "VALUES($1,$2,$3,$4,$5)",[room,people[i%2],uuid(),i+1,"R04 synthetic legacy "+(i+1)]);
    legacy={people,match,room};
    legacyHash=await digestLegacy(pool,legacy);
    await assert.rejects(repo.current({conversationId:room,actorId:people[0]}),denied());
    await assert.rejects(repo.close({conversationId:room,actorId:people[0]}),denied());
    assert.equal((await one(pool,"SELECT state FROM bridge_conversations WHERE id=$1",[room])).state,"open");
  });

  await t.test("R04-01 initialize V2-only room and DB clocks atomically",async()=>{
    actors=await seedAccounts(pool);
    matchId=await seedMatch(pool,actors,{withQueue:true});
    const r=await repo.activate({matchId});
    roomId=r.id;
    const conv=await one(pool,
      "SELECT kind,state,policy_version,v2_session_role,legacy_qa,"+
      "last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",[roomId]);
    const match=await one(pool,
      "SELECT activated_at FROM bridge_match_sessions WHERE id=$1",[matchId]);
    assert.equal(conv.kind,"random");assert.equal(conv.state,"open");
    assert.equal(conv.policy_version,"bridge-v2");
    assert.equal(conv.v2_session_role,"random");assert.equal(conv.legacy_qa,false);
    assert.equal(+conv.idle_expires_at-(+conv.last_accepted_at),RANDOM_IDLE_MS);
    assert.equal(+match.activated_at,+conv.last_accepted_at);
    assert.equal((await repo.current({conversationId:roomId,actorId:actors[0]})).id,roomId);
    await assert.rejects(repo.activate({matchId}),denied("session_exists"));
  });

  await t.test("R04-02/07/08 initial Resume/Keep/read do not extend clock",async()=>{
    const before=await one(pool,
      "SELECT last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",[roomId]);
    for(const actorId of actors){
      assert.equal((await repo.current({conversationId:roomId,actorId})).state,"active");
      assert.equal((await repo.keepAllowed({conversationId:roomId,actorId})).allowed,true);
    }
    const after=await one(pool,
      "SELECT last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",[roomId]);
    assert.deepEqual(after,before);
  });

  await t.test("R04-04/05/06 new accept, idempotency, sequence, outbox and clock",async()=>{
    const key=uuid();
    await setDeadline(pool,roomId,10000);
    const before=await one(pool,
      "SELECT last_accepted_at,idle_expires_at,next_message_sequence FROM bridge_conversations WHERE id=$1",
      [roomId]);
    const accepted=await repo.acceptUnique({
      conversationId:roomId,actorId:actors[0],clientMessageId:key,body:"Synthetic new V2 message"
    });
    assert.equal(accepted.status,"accepted");assert.equal(accepted.sequenceNumber,1);
    const after=await one(pool,
      "SELECT last_accepted_at,idle_expires_at,next_message_sequence FROM bridge_conversations WHERE id=$1",
      [roomId]);
    assert.ok(+after.last_accepted_at>+before.last_accepted_at);
    assert.equal(+after.idle_expires_at-(+after.last_accepted_at),RANDOM_IDLE_MS);
    const again=await repo.acceptUnique({
      conversationId:roomId,actorId:actors[0],clientMessageId:key,body:"Synthetic new V2 message"
    });
    assert.equal(again.status,"duplicate");assert.equal(again.id,accepted.id);
    assert.deepEqual(await one(pool,"SELECT last_accepted_at,idle_expires_at,next_message_sequence "+
      "FROM bridge_conversations WHERE id=$1",[roomId]),after);
    await assert.rejects(repo.acceptUnique({
      conversationId:roomId,actorId:actors[0],clientMessageId:key,body:"changed body"
    }),denied("idempotency_conflict"));
    assert.equal(await scalar(pool,
      "SELECT count(*)::int n FROM bridge_event_outbox WHERE event_key=$1",["message:"+accepted.id]),1);
    assert.equal((await one(pool,
      "SELECT payload FROM bridge_event_outbox WHERE event_key=$1",["message:"+accepted.id])).payload.body,
      undefined);
  });

  await t.test("R04-19/20 outsider, block and suspended peer are denied",async()=>{
    const outsider=(await seedAccounts(pool,1))[0];
    await assert.rejects(repo.current({conversationId:roomId,actorId:outsider}),denied());
    await assert.rejects(repo.acceptUnique({
      conversationId:roomId,actorId:outsider,clientMessageId:uuid(),body:"wrong"
    }),denied());
    await pool.query("UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",[actors[1]]);
    await assert.rejects(repo.current({conversationId:roomId,actorId:actors[0]}),denied());
    await pool.query("UPDATE bridge_accounts SET safety_eligible=true WHERE id=$1",[actors[1]]);
    await pool.query(
      "INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",[actors[1],actors[0]]);
    await assert.rejects(repo.keepAllowed({conversationId:roomId,actorId:actors[0]}),denied());
    await pool.query("DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",
      [actors[1],actors[0]]);
    assert.equal((await repo.current({conversationId:roomId,actorId:actors[0]})).state,"active");
  });

  await t.test("R04-03/09/13/21 expired without sweeper: read, send, Keep deny",async()=>{
    await setDeadline(pool,roomId,-1000);
    await assert.rejects(repo.current({conversationId:roomId,actorId:actors[0]}),
      denied("session_expired"));
    await assert.rejects(repo.keepAllowed({conversationId:roomId,actorId:actors[1]}),
      denied("session_expired"));
    await assert.rejects(repo.acceptUnique({
      conversationId:roomId,actorId:actors[0],clientMessageId:uuid(),body:"too late"
    }),denied("session_expired"));
    const result=await repo.close({conversationId:roomId,actorId:actors[0],reason:"expired"});
    assert.deepEqual(result,{status:"closed",reason:"expired"});
    assert.equal((await one(pool,"SELECT state,closed_reason FROM bridge_conversations WHERE id=$1",
      [roomId])).closed_reason,"expired");
    assert.equal((await one(pool,"SELECT state FROM bridge_match_sessions WHERE id=$1",[matchId])).state,"expired");
    assert.equal(await scalar(pool,
      "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",[matchId]),0);
    assert.equal(await scalar(pool,
      "SELECT count(*)::int n FROM bridge_match_queue WHERE match_session_id=$1 AND state='expired'",
      [matchId]),2);
    await assert.rejects(repo.acceptUnique({
      conversationId:roomId,actorId:actors[0],clientMessageId:uuid(),body:"closed"
    }),denied());
  });

  await t.test("R04-10/11/16 End is idempotent; associated queues only",async()=>{
    const pair=await seedAccounts(pool),match=await seedMatch(pool,pair,{withQueue:true});
    const room=(await repo.activate({matchId:match})).id;
    const other=(await seedAccounts(pool,1))[0];
    await pool.query(
      "INSERT INTO bridge_match_queue(account_id,request_id,state,expires_at) "+
      "VALUES($1,$2,'waiting',clock_timestamp()+interval '120 seconds')",[other,uuid()]);
    const closed=await repo.close({conversationId:room,actorId:pair[0],reason:"ended"});
    assert.deepEqual(closed,{status:"closed",reason:"ended"});
    assert.deepEqual(await repo.close({conversationId:room,actorId:pair[1],reason:"expired"}),
      {status:"already_closed",reason:"ended"});
    assert.equal(await scalar(pool,
      "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",[match]),0);
    assert.equal(await scalar(pool,
      "SELECT count(*)::int n FROM bridge_match_queue WHERE match_session_id=$1 AND state='cancelled'",
      [match]),2);
    assert.equal((await one(pool,
      "SELECT state FROM bridge_match_queue WHERE account_id=$1",[other])).state,"waiting");
    assert.equal((await one(pool,
      "SELECT state FROM bridge_conversations WHERE id=$1",[room])).state,"closed");
  });

  await t.test("R04-12 lock delayed beyond expiry: time sampled AFTER lock",async()=>{
    const pair=await seedAccounts(pool),match=await seedMatch(pool,pair);
    const room=(await repo.activate({matchId:match})).id;
    await setDeadline(pool,room,300);
    const hold=await pool.connect();
    try {
      await hold.query("BEGIN");
      await hold.query("SELECT pg_advisory_xact_lock($1)",[714411]);
      // Request begins BEFORE expiry but cannot acquire the lock until AFTER.
      const pending=repo.acceptUnique({
        conversationId:room,actorId:pair[0],clientMessageId:uuid(),body:"late-lock"
      });
      await delay(550);
      await hold.query("COMMIT");
      await assert.rejects(pending,denied("session_expired"));
      assert.equal(await scalar(pool,
        "SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",[room]),0);
      const ended=await repo.close({conversationId:room,actorId:pair[0],reason:"expired"});
      assert.equal(ended.reason,"expired");
    } finally {
      try {await hold.query("ROLLBACK");} catch {/* prior COMMIT */}
      hold.release();
    }
  });

  await t.test("R04-15 competing End and Expire cannot duplicate cleanup or rewrite reason",async()=>{
    const pair=await seedAccounts(pool),match=await seedMatch(pool,pair);
    const room=(await repo.activate({matchId:match})).id;
    await setDeadline(pool,room,-2000);
    const outcomes=await Promise.all([
      repo.close({conversationId:room,actorId:pair[0],reason:"ended"}),
      repo.close({conversationId:room,actorId:pair[1],reason:"expired"})
    ]);
    assert.deepEqual(outcomes.map(x=>x.status).sort(),["already_closed","closed"]);
    assert.ok(outcomes.every(x=>x.reason==="expired"));
    assert.equal(await scalar(pool,
      "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",[match]),0);
  });

  await t.test("R04-14/20 explicit safety closure is terminal, never restarted",async()=>{
    const pair=await seedAccounts(pool),match=await seedMatch(pool,pair);
    const room=(await repo.activate({matchId:match})).id;
    await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
      [pair[0],pair[1]]);
    await assert.rejects(repo.current({conversationId:room,actorId:pair[1]}),denied());
    const closed=await repo.close({conversationId:room,actorId:pair[0],reason:"safety_closed"});
    assert.equal(closed.reason,"safety_closed");
    assert.equal((await repo.close({conversationId:room,actorId:pair[1],reason:"expired"})).reason,
      "safety_closed");
  });

  await t.test("R04-22 injected failure at each closure step causes full DB rollback",async()=>{
    const pair=await seedAccounts(pool),match=await seedMatch(pool,pair,{withQueue:true});
    const room=(await repo.activate({matchId:match})).id;
    for(const stage of ["closed_room","closed_match","released_slots","cleaned_queue"]){
      const faulty=createRandomSessionRepository(pool,{
        failureHook:async at=>{if(at===stage)throw Error("synthetic failure "+stage);}
      });
      await assert.rejects(faulty.close({conversationId:room,actorId:pair[0]}),
        /synthetic failure/);
      assert.equal((await one(pool,
        "SELECT state,closed_reason FROM bridge_conversations WHERE id=$1",[room])).state,"open");
      assert.equal((await one(pool,"SELECT state FROM bridge_match_sessions WHERE id=$1",
        [match])).state,"active");
      assert.equal(await scalar(pool,
        "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",
        [match]),2);
      assert.equal(await scalar(pool,
        "SELECT count(*)::int n FROM bridge_match_queue WHERE match_session_id=$1 AND state='reserved'",
        [match]),2);
    }
    assert.equal((await repo.close({conversationId:room,actorId:pair[0]})).reason,"ended");
  });

  await t.test("R04-17 legacy fixture unchanged after all V2 transactions",async()=>{
    assert.equal(await digestLegacy(pool,legacy),legacyHash);
    assert.equal(await scalar(pool,
      "SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",[legacy.room]),4);
    assert.equal(await scalar(pool,
      "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",
      [legacy.match]),2);
    assert.equal((await one(pool,"SELECT state FROM bridge_conversations WHERE id=$1",
      [legacy.room])).state,"open");
  });
 } finally {await pool.end();}
});
