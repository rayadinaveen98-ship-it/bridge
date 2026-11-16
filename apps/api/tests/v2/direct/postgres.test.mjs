import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {createKeepRepository} from "../../../src/connections/keep_repository.mjs";
import {createDirectSessionRepository,DirectSessionDenied}
  from "../../../src/sessions/direct_repository.mjs";
import {checkDisposable,connected,randomRoom,sourceText,snapshotRandomContent,
  setRoomDeadline,accounts,uuid,single,qty} from "../connections/fixtures.mjs";

const url=process.env.BRIDGE_TEST_DATABASE_URL;
const isDenied=e=>e instanceof DirectSessionDenied;
const rel=(pool,id)=>single(pool,
  "SELECT id,ended_at,source_conversation_id FROM bridge_connections WHERE id=$1",[id]);
const direct=(pool,id)=>single(pool,
  "SELECT c.id,c.kind,c.state,c.v2_session_role,c.next_message_sequence,c.connection_id,"+
  "c.idle_expires_at,s.state AS segment_state FROM bridge_conversations c "+
  "JOIN bridge_v2_direct_sessions s ON s.conversation_id=c.id WHERE c.id=$1",[id]);

test("V2-05A C05-20..26: FREE direct segment lifecycle and scope isolation",{
 skip:!url
},async t=>{
 checkDisposable();
 const pool=new pg.Pool({connectionString:url,max:8});
 const keep=createKeepRepository(pool),sessions=createDirectSessionRepository(pool);
 try {
  await t.test("C05-20 two concurrent open calls resume one active direct",async()=>{
    const f=await connected(pool,keep);
    const res=await Promise.all([
      sessions.open({connectionId:f.connectionId,actorId:f.people[0]}),
      sessions.open({connectionId:f.connectionId,actorId:f.people[1]})
    ]);
    assert.equal(res[0].conversationId,f.conversationId);
    assert.equal(res[1].conversationId,f.conversationId);
    assert.equal(res[0].status,"resumed");
    assert.equal(res[1].status,"resumed");
    assert.equal(await qty(pool,"SELECT count(*)::int n FROM bridge_v2_direct_sessions "+
      "WHERE connection_id=$1 AND state='open'",[f.connectionId]),1);
  });
  await t.test("C05-21 current direct goes unavailable after idle cutoff, relation remains active",async()=>{
    const f=await connected(pool,keep);
    assert.equal((await sessions.current({
      conversationId:f.conversationId,actorId:f.people[0]
    })).connectionId,f.connectionId);
    await setRoomDeadline(pool,f.conversationId,-5000);
    await assert.rejects(sessions.current({
      conversationId:f.conversationId,actorId:f.people[1]
    }),isDenied);
    assert.equal((await rel(pool,f.connectionId)).ended_at,null);
  });
  await t.test("C05-22 Ending direct segment never unmatches the relationship",async()=>{
    const f=await connected(pool,keep);
    const result=await sessions.end({conversationId:f.conversationId,actorId:f.people[0]});
    assert.equal(result.reason,"ended");
    assert.equal((await direct(pool,f.conversationId)).segment_state,"closed");
    assert.equal((await rel(pool,f.connectionId)).ended_at,null);
    assert.deepEqual(await sessions.end({
      conversationId:f.conversationId,actorId:f.people[1]
    }),{status:"already_closed"});
  });
  await t.test("C05-23 D2 after D1 ends has new ID, sequence 1, FREE without archive",async()=>{
    const f=await connected(pool,keep);
    await sessions.end({conversationId:f.conversationId,actorId:f.people[1]});
    const newSession=await sessions.open({
      connectionId:f.connectionId,actorId:f.people[0]});
    assert.equal(newSession.status,"created");
    assert.notEqual(newSession.conversationId,f.conversationId);
    assert.equal((await direct(pool,newSession.conversationId)).next_message_sequence,"1");
    assert.equal(await qty(pool,
      "SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",
      [newSession.conversationId]),0);
    assert.equal(await qty(pool,
      "SELECT count(*)::int n FROM bridge_history_items WHERE connection_id=$1",
      [f.connectionId]),0);
    assert.equal((await rel(pool,f.connectionId)).ended_at,null);
    assert.equal((await direct(pool,f.conversationId)).segment_state,"closed");
  });
  await t.test("C05-23 timed-out OPEN stale D1 cleaned on-demand, no sweeper",async()=>{
    const f=await connected(pool,keep);
    await setRoomDeadline(pool,f.conversationId,-1000);
    const newSession=await sessions.open({
      connectionId:f.connectionId,actorId:f.people[0]});
    assert.equal(newSession.status,"created");
    assert.notEqual(newSession.conversationId,f.conversationId);
    assert.equal((await direct(pool,f.conversationId)).state,"closed");
    assert.equal((await direct(pool,f.conversationId)).segment_state,"closed");
    assert.equal((await direct(pool,newSession.conversationId)).state,"open");
    assert.equal((await rel(pool,f.connectionId)).ended_at,null);
    assert.equal(await qty(pool,
      "SELECT count(*)::int n FROM bridge_v2_direct_sessions WHERE connection_id=$1 AND state='open'",
      [f.connectionId]),1);
  });
  await t.test("C05-20 parallel fresh D2 creates exactly one new segment",async()=>{
    const f=await connected(pool,keep);
    await sessions.end({conversationId:f.conversationId,actorId:f.people[0]});
    const results=await Promise.all([
      sessions.open({connectionId:f.connectionId,actorId:f.people[0]}),
      sessions.open({connectionId:f.connectionId,actorId:f.people[1]})
    ]);
    assert.equal(results[0].conversationId,results[1].conversationId);
    assert.deepEqual(results.map(x=>x.status).sort(),["created","resumed"]);
    assert.equal(await qty(pool,
      "SELECT count(*)::int n FROM bridge_v2_direct_sessions WHERE connection_id=$1 AND state='open'",
      [f.connectionId]),1);
  });
  await t.test("C05-24 one-sided block denies BOTH direct resume and open",async()=>{
    const f=await connected(pool,keep);
    await pool.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
      [f.people[1],f.people[0]]);
    await assert.rejects(sessions.current({
      conversationId:f.conversationId,actorId:f.people[0]
    }),isDenied);
    await assert.rejects(sessions.open({
      connectionId:f.connectionId,actorId:f.people[1]
    }),isDenied);
    const ended=await sessions.endRelationship({
      connectionId:f.connectionId,actorId:f.people[0]});
    assert.equal(ended.status,"ended");
    await pool.query(
      "DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",
      [f.people[1],f.people[0]]);
    await assert.rejects(sessions.open({
      connectionId:f.connectionId,actorId:f.people[0]
    }),isDenied);
    assert.ok((await rel(pool,f.connectionId)).ended_at);
    assert.equal((await direct(pool,f.conversationId)).state,"closed");
  });
  await t.test("C05-24 explicit unmatch revokes contact but not the source transcript",async()=>{
    const f=await randomRoom(pool);
    await sourceText(pool,f);
    const hash=await snapshotRandomContent(pool,f.room);
    const connectedResult=await connected(pool,keep,f);
    assert.equal((await sessions.endRelationship({
      connectionId:connectedResult.connectionId,actorId:f.people[0]
    })).status,"ended");
    assert.deepEqual(await sessions.endRelationship({
      connectionId:connectedResult.connectionId,actorId:f.people[1]
    }),{status:"already_ended"});
    await assert.rejects(sessions.current({
      conversationId:connectedResult.conversationId,actorId:f.people[1]
    }),isDenied);
    assert.equal(await snapshotRandomContent(pool,f.room),hash);
  });
  await t.test("C05-25 suspended/peer-ineligible member prevents direct reopen",async()=>{
    const f=await connected(pool,keep);
    await pool.query("UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",
      [f.people[1]]);
    await assert.rejects(sessions.current({
      conversationId:f.conversationId,actorId:f.people[0]
    }),isDenied);
    await assert.rejects(sessions.open({
      connectionId:f.connectionId,actorId:f.people[1]
    }),isDenied);
    // End contact remains a free authenticated safety/right action.
    assert.equal((await sessions.endRelationship({
      connectionId:f.connectionId,actorId:f.people[0]
    })).status,"ended");
  });
  await t.test("C05-26 D1 junction, 2 members, connection and random source align",async()=>{
    const f=await connected(pool,keep);
    const room=await direct(pool,f.conversationId);
    assert.equal(room.kind,"connection");
    assert.equal(room.v2_session_role,"direct");
    assert.equal(room.connection_id,f.connectionId);
    assert.equal(room.segment_state,"open");
    const p=await pool.query("SELECT account_id FROM bridge_conversation_participants "+
      "WHERE conversation_id=$1 ORDER BY account_id",[f.conversationId]);
    assert.deepEqual(p.rows.map(r=>r.account_id),f.people);
    assert.equal((await rel(pool,f.connectionId)).source_conversation_id,f.room);
  });
  await t.test("C05-26 wrong member/guessed direct ID cannot read or close",async()=>{
    const f=await connected(pool,keep),attacker=(await accounts(pool,1))[0];
    for(const call of [
      ()=>sessions.current({conversationId:f.conversationId,actorId:attacker}),
      ()=>sessions.end({conversationId:f.conversationId,actorId:attacker}),
      ()=>sessions.open({connectionId:f.connectionId,actorId:attacker}),
      ()=>sessions.current({conversationId:uuid(),actorId:f.people[0]})
    ])await assert.rejects(call(),isDenied);
  });
  await t.test("C05-22 original closed D1 never becomes browsable via fresh-open",async()=>{
    const f=await connected(pool,keep);
    await sessions.end({conversationId:f.conversationId,actorId:f.people[0]});
    await sessions.open({connectionId:f.connectionId,actorId:f.people[1]});
    await assert.rejects(sessions.current({
      conversationId:f.conversationId,actorId:f.people[0]
    }),isDenied);
  });
 }finally{await pool.end();}
});
