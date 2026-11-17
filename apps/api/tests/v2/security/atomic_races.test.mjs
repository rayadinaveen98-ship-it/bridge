/**
 * B3c-2R3B-1 adversarial concurrency helpers.
 * ALL writer transactions here cooperate with global mutex 714411.
 * Legacy V1 writers are explicitly NOT covered and remain a HOSTED HOLD.
 */
import assert from "node:assert/strict";
import {randomUUID,denied} from "./atomic_pg18_fixture.mjs";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function raceCases(t,lab,entry){
  const {a,b,ab}=lab.people;
  const req=(actor,operation,targetId,extra={})=>({
    authorization:lab.token(actor),operation,targetId,...extra
  });
  async function removeBlock(){
    await lab.writer(c=>c.query("DELETE FROM bridge_blocks WHERE "+
      "blocker_id=$1 AND blocked_id=$2",[b,a]));
  }
  await t.test("R3B-30 Block writer wins mutex before pending SEND: deny and zero write",async()=>{
    const hold=await lab.pool.connect();
    const initial=(await lab.admin.query("SELECT count(*)::int n FROM bridge_v2_secure_messages")).rows[0].n;
    try {
      await hold.query("BEGIN");
      await hold.query("SELECT pg_advisory_xact_lock($1)",[714411]);
      const pending=lab.guard.dispatch(req(a,"send",ab.roomId,{clientMessageId:randomUUID()}))
        .then(result=>({ok:true,result}),error=>({ok:false,error}));
      await sleep(70);
      await hold.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",[b,a]);
      await hold.query("COMMIT");
      const x=await pending;
      assert.equal(x.ok,false);
      assert.equal(denied(x.error),true);
      assert.equal((await lab.admin.query(
        "SELECT count(*)::int n FROM bridge_v2_secure_messages")).rows[0].n,initial);
    }finally{
      await hold.query("ROLLBACK").catch(()=>{});
      hold.release();
      await removeBlock();
    }
  });
  await t.test("R3B-31 SEND wins mutex before Block: writer waits; later LIVE denied",async()=>{
    let entered,release;
    const enteredPromise=new Promise(r=>{entered=r});
    const wait=new Promise(r=>{release=r});
    const guarded=lab.createGuard(async({point})=>{
      if(point==="after_operation_before_final_token"){entered();await wait;}
    });
    let writer;
    try{
      const queued=guarded.dispatch(req(a,"send",ab.roomId,{clientMessageId:randomUUID()}));
      await enteredPromise;
      let wrote=false;
      writer=lab.writer(async c=>{
        await c.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",[b,a]);
        wrote=true;
      });
      await sleep(85);
      assert.equal(wrote,false,"Block writer must not commit while signed SEND transaction is held");
      release();
      const accepted=await queued;
      assert.equal(typeof accepted.id,"string");
      await writer;
      assert.equal(wrote,true);
      await assert.rejects(lab.guard.dispatch(req(a,"live",ab.roomId)),denied);
      await assert.rejects(lab.guard.dispatch(req(b,"live",ab.roomId)),denied);
    }finally{
      release();await writer?.catch(()=>{});
      await removeBlock();
    }
  });
  await t.test("R3B-32 status writer wins before queued LIVE: no stale read",async()=>{
    const c=await lab.pool.connect();
    try{
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock($1)",[714411]);
      const pending=lab.guard.dispatch(req(a,"live",ab.roomId))
        .then(result=>({ok:true,result}),error=>({ok:false,error}));
      await sleep(65);
      await c.query("UPDATE bridge_accounts SET status='restricted' WHERE id=$1",[b]);
      await c.query("COMMIT");
      const r=await pending;
      assert.equal(r.ok,false);assert.equal(denied(r.error),true);
    }finally{
      await c.query("ROLLBACK").catch(()=>{});c.release();
      await lab.writer(db=>db.query("UPDATE bridge_accounts SET status='active' WHERE id=$1",[b]));
    }
  });
  await t.test("R3B-34 participant exit writer wins over queued LIVE: deny",async()=>{
    const c=await lab.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock($1)",[714411]);
      const pending=lab.guard.dispatch(req(a,"live",ab.roomId))
        .then(result=>({ok:true,result}),error=>({ok:false,error}));
      await sleep(60);
      await c.query("UPDATE bridge_conversation_participants "+
        "SET left_at=clock_timestamp() WHERE conversation_id=$1 AND account_id=$2",
        [ab.roomId,b]);
      await c.query("COMMIT");
      const result=await pending;
      assert.equal(result.ok,false);assert.equal(denied(result.error),true);
    }finally{
      await c.query("ROLLBACK").catch(()=>{});c.release();
      await lab.writer(db=>db.query(
        "UPDATE bridge_conversation_participants SET left_at=NULL "+
        "WHERE conversation_id=$1 AND account_id=$2",[ab.roomId,b]));
    }
  });
  await t.test("R3B-35 mutual Keep ends before recovery: deny despite valid token",async()=>{
    if(!entry?.recoveryToken||!entry?.envelopeId)return;
    const c=await lab.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock($1)",[714411]);
      const pending=lab.guard.dispatch(req(b,"recover",entry.envelopeId,{
        recoveryToken:entry.recoveryToken
      })).then(result=>({ok:true,result}),error=>({ok:false,error}));
      await sleep(65);
      await c.query("UPDATE bridge_connections SET ended_at=clock_timestamp() WHERE id=$1",
        [ab.connectionId]);
      await c.query("COMMIT");
      const result=await pending;
      assert.equal(result.ok,false);assert.equal(denied(result.error),true);
    }finally{
      await c.query("ROLLBACK").catch(()=>{});c.release();
      await lab.writer(db=>db.query(
        "UPDATE bridge_connections SET ended_at=NULL WHERE id=$1",[ab.connectionId]));
    }
  });
  await t.test("R3B-37 failure after secure artifacts but before COMMIT fully rolls back",async()=>{
    const before=(await lab.admin.query(
      "SELECT (SELECT count(*)::int FROM bridge_v2_secure_messages) messages,"+
      "(SELECT count(*)::int FROM bridge_v2_secure_live) live,"+
      "(SELECT count(*)::int FROM bridge_v2_secure_unread) unread,"+
      "(SELECT next_message_sequence FROM bridge_conversations WHERE id=$1) sequence",
      [ab.roomId])).rows[0];
    const failGuard=lab.createGuard(async({point,operation})=>{
      if(point==="after_operation_before_final_token"&&operation==="send")
        throw Error("synthetic_test_only_failure_before_commit");
    });
    await assert.rejects(failGuard.dispatch(req(a,"send",ab.roomId,{
      clientMessageId:randomUUID()
    })),denied);
    const after=(await lab.admin.query(
      "SELECT (SELECT count(*)::int FROM bridge_v2_secure_messages) messages,"+
      "(SELECT count(*)::int FROM bridge_v2_secure_live) live,"+
      "(SELECT count(*)::int FROM bridge_v2_secure_unread) unread,"+
      "(SELECT next_message_sequence FROM bridge_conversations WHERE id=$1) sequence",
      [ab.roomId])).rows[0];
    assert.deepEqual(after,before);
  });
  await t.test("R3B-39 expected hosted blocker: legacy V1 writers not wired to mutex",()=>{
    assert.equal(714411,714411); // Documentation marker, NOT security certification.
    // Deliberately no fake V1 compatibility PASS; this is a future hard gate.
  });
}
