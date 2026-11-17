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
  await t.test("R3B-03 subject reassignment wins mutex between JWT preflight and room lock",async()=>{
    const c=await lab.pool.connect();
    try{
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock($1)",[714411]);
      const pending=lab.guard.dispatch(req(a,"live",ab.roomId))
        .then(result=>({ok:true,result}),error=>({ok:false,error}));
      await sleep(75);
      await c.query("UPDATE bridge_accounts SET auth_subject=$2 WHERE id=$1",
        [a,"reassigned-"+randomUUID()]);
      await c.query("COMMIT");
      const result=await pending;
      assert.equal(result.ok,false);assert.equal(denied(result.error),true);
    }finally{
      await c.query("ROLLBACK").catch(()=>{});c.release();
      await lab.writer(db=>db.query("UPDATE bridge_accounts SET auth_subject=$2 WHERE id=$1",
        [a,"b3b-disposable:"+a]));
    }
  });
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
  await t.test("R3B-33 peer account restriction wins over queued ACK, state unchanged",async()=>{
    const c=await lab.pool.connect();
    const target=(await lab.admin.query(
      "SELECT u.id FROM bridge_v2_secure_unread u "+
      "JOIN bridge_v2_secure_messages m ON m.id=u.message_id "+
      "WHERE m.conversation_id=$1 AND u.state='unread' ORDER BY u.accepted_at LIMIT 1",
      [lab.people.bc.roomId])).rows[0]?.id;
    assert.ok(target,"must have a synthetic unread B-to-C envelope");
    const before=(await lab.admin.query(
      "SELECT state,first_acknowledged_at FROM bridge_v2_secure_unread WHERE id=$1",
      [target])).rows[0];
    try{
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock($1)",[714411]);
      const pending=lab.guard.dispatch(req(lab.people.c,"ack",target))
        .then(result=>({ok:true,result}),error=>({ok:false,error}));
      await sleep(70);
      await c.query("UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",[b]);
      await c.query("COMMIT");
      const outcome=await pending;
      assert.equal(outcome.ok,false);
      assert.equal(denied(outcome.error),true);
      const after=(await lab.admin.query(
        "SELECT state,first_acknowledged_at FROM bridge_v2_secure_unread WHERE id=$1",
        [target])).rows[0];
      assert.deepEqual(after,before);
    }finally{
      await c.query("ROLLBACK").catch(()=>{});
      c.release();
      await lab.writer(db=>db.query(
        "UPDATE bridge_accounts SET safety_eligible=true WHERE id=$1",[b]));
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
  // R3B-39 is deliberately NOT a test pass: V1 writers do not coordinate.
  await t.test("R3B-37 metadata/LIVE/UNREAD insert faults roll back ALL artifacts",async()=>{
    const triggerName="b3r1_inject_failure";
    const triggerFn=lab.schema+".reject_stage()";
    const snapshot=async()=>(await lab.admin.query(
      "SELECT (SELECT count(*)::int FROM bridge_v2_secure_messages) messages,"+
      "(SELECT count(*)::int FROM bridge_v2_secure_live) live,"+
      "(SELECT count(*)::int FROM bridge_v2_secure_unread) unread,"+
      "(SELECT count(*)::int FROM bridge_event_outbox) outbox,"+
      "(SELECT next_message_sequence FROM bridge_conversations WHERE id=$1) sequence",
      [ab.roomId])).rows[0];
    await lab.admin.query("CREATE FUNCTION "+triggerFn+
      " RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $ "+
      "BEGIN RAISE EXCEPTION 'synthetic_db_stage_failure' USING ERRCODE='P0001'; "+
      "END $");
    try{
      for(const table of ["bridge_v2_secure_messages","bridge_v2_secure_live",
        "bridge_v2_secure_unread"]){
        const initial=await snapshot();
        await lab.admin.query("CREATE TRIGGER "+triggerName+
          " BEFORE INSERT ON public."+table+
          " FOR EACH ROW EXECUTE FUNCTION "+triggerFn);
        try{
          await assert.rejects(lab.guard.dispatch(req(a,"send",ab.roomId,{
            clientMessageId:randomUUID()
          })),denied);
          assert.deepEqual(await snapshot(),initial,
            "trigger failure on "+table+" must roll back all secure tables and clocks");
        }finally{
          await lab.admin.query("DROP TRIGGER "+triggerName+" ON public."+table);
        }
      }
    }finally{await lab.admin.query("DROP FUNCTION "+triggerFn);}
  });
  await t.test("R3B-38 two independently logged-in nonowner sessions serialize SEND safely",async()=>{
    await lab.withSecondaryRuntime(async secondary=>{
      const before=(await lab.admin.query(
        "SELECT next_message_sequence AS seq FROM bridge_conversations WHERE id=$1",
        [ab.roomId])).rows[0].seq;
      const messages=await Promise.all([
        lab.guard.dispatch(req(a,"send",ab.roomId,{clientMessageId:randomUUID()})),
        secondary.guard.dispatch(req(b,"send",ab.roomId,{clientMessageId:randomUUID()}))
      ]);
      const sequences=messages.map(m=>Number(m.sequence)).sort((x,y)=>x-y);
      assert.deepEqual(sequences,[Number(before),Number(before)+1]);
      assert.notEqual(messages[0].id,messages[1].id);
      assert.equal((await lab.admin.query(
        "SELECT next_message_sequence AS seq FROM bridge_conversations WHERE id=$1",
        [ab.roomId])).rows[0].seq,Number(before)+2);
      assert.equal((await lab.guard.dispatch(req(a,"live",ab.roomId))).messages.length>=2,
        true);
    });
  });
  t.diagnostic("R3B-39 HOSTED HOLD: legacy V1 writer synchronization is unimplemented");
}
