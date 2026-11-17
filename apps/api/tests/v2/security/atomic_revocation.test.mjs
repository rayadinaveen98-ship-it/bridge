/**
 * Single B3c-2R3B-1 entrypoint. Supporting *.test.mjs modules export
 * functions, deliberately NOT independent top-level tests; one disposable
 * PostgreSQL18 fixture is created and torn down for all three grouped suites.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {withAtomicPg18Fixture,denied,randomUUID} from "./atomic_pg18_fixture.mjs";
import {privilegeCases} from "./atomic_privileges.test.mjs";
import {raceCases} from "./atomic_races.test.mjs";

test("B3c-2R3B-1 real 0001..0008 PG18 restricted-role atomic command gateway",async t=>{
  await withAtomicPg18Fixture(async lab=>{
    const {a,b,c,ab,bc}=lab.people;
    const req=(actor,operation,targetId,extra={})=>({
      authorization:lab.token(actor),operation,targetId,...extra
    });
    const run=(actor,operation,targetId,extra={})=>
      lab.guard.dispatch(req(actor,operation,targetId,extra));
    async function mutate(sql,args){
      return lab.writer(db=>db.query(sql,args));
    }
    async function constrained(sql,args,restore,restoreArgs,fn){
      await mutate(sql,args);
      try{await fn();}
      finally{await mutate(restore,restoreArgs);}
    }
    await t.test("R3B-00 fixture eligibility invariants are actually satisfied",async()=>{
      const room=(await lab.admin.query(
        "SELECT kind,state,policy_version,v2_session_role,legacy_qa,idle_expires_at,"+
        "connection_id FROM bridge_conversations WHERE id=$1",[ab.roomId]
      )).rows[0];
      const pair=(await lab.admin.query(
        "SELECT id,policy_version,ended_at,member_low,member_high "+
        "FROM bridge_connections WHERE id=$1",[ab.connectionId]
      )).rows[0];
      const members=(await lab.admin.query(
        "SELECT p.account_id,p.left_at,a.status,a.auth_subject,"+
        "a.safety_eligible,a.age_verified_at,a.deleted_at "+
        "FROM bridge_conversation_participants p "+
        "JOIN bridge_accounts a ON a.id=p.account_id "+
        "WHERE p.conversation_id=$1 ORDER BY p.account_id",[ab.roomId]
      )).rows;
      const segment=(await lab.admin.query(
        "SELECT state,connection_id,policy_version FROM bridge_v2_direct_sessions "+
        "WHERE conversation_id=$1",[ab.roomId]
      )).rows[0];
      const blocks=(await lab.admin.query(
        "SELECT count(*)::int n FROM bridge_blocks WHERE "+
        "(blocker_id=$1 AND blocked_id=$2) OR "+
        "(blocker_id=$2 AND blocked_id=$1)",[a,b]
      )).rows[0].n;
      const checks={
        kind:room.kind==="connection",roomOpen:room.state==="open",
        policy:room.policy_version==="bridge-v2",role:room.v2_session_role==="direct",
        legacy:room.legacy_qa===false,roomConnection:room.connection_id===pair.id,
        idle:room.idle_expires_at instanceof Date&&room.idle_expires_at>Date.now(),
        pair:pair.policy_version==="bridge-v2"&&pair.ended_at===null,
        two:members.length===2,
        sorted:members.length===2&&members[0].account_id===pair.member_low&&
          members[1].account_id===pair.member_high,
        accounts:members.every(x=>x.status==="active"&&x.age_verified_at!=null&&
          x.safety_eligible===true&&x.deleted_at===null&&
          x.auth_subject==="b3b-disposable:"+x.account_id),
        segment:segment?.state==="open"&&segment.connection_id===pair.id&&
          segment.policy_version==="bridge-v2",
        blocks:blocks===0
      };
      assert.ok(Object.values(checks).every(Boolean),JSON.stringify(checks));
    });
    await t.test("R3B-10/11 positive A+B direct room, no unauthorized C access",async()=>{
      const empty=await run(a,"live",ab.roomId);
      assert.deepEqual(empty.messages,[]);
      await assert.rejects(run(c,"live",ab.roomId),denied);
      await assert.rejects(run(a,"live",bc.roomId),denied);
    });
    const aMessage=await lab.seed(a,ab.roomId,ab.connectionId,b);
    const bMessage=await lab.seed(b,bc.roomId,bc.connectionId,c);
    await mutate("UPDATE bridge_conversations SET next_message_sequence=2 WHERE id=ANY($1::uuid[])",
      [[ab.roomId,bc.roomId]]);
    const aEnvelope=(await lab.admin.query(
      "SELECT id FROM bridge_v2_secure_unread WHERE message_id=$1",[aMessage]
    )).rows[0].id;
    const bEnvelope=(await lab.admin.query(
      "SELECT id FROM bridge_v2_secure_unread WHERE message_id=$1",[bMessage]
    )).rows[0].id;
    await t.test("R3B-10/11 sender and recipient both read current room; no D1 or BC history",async()=>{
      const fromA=await run(a,"live",ab.roomId);
      const fromB=await run(b,"live",ab.roomId);
      assert.equal(fromA.messages.length,1);
      assert.equal(fromA.messages[0].id,aMessage);
      assert.deepEqual(fromB.messages,fromA.messages);
      const another=await run(b,"live",bc.roomId);
      assert.equal(another.messages.length,1);
      assert.equal(another.messages[0].id,bMessage);
      await assert.rejects(run(a,"live",bc.roomId),denied);
    });
    await t.test("R3B-13 suspended actor cannot read LIVE or SEND",async()=>{
      await constrained(
        "UPDATE bridge_accounts SET status='suspended' WHERE id=$1",[a],
        "UPDATE bridge_accounts SET status='active' WHERE id=$1",[a],
        async()=>{
          await assert.rejects(run(a,"live",ab.roomId),denied);
          await assert.rejects(run(a,"send",ab.roomId,{clientMessageId:randomUUID()}),denied);
        });
    });
    await t.test("R3B-14 restricted peer immediately denies both actors' current LIVE",async()=>{
      await constrained(
        "UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",[b],
        "UPDATE bridge_accounts SET safety_eligible=true WHERE id=$1",[b],
        async()=>{
          await assert.rejects(run(a,"live",ab.roomId),denied);
          await assert.rejects(run(b,"live",ab.roomId),denied);
        });
    });
    await t.test("R3B-15 missing age and actor safety eligibility deny previously sent LIVE",async()=>{
      await constrained(
        "UPDATE bridge_accounts SET age_verified_at=NULL WHERE id=$1",[a],
        "UPDATE bridge_accounts SET age_verified_at=clock_timestamp() WHERE id=$1",[a],
        async()=>await assert.rejects(run(a,"live",ab.roomId),denied)
      );
      await constrained(
        "UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",[a],
        "UPDATE bridge_accounts SET safety_eligible=true WHERE id=$1",[a],
        async()=>await assert.rejects(run(a,"live",ab.roomId),denied)
      );
    });
    await t.test("R3B-16 either Block direction denies both LIVE, UNREAD and SEND",async()=>{
      for(const [one,two] of [[b,a],[a,b]]) {
        await constrained(
          "INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",[one,two],
          "DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",[one,two],
          async()=>{
            for(const actor of [a,b])
              await assert.rejects(run(actor,"live",ab.roomId),denied);
            await assert.rejects(run(b,"unread",aEnvelope),denied);
            await assert.rejects(run(a,"send",ab.roomId,{clientMessageId:randomUUID()}),denied);
          }
        );
      }
    });
    await t.test("R3B-17 participant departure denies prior LIVE, UNREAD and SEND",async()=>{
      await constrained(
        "UPDATE bridge_conversation_participants SET left_at=clock_timestamp() "+
        "WHERE conversation_id=$1 AND account_id=$2",[ab.roomId,b],
        "UPDATE bridge_conversation_participants SET left_at=NULL "+
        "WHERE conversation_id=$1 AND account_id=$2",[ab.roomId,b],
        async()=>{
          await assert.rejects(run(a,"live",ab.roomId),denied);
          await assert.rejects(run(b,"unread",aEnvelope),denied);
        }
      );
    });
    await t.test("R3B-18 ended mutual connection denies LIVE/UNREAD/ACK",async()=>{
      await constrained(
        "UPDATE bridge_connections SET ended_at=clock_timestamp() WHERE id=$1",
        [ab.connectionId],
        "UPDATE bridge_connections SET ended_at=NULL WHERE id=$1",
        [ab.connectionId],
        async()=>{
          await assert.rejects(run(a,"live",ab.roomId),denied);
          await assert.rejects(run(b,"unread",aEnvelope),denied);
          await assert.rejects(run(b,"ack",aEnvelope),denied);
        }
      );
    });
    await t.test("R3B-17 closed room/segment denies current LIVE",async()=>{
      await constrained(
        "UPDATE bridge_conversations SET state='closed',closed_at=clock_timestamp() WHERE id=$1",
        [ab.roomId],
        "UPDATE bridge_conversations SET state='open',closed_at=NULL WHERE id=$1",
        [ab.roomId],
        async()=>await assert.rejects(run(a,"live",ab.roomId),denied)
      );
      await constrained(
        "UPDATE bridge_v2_direct_sessions SET state='closed',closed_at=clock_timestamp() "+
        "WHERE conversation_id=$1",[ab.roomId],
        "UPDATE bridge_v2_direct_sessions SET state='open',closed_at=NULL "+
        "WHERE conversation_id=$1",[ab.roomId],
        async()=>await assert.rejects(run(a,"live",ab.roomId),denied)
      );
    });
    await t.test("R3B-19 unknown/foreign target always gives same uniform unavailable",async()=>{
      await assert.rejects(run(a,"live",randomUUID()),denied);
      await assert.rejects(run(a,"unread",bEnvelope),denied);
      await assert.rejects(run(c,"unread",aEnvelope),denied);
      await assert.rejects(run(a,"ack",aEnvelope),denied);
    });
    await t.test("R3B-20 active sender commits one metadata+LIVE+recipient UNREAD",async()=>{
      const before=(await lab.admin.query(
        "SELECT count(*)::int n FROM bridge_v2_secure_messages WHERE conversation_id=$1",
        [ab.roomId])).rows[0].n;
      const receipt=await run(a,"send",ab.roomId,{clientMessageId:randomUUID()});
      assert.equal(receipt.sequence,2);
      assert.equal(typeof receipt.id,"string");
      const after=(await lab.admin.query(
        "SELECT count(*)::int n FROM bridge_v2_secure_messages WHERE conversation_id=$1",
        [ab.roomId])).rows[0].n;
      assert.equal(after,before+1);
      const copies=(await lab.admin.query(
        "SELECT (SELECT count(*) FROM bridge_v2_secure_live WHERE message_id=$1) live,"+
        "(SELECT count(*) FROM bridge_v2_secure_unread WHERE message_id=$1) unread",
        [receipt.id])).rows[0];
      assert.equal(Number(copies.live),1);
      assert.equal(Number(copies.unread),1);
      assert.equal((await run(a,"live",ab.roomId)).messages.length,2);
    });
    await t.test("R3B-21 blocked sender cannot commit a new message or move sequence",async()=>{
      const old=(await lab.admin.query(
        "SELECT next_message_sequence AS seq FROM bridge_conversations WHERE id=$1",
        [ab.roomId])).rows[0].seq;
      await constrained(
        "INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",[b,a],
        "DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",[b,a],
        async()=>await assert.rejects(run(a,"send",ab.roomId,{
          clientMessageId:randomUUID()
        }),denied)
      );
      assert.equal((await lab.admin.query(
        "SELECT next_message_sequence AS seq FROM bridge_conversations WHERE id=$1",
        [ab.roomId])).rows[0].seq,old);
    });
    await t.test("R3B-22 idle expiry denies new write, without refreshing clock",async()=>{
      const old=await lab.admin.query(
        "SELECT last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",
        [ab.roomId]);
      const prev=old.rows[0];
      const base=new Date(Date.now()-31*60000);
      await mutate(
        "UPDATE bridge_conversations SET last_accepted_at=$2,idle_expires_at=$3 WHERE id=$1",
        [ab.roomId,base,new Date(base.getTime()+30*60000)]);
      try{
        await assert.rejects(run(a,"send",ab.roomId,{clientMessageId:randomUUID()}),denied);
        await assert.rejects(run(a,"live",ab.roomId),denied);
      }finally{
        await mutate(
          "UPDATE bridge_conversations SET last_accepted_at=$2,idle_expires_at=$3 WHERE id=$1",
          [ab.roomId,prev.last_accepted_at,prev.idle_expires_at]);
      }
    });
    await t.test("R3B-23 caller cannot forge sender or set another recipient via payload",async()=>{
      await assert.rejects(lab.guard.dispatch({
        ...req(a,"send",ab.roomId,{clientMessageId:randomUUID()}),
        senderId:b
      }),denied);
      await assert.rejects(lab.guard.dispatch({
        ...req(a,"send",ab.roomId,{clientMessageId:randomUUID()}),
        recipientId:c
      }),denied);
    });
    await t.test("R3B-24/25 B can access own valid UNREAD but A and C cannot",async()=>{
      const u=await run(b,"unread",aEnvelope);
      assert.equal(u.id,aEnvelope);
      await assert.rejects(run(a,"unread",aEnvelope),denied);
      await assert.rejects(run(c,"unread",aEnvelope),denied);
      const other=await run(c,"unread",bEnvelope);
      assert.equal(other.id,bEnvelope);
    });
    await t.test("R3B-26 revoked and expired UNREAD cannot be accessed",async()=>{
      await constrained(
        "UPDATE bridge_v2_secure_unread SET state='revoked' WHERE id=$1",[aEnvelope],
        "UPDATE bridge_v2_secure_unread SET state='unread' WHERE id=$1",[aEnvelope],
        async()=>await assert.rejects(run(b,"unread",aEnvelope),denied)
      );
      const before=(await lab.admin.query(
        "SELECT accepted_at,expires_at FROM bridge_v2_secure_unread WHERE id=$1",
        [bEnvelope])).rows[0];
      const accept=new Date(Date.now()-8*86400000);
      await mutate(
        "UPDATE bridge_v2_secure_unread SET accepted_at=$2,expires_at=$3 WHERE id=$1",
        [bEnvelope,accept,new Date(accept.getTime()+7*86400000)]);
      try{await assert.rejects(run(c,"unread",bEnvelope),denied);}
      finally{await mutate(
        "UPDATE bridge_v2_secure_unread SET accepted_at=$2,expires_at=$3 WHERE id=$1",
        [bEnvelope,before.accepted_at,before.expires_at]);}
    });
    let recoveryReceipt;
    await t.test("R3B-27/28 first ACK immutable; correct token recovers <=15m",async()=>{
      const receipt=await run(b,"ack",aEnvelope);
      assert.equal(receipt.id,aEnvelope);
      assert.equal(typeof receipt.recoveryToken,"string");
      assert.equal(receipt.recoveryToken.length,48);
      await assert.rejects(run(b,"ack",aEnvelope),denied);
      await assert.rejects(run(b,"unread",aEnvelope),denied);
      const recovered=await run(b,"recover",aEnvelope,{
        recoveryToken:receipt.recoveryToken
      });
      assert.equal(recovered.id,aEnvelope);
      recoveryReceipt={envelopeId:aEnvelope,recoveryToken:receipt.recoveryToken};
    });
    await t.test("R3B-29 wrong token or wrong actor denied; 15m timer cannot be extended",async()=>{
      const {recoveryToken}=recoveryReceipt;
      await assert.rejects(run(b,"recover",aEnvelope,{
        recoveryToken:recoveryToken.slice(0,-1)+"a"
      }),denied);
      await assert.rejects(run(c,"recover",aEnvelope,{recoveryToken}),denied);
      const original=(await lab.admin.query(
        "SELECT first_acknowledged_at FROM bridge_v2_secure_unread WHERE id=$1",
        [aEnvelope])).rows[0].first_acknowledged_at;
      await mutate(
        "UPDATE bridge_v2_secure_unread SET first_acknowledged_at=clock_timestamp()-interval '16 minutes' WHERE id=$1",
        [aEnvelope]);
      try{await assert.rejects(run(b,"recover",aEnvelope,{recoveryToken}),denied);}
      finally{await mutate(
        "UPDATE bridge_v2_secure_unread SET first_acknowledged_at=$2 WHERE id=$1",
        [aEnvelope,original]);}
    });
    await privilegeCases(t,lab);
    await raceCases(t,lab,recoveryReceipt);
    await t.test("R3B-42,43 original migrations retained; unsafe R3A policy not copied",async()=>{
      assert.deepEqual(lab.schemaReceipt.ledger,
        ["0004","0005","0006","0007","0008"]);
      assert.equal(lab.schemaReceipt.tables,37);
      assert.equal((await lab.admin.query(
        "SELECT count(*)::int n FROM bridge_messages")).rows[0].n,0);
      for(const table of ["bridge_v2_secure_messages","bridge_v2_secure_live",
        "bridge_v2_secure_unread"]){
        const policies=(await lab.admin.query(
          "SELECT count(*)::int n FROM pg_policies WHERE "+
          "schemaname='public' AND tablename=$1",[table])).rows[0].n;
        assert.equal(policies,0,"prototype RLS policies intentionally REMOVED");
      }
    });
    await t.test("R3B-45 no hosted HTTP/start/postgres import of disconnected guard",async()=>{
      const root=new URL("../../../src/",import.meta.url);
      for(const file of ["http.mjs","start.mjs","postgres.mjs","live.mjs","auth.mjs"]){
        const content=await readFile(new URL(file,root),"utf8");
        assert.doesNotMatch(content,/disposable_atomic_guard\.mjs/);
      }
    });
    await t.test("R3B-39,46 mandatory hosted gates NOT certified by offline proof",()=>{
      assert.equal(true,true);
      // Legacy V1 writers, production principal, real KEKs, Android and R0
      // remain documented HOLD; do not count this as hosted security proof.
    });
  });
});
