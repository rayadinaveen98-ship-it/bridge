import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {createKeepRepository,KeepDenied} from "../../../src/connections/keep_repository.mjs";
import {createRandomSessionRepository} from "../../../src/sessions/random_repository.mjs";
import {createDirectSessionRepository,DirectSessionDenied} from "../../../src/sessions/direct_repository.mjs";
import {checkDisposable,accounts,randomRoom,sourceText,snapshotRandomContent,
  legacyFixture,legacySnapshot,setRoomDeadline,connected,uuid,hold,single,qty}
  from "./fixtures.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL;
const denies=code=>err=>err instanceof KeepDenied && (!code||err.code===code);
const directDenies=code=>err=>err instanceof DirectSessionDenied&&(!code||err.code===code);
const vote=(engine,f,index,decision="accept")=>engine.vote({
  conversationId:f.room,actorId:f.people[index],decision});
const state=(pool,room)=>single(pool,
  "SELECT kind,state,closed_reason,next_message_sequence,policy_version "+
  "FROM bridge_conversations WHERE id=$1",[room]);

test("V2-05A C05-01..19, 27/28: synthetic-only Keep, concurrency and transcript separation",{
  skip:!url
},async t=>{
  checkDisposable();
  const pool=new pg.Pool({connectionString:url,max:8});
  const keep=createKeepRepository(pool),direct=createDirectSessionRepository(pool);
  try{
    const legacy=await legacyFixture(pool);
    await t.test("C05-01 first Keep pending: no relation, D1, body copy or source mutation",async()=>{
      const f=await randomRoom(pool);
      await sourceText(pool,f);
      const content=await snapshotRandomContent(pool,f.room);
      const before=await single(pool,
        "SELECT last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",[f.room]);
      assert.deepEqual(await vote(keep,f,0),{status:"pending"});
      assert.equal(await qty(pool,"SELECT count(*)::int n FROM bridge_connections "+
        "WHERE source_conversation_id=$1",[f.room]),0);
      assert.equal(await qty(pool,"SELECT count(*)::int n FROM bridge_v2_direct_sessions"),0);
      assert.equal((await state(pool,f.room)).state,"open");
      assert.equal(await snapshotRandomContent(pool,f.room),content);
      assert.deepEqual(await single(pool,
        "SELECT last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",
        [f.room]),before);
    });
    await t.test("C05-02 Keep pending never extends 30-minute random idle clock",async()=>{
      const f=await randomRoom(pool),before=await single(pool,
        "SELECT last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",
        [(await randomRoom(pool)).room]);
      // The observed other-room clock is irrelevant: check this one precisely.
      const self=await single(pool,
        "SELECT last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",[f.room]);
      await vote(keep,f,0);
      const after=await single(pool,
        "SELECT last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",[f.room]);
      assert.deepEqual(after,self);
      assert.ok(before.idle_expires_at);
    });
    await t.test("C05-03/04 withdrawal revokes vote; reconnect requires two CURRENT votes",async()=>{
      const f=await randomRoom(pool);
      assert.equal((await vote(keep,f,0)).status,"pending");
      assert.equal((await vote(keep,f,0,"withdraw")).status,"withdrawn");
      assert.equal((await vote(keep,f,1)).status,"pending");
      assert.equal(await qty(pool,"SELECT count(*)::int n FROM bridge_connections "+
        "WHERE source_conversation_id=$1",[f.room]),0);
      const result=await vote(keep,f,0);
      assert.equal(result.status,"connected");
      assert.ok(result.connectionId&&result.conversationId);
    });
    await t.test("C05-05 simultaneous Keep creates one M and one D1",async()=>{
      const f=await randomRoom(pool);
      const results=await Promise.all([vote(keep,f,0),vote(keep,f,1)]);
      assert.deepEqual(results.map(x=>x.status).sort(),["connected","pending"]);
      const conn=results.find(x=>x.status==="connected");
      assert.equal(await qty(pool,"SELECT count(*)::int n FROM bridge_connections "+
        "WHERE source_conversation_id=$1",[f.room]),1);
      assert.equal(await qty(pool,"SELECT count(*)::int n FROM bridge_v2_direct_sessions "+
        "WHERE connection_id=$1 AND state='open'",[conn.connectionId]),1);
      assert.equal((await state(pool,f.room)).closed_reason,"converted");
    });
    await t.test("C05-06 duplicate Keep accepted after conversion is safe/idempotent",async()=>{
      const f=await connected(pool,keep);
      const a=await vote(keep,f,0);
      const b=await vote(keep,f,1);
      assert.equal(a.status,"connected");
      assert.equal(b.status,"connected");
      assert.equal(a.connectionId,f.connectionId);
      assert.equal(a.conversationId,f.conversationId);
      assert.equal(await qty(pool,"SELECT count(*)::int n FROM bridge_connections "+
        "WHERE id=$1",[f.connectionId]),1);
      await assert.rejects(vote(keep,f,0,"withdraw"),denies("already_connected"));
    });
    await t.test("C05-07 exactly 30:00 Keep rejected in pure random clock; expired SQL refused",async()=>{
      const f=await randomRoom(pool);
      await vote(keep,f,0);
      await setRoomDeadline(pool,f.room,-4000);
      await assert.rejects(vote(keep,f,1),denies("session_expired"));
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_connections WHERE source_conversation_id=$1",
        [f.room]),0);
    });
    await t.test("C05-08 request waits beyond deadline: post-lock DB clock denies Keep",async()=>{
      const f=await randomRoom(pool);
      await vote(keep,f,0);
      await setRoomDeadline(pool,f.room,300);
      const holder=await pool.connect();
      try {
        await holder.query("BEGIN");
        await holder.query("SELECT pg_advisory_xact_lock($1)",[714411]);
        const pending=vote(keep,f,1);
        await hold(550);
        await holder.query("COMMIT");
        await assert.rejects(pending,denies("session_expired"));
        assert.equal(await qty(pool,
          "SELECT count(*)::int n FROM bridge_connections WHERE source_conversation_id=$1",
          [f.room]),0);
      }finally{
        try{await holder.query("ROLLBACK");}catch{/* committed */}
        holder.release();
      }
    });
    await t.test("C05-09 End wins vs second Keep: no relation created",async()=>{
      const f=await randomRoom(pool);
      await vote(keep,f,0);
      await createRandomSessionRepository(pool).close({
        conversationId:f.room,actorId:f.people[0],reason:"ended"});
      await assert.rejects(vote(keep,f,1),denies());
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_connections WHERE source_conversation_id=$1",
        [f.room]),0);
    });
    await t.test("C05-10 expiry wins vs Keep; terminal room stays expired",async()=>{
      const f=await randomRoom(pool);
      await vote(keep,f,0);
      await setRoomDeadline(pool,f.room,-3000);
      await createRandomSessionRepository(pool).close({
        conversationId:f.room,actorId:f.people[0],reason:"expired"});
      await assert.rejects(vote(keep,f,1),denies());
      assert.equal((await state(pool,f.room)).closed_reason,"expired");
    });
    await t.test("C05-11 bilateral block or ineligibility denies conversion",async()=>{
      for(const direction of [0,1]){
        const f=await randomRoom(pool);
        await vote(keep,f,0);
        await pool.query(
          "INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
          [f.people[direction],f.people[1-direction]]);
        await assert.rejects(vote(keep,f,1),denies());
        assert.equal(await qty(pool,
          "SELECT count(*)::int n FROM bridge_connections WHERE source_conversation_id=$1",
          [f.room]),0);
      }
      const f=await randomRoom(pool);
      await vote(keep,f,0);
      await pool.query("UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",
        [f.people[0]]);
      await assert.rejects(vote(keep,f,1),denies());
    });
    await t.test("C05-12 outsider cannot vote or withdraw guessed room ID",async()=>{
      const f=await randomRoom(pool),id=(await accounts(pool,1))[0];
      await assert.rejects(keep.vote({conversationId:f.room,actorId:id,
        decision:"accept"}),denies());
      await assert.rejects(keep.vote({conversationId:f.room,actorId:id,
        decision:"withdraw"}),denies());
      await assert.rejects(keep.vote({conversationId:uuid(),actorId:id,
        decision:"accept"}),denies());
    });
    await t.test("C05-13 malformed marker or legacy room cannot convert",async()=>{
      await assert.rejects(vote(keep,legacy,0),denies());
      const f=await randomRoom(pool);
      await pool.query("UPDATE bridge_conversations SET policy_version=NULL WHERE id=$1",
        [f.room]);
      await assert.rejects(vote(keep,f,0),denies());
      assert.equal((await state(pool,f.room)).kind,"random");
    });
    await t.test("C05-14/15 original stranger text immutable; D1 clean, fresh sequence",async()=>{
      const f=await randomRoom(pool);
      await sourceText(pool,f,2);
      const before=await snapshotRandomContent(pool,f.room);
      const {connectionId,conversationId}=await connected(pool,keep,f);
      assert.notEqual(conversationId,f.room);
      const old=await state(pool,f.room),fresh=await state(pool,conversationId);
      assert.equal(old.kind,"random");assert.equal(old.state,"closed");
      assert.equal(old.closed_reason,"converted");assert.equal(old.next_message_sequence,"3");
      assert.equal(fresh.kind,"connection");assert.equal(fresh.state,"open");
      assert.equal(fresh.next_message_sequence,"1");
      assert.equal(await snapshotRandomContent(pool,f.room),before);
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",
        [conversationId]),0);
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_history_items WHERE connection_id=$1",
        [connectionId]),0);
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_unread_deliveries WHERE connection_id=$1",
        [connectionId]),0);
    });
    await t.test("C05-16 relationship source pointer always original random ID",async()=>{
      const f=await connected(pool,keep);
      const a=await single(pool,
        "SELECT source_conversation_id FROM bridge_connections WHERE id=$1",
        [f.connectionId]);
      assert.equal(a.source_conversation_id,f.room);
      assert.notEqual(a.source_conversation_id,f.conversationId);
    });
    await t.test("C05-17 match ended; own pair slots and queues released only",async()=>{
      const f=await randomRoom(pool);
      const unrelated=await randomRoom(pool);
      const done=await connected(pool,keep,f);
      assert.equal((await single(pool,
        "SELECT state FROM bridge_match_sessions WHERE id=$1",[f.matchId])).state,"ended");
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",
        [f.matchId]),0);
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_match_queue WHERE match_session_id=$1 "+
        "AND state='cancelled'",[f.matchId]),2);
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",
        [unrelated.matchId]),2);
      assert.ok(done.connectionId);
    });
    await t.test("C05-18 replay post-conversion returns only safe IDs, not source/body",async()=>{
      const f=await randomRoom(pool);
      await sourceText(pool,f);
      const a=await connected(pool,keep,f);
      const replay=await vote(keep,f,1);
      assert.deepEqual(Object.keys(replay).sort(),
        ["connectionId","conversationId","sourceConversationId","status"]);
      assert.equal(replay.connectionId,a.connectionId);
      assert.equal(replay.sourceConversationId,null);
      assert.equal(JSON.stringify(replay).includes("v205 original random"),false);
    });
    await t.test("C05-19 second random match same pair reuses active M without rewriting source",async()=>{
      const f=await connected(pool,keep);
      const other=await randomRoom(pool,{people:f.people});
      await vote(keep,other,0);
      const result=await vote(keep,other,1);
      assert.equal(result.connectionId,f.connectionId);
      assert.equal(result.conversationId,f.conversationId);
      assert.equal((await single(pool,
        "SELECT source_conversation_id FROM bridge_connections WHERE id=$1",
        [f.connectionId])).source_conversation_id,f.room);
      assert.equal((await state(pool,other.room)).closed_reason,"converted");
    });
    await t.test("C05-27 5 injected conversion failures rollback votes, relation, source, slots",async()=>{
      const f=await randomRoom(pool);
      await vote(keep,f,0);
      const previous=await single(pool,
        "SELECT voter_id,status FROM bridge_connection_votes WHERE conversation_id=$1",[f.room]);
      assert.equal(previous.status,"accepted");
      for(const at of ["after_vote","after_connection","after_source_close",
                       "after_slots","after_direct"]){
        const faulty=createKeepRepository(pool,{failureHook:async phase=>{
          if(phase===at)throw Error("injected-"+phase);
        }});
        await assert.rejects(vote(faulty,f,1),/injected-/);
        assert.equal((await state(pool,f.room)).state,"open");
        assert.equal(await qty(pool,
          "SELECT count(*)::int n FROM bridge_connections WHERE source_conversation_id=$1",
          [f.room]),0);
        assert.equal(await qty(pool,
          "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",
          [f.matchId]),2);
        assert.equal(await qty(pool,
          "SELECT count(*)::int n FROM bridge_connection_votes WHERE "+
          "conversation_id=$1 AND status='accepted'",[f.room]),1);
      }
      assert.equal((await vote(keep,f,1)).status,"connected");
    });
    await t.test("C05-28 protected legacy 4-message fixture and 2 slots unchanged",async()=>{
      assert.equal(await legacySnapshot(pool,legacy),legacy.before);
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",
        [legacy.room]),4);
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_active_match_slots WHERE match_session_id=$1",
        [legacy.matchId]),2);
    });
    await t.test("C05 negative malformed Keep cannot mutate random or create direct",async()=>{
      const f=await randomRoom(pool);
      await assert.rejects(vote(keep,f,0,"ignore"),denies("invalid_keep_decision"));
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_connection_votes WHERE conversation_id=$1",
        [f.room]),0);
      assert.equal((await state(pool,f.room)).state,"open");
    });
    await t.test("C05 withdraw-vs-second-Keep race cannot create a one-sided relation",async()=>{
      const f=await randomRoom(pool);
      await vote(keep,f,0);
      const results=await Promise.allSettled([vote(keep,f,0,"withdraw"),vote(keep,f,1)]);
      const active=await qty(pool,"SELECT count(*)::int n FROM bridge_connection_votes "+
        "WHERE conversation_id=$1 AND status='accepted'",[f.room]);
      const relations=await qty(pool,"SELECT count(*)::int n FROM bridge_connections "+
        "WHERE source_conversation_id=$1",[f.room]);
      if(relations===0)assert.ok(active<2);
      else{
        assert.equal(relations,1);
        assert.equal((await state(pool,f.room)).closed_reason,"converted");
        assert.equal(results.filter(x=>x.status==="rejected").length,1);
      }
    });
  }finally{await pool.end();}
});
