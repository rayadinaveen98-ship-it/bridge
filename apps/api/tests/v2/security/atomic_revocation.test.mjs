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
      // Independently compare the synthetic issuer's transaction signature to
      // the disposable database HMAC result without logging secret/key material.
      await lab.appClient.query("BEGIN");
      try{
        const tx=(await lab.appClient.query(
          "SELECT txid_current()::text tx,"+
          "floor(extract(epoch from clock_timestamp()))::bigint epoch,session_user sess"
        )).rows[0];
        const expires=Number(tx.epoch)+25;
        const claim={
          actor:a,operation:"live",targetId:ab.roomId,clientMessageId:null,
          recoveryToken:null,expires,tx:tx.tx,session:tx.sess
        };
        const signed=lab.signer(claim);
        const source=[a,"live",ab.roomId,"",
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          expires,tx.tx,tx.sess].join("|");
        const db=(await lab.admin.query(
          "SELECT encode(public.hmac(convert_to($1,'UTF8'),"+
          "secret,'sha256'),'hex') AS mac FROM "+lab.schema+".guard_key WHERE id=1",
          [source]
        )).rows[0].mac;
        assert.equal(signed,db,"independent test-only SQL and JS proof must match");
      }finally{await lab.appClient.query("ROLLBACK");}
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
    await t.test("R3B-03 reassigned or deleted subject denies stale signed A account",async()=>{
      await constrained(
        "UPDATE bridge_accounts SET auth_subject=$2 WHERE id=$1",
        [a,"disabled-"+randomUUID()],
        "UPDATE bridge_accounts SET auth_subject=$2 WHERE id=$1",
        [a,"b3b-disposable:"+a],
        async()=>await assert.rejects(run(a,"live",ab.roomId),denied)
      );
      await constrained(
        "UPDATE bridge_accounts SET deleted_at=clock_timestamp() WHERE id=$1",[a],
        "UPDATE bridge_accounts SET deleted_at=NULL WHERE id=$1",[a],
        async()=>await assert.rejects(run(a,"live",ab.roomId),denied)
      );
    });
    await t.test("R3B-10/11/22 active synthetic random session is current-only, expires in 30m",async()=>{
      const source=(await lab.admin.query(
        "SELECT source_conversation_id AS id FROM bridge_connections WHERE id=$1",
        [ab.connectionId])).rows[0].id;
      const stamp=new Date(),deadline=new Date(stamp.getTime()+30*60000);
      const matchId=randomUUID(),sorted=[a,b].sort();
      await lab.writer(async client=>{
        await client.query(
          "INSERT INTO bridge_supported_languages(code,display_name,moderation_ready) "+
          "VALUES('en','English',true) ON CONFLICT (code) DO NOTHING");
        await client.query(
          "INSERT INTO bridge_match_sessions("+
          "id,member_low,member_high,language_code,state,lease_expires_at,activated_at) "+
          "VALUES($1,$2,$3,'en','active',$4,$5)",
          [matchId,sorted[0],sorted[1],new Date(stamp.getTime()+3600000),stamp]);
        await client.query(
          "INSERT INTO bridge_active_match_slots(account_id,match_session_id) "+
          "VALUES($1,$3),($2,$3)",[a,b,matchId]);
        await client.query(
          "UPDATE bridge_conversations SET policy_version='bridge-v2',"+
          "v2_session_role='random',legacy_qa=false,last_accepted_at=$2,"+
          "idle_expires_at=$3,match_session_id=$4 WHERE id=$1",
          [source,stamp,deadline,matchId]);
        await client.query(
          "INSERT INTO bridge_conversation_participants(conversation_id,account_id) "+
          "VALUES($1,$2),($1,$3)",[source,a,b]);
      });
      await assert.rejects(run(c,"live",source),denied);
      assert.deepEqual((await run(a,"live",source)).messages,[]);
      await constrained(
        "UPDATE bridge_match_sessions SET state='ended',ended_at=clock_timestamp() "+
        "WHERE id=$1",[matchId],
        "UPDATE bridge_match_sessions SET state='active',ended_at=NULL WHERE id=$1",
        [matchId],
        async()=>{
          await assert.rejects(run(a,"live",source),denied);
          await assert.rejects(run(b,"send",source,{clientMessageId:randomUUID()}),denied);
        });
      await constrained(
        "DELETE FROM bridge_active_match_slots WHERE account_id=$1",[a],
        "INSERT INTO bridge_active_match_slots(account_id,match_session_id) VALUES($1,$2)",
        [a,matchId],
        async()=>{
          await assert.rejects(run(a,"live",source),denied);
          await assert.rejects(run(b,"send",source,{clientMessageId:randomUUID()}),denied);
        });
      const accepted=await run(a,"send",source,{clientMessageId:randomUUID()});
      assert.equal(accepted.sequence,1);
      assert.equal((await run(b,"live",source)).messages[0]?.id,accepted.id);
      assert.equal((await run(a,"live",source)).messages[0]?.id,accepted.id);
      const delivered=(await lab.admin.query(
        "SELECT count(*)::int n FROM bridge_v2_secure_unread WHERE message_id=$1",
        [accepted.id])).rows[0].n;
      assert.equal(delivered,0,"random session never creates direct unread history");
      assert.equal((await run(a,"live",ab.roomId)).messages.length,1,
        "Keep direct room must never import former random transcript");
      const expired=new Date(Date.now()-31*60000);
      await lab.writer(db=>db.query(
        "UPDATE bridge_conversations SET last_accepted_at=$2,idle_expires_at=$3 "+
        "WHERE id=$1",[source,expired,new Date(expired.getTime()+30*60000)]));
      await assert.rejects(run(a,"live",source),denied);
      await assert.rejects(run(b,"send",source,{clientMessageId:randomUUID()}),denied);
      assert.equal((await lab.admin.query(
        "SELECT count(*)::int n FROM bridge_v2_secure_messages WHERE conversation_id=$1",
        [source])).rows[0].n,1,"expired session cannot append or refresh");
      await lab.writer(db=>db.query(
        "UPDATE bridge_conversations SET state='closed',closed_at=clock_timestamp() WHERE id=$1",
        [source]));
      await assert.rejects(run(a,"live",source),denied);
      assert.equal((await run(b,"live",ab.roomId)).messages.length,1,
        "historical random transcript must stay outside direct chat");
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
    await t.test("R3B-14 peer suspension and age withdrawal deny both LIVE reads",async()=>{
      await constrained(
        "UPDATE bridge_accounts SET status='suspended' WHERE id=$1",[b],
        "UPDATE bridge_accounts SET status='active' WHERE id=$1",[b],
        async()=>{
          await assert.rejects(run(a,"live",ab.roomId),denied);
          await assert.rejects(run(b,"live",ab.roomId),denied);
        });
      await constrained(
        "UPDATE bridge_accounts SET age_verified_at=NULL WHERE id=$1",[b],
        "UPDATE bridge_accounts SET age_verified_at=clock_timestamp() WHERE id=$1",[b],
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
    await t.test("R3B-25 UNREAD and ACK are denied after recipient suspension or age loss",async()=>{
      await constrained(
        "UPDATE bridge_accounts SET status='suspended' WHERE id=$1",[b],
        "UPDATE bridge_accounts SET status='active' WHERE id=$1",[b],
        async()=>{
          await assert.rejects(run(b,"unread",aEnvelope),denied);
          await assert.rejects(run(b,"ack",aEnvelope),denied);
        });
      await constrained(
        "UPDATE bridge_accounts SET age_verified_at=NULL WHERE id=$1",[b],
        "UPDATE bridge_accounts SET age_verified_at=clock_timestamp() WHERE id=$1",[b],
        async()=>{
          await assert.rejects(run(b,"unread",aEnvelope),denied);
          await assert.rejects(run(b,"ack",aEnvelope),denied);
        });
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
        recoveryToken:recoveryToken.slice(0,-1)+(recoveryToken.at(-1)==="a"?"b":"a")
      }),denied);
      await assert.rejects(run(c,"recover",aEnvelope,{recoveryToken}),denied);
      const original=(await lab.admin.query(
        "SELECT accepted_at,first_acknowledged_at FROM bridge_v2_secure_unread WHERE id=$1",
        [aEnvelope])).rows[0];
      const priorAccepted=new Date(Date.now()-18*60000);
      const priorAck=new Date(Date.now()-16*60000);
      await mutate(
        "UPDATE bridge_v2_secure_unread SET accepted_at=$2,first_acknowledged_at=$3 WHERE id=$1",
        [aEnvelope,priorAccepted,priorAck]);
      try{await assert.rejects(run(b,"recover",aEnvelope,{recoveryToken}),denied);}
      finally{await mutate(
        "UPDATE bridge_v2_secure_unread SET accepted_at=$2,first_acknowledged_at=$3 WHERE id=$1",
        [aEnvelope,original.accepted_at,original.first_acknowledged_at]);}
    });
    await t.test("R3B-25 previously ACKed recovery denied after Block or account restriction",async()=>{
      const proof=recoveryReceipt.recoveryToken;
      await constrained(
        "INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",[a,b],
        "DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",[a,b],
        async()=>await assert.rejects(run(b,"recover",aEnvelope,{recoveryToken:proof}),denied));
      await constrained(
        "UPDATE bridge_accounts SET status='suspended' WHERE id=$1",[a],
        "UPDATE bridge_accounts SET status='active' WHERE id=$1",[a],
        async()=>await assert.rejects(run(b,"recover",aEnvelope,{recoveryToken:proof}),denied));
      await constrained(
        "UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",[b],
        "UPDATE bridge_accounts SET safety_eligible=true WHERE id=$1",[b],
        async()=>await assert.rejects(run(b,"recover",aEnvelope,{recoveryToken:proof}),denied));
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
    await t.test("R3B-36 held transaction proof expires; full SEND rolls back",async()=>{
      const before=(await lab.admin.query(
        "SELECT (SELECT count(*)::int n FROM bridge_v2_secure_messages) messages,"+
        "(SELECT count(*)::int n FROM bridge_v2_secure_live) live,"+
        "(SELECT count(*)::int n FROM bridge_v2_secure_unread) unread,"+
        "(SELECT next_message_sequence FROM bridge_conversations WHERE id=$1) sequence",
        [ab.roomId])).rows[0];
      const slowGuard=lab.createGuard(async({point,operation})=>{
        if(point==="after_operation_before_final_token"&&operation==="send")
          await new Promise(resolve=>setTimeout(resolve,26500));
      });
      await assert.rejects(slowGuard.dispatch(req(a,"send",ab.roomId,{
        clientMessageId:randomUUID()
      })),denied);
      const after=(await lab.admin.query(
        "SELECT (SELECT count(*)::int n FROM bridge_v2_secure_messages) messages,"+
        "(SELECT count(*)::int n FROM bridge_v2_secure_live) live,"+
        "(SELECT count(*)::int n FROM bridge_v2_secure_unread) unread,"+
        "(SELECT next_message_sequence FROM bridge_conversations WHERE id=$1) sequence",
        [ab.roomId])).rows[0];
      assert.deepEqual(after,before,
        "short signed transaction proof must not commit after expiry");
    });
    await t.test("R3B-36 a real short-lived JWT expires before COMMIT, SEND rolls back",async()=>{
      const before=(await lab.admin.query(
        "SELECT (SELECT count(*)::int FROM bridge_v2_secure_messages) messages,"+
        "(SELECT count(*)::int FROM bridge_v2_secure_live) live,"+
        "(SELECT count(*)::int FROM bridge_v2_secure_unread) unread,"+
        "(SELECT next_message_sequence FROM bridge_conversations WHERE id=$1) sequence",
        [ab.roomId])).rows[0];
      let reached=false;
      const shortGuard=lab.createGuard(async({point,operation})=>{
        if(point==="after_operation_before_final_token"&&operation==="send"){
          reached=true;
          await new Promise(resolve=>setTimeout(resolve,4200));
        }
      });
      const epoch=Math.floor(Date.now()/1000);
      await assert.rejects(shortGuard.dispatch({
        authorization:lab.tokenWithClaims(a,{iat:epoch-1,nbf:epoch-1,exp:epoch+3}),
        operation:"send",targetId:ab.roomId,clientMessageId:randomUUID()
      }),denied);
      assert.equal(reached,true,"real JWT must reach post-write gate before expiring");
      const after=(await lab.admin.query(
        "SELECT (SELECT count(*)::int FROM bridge_v2_secure_messages) messages,"+
        "(SELECT count(*)::int FROM bridge_v2_secure_live) live,"+
        "(SELECT count(*)::int FROM bridge_v2_secure_unread) unread,"+
        "(SELECT next_message_sequence FROM bridge_conversations WHERE id=$1) sequence",
        [ab.roomId])).rows[0];
      assert.deepEqual(after,before,"expired JWT must rollback every secure artifact");
    });
    await t.test("R3B-12 closing D1 then opening D2 cannot reveal D1 LIVE history",async()=>{
      const newRoom=randomUUID(),now=new Date();
      await lab.writer(async c=>{
        await c.query("UPDATE bridge_v2_direct_sessions "+
          "SET state='closed',closed_at=$2 WHERE conversation_id=$1",
          [ab.roomId,now]);
        await c.query("UPDATE bridge_conversations "+
          "SET state='closed',closed_at=$2,closed_reason='expired' WHERE id=$1",
          [ab.roomId,now]);
        await c.query(
          "INSERT INTO bridge_conversations("+
          "id,kind,state,policy_version,v2_session_role,legacy_qa,connection_id,"+
          "next_message_sequence,last_accepted_at,idle_expires_at) "+
          "VALUES($1,'connection','open','bridge-v2','direct',false,$2,1,$3,$4)",
          [newRoom,ab.connectionId,now,new Date(now.getTime()+30*60000)]);
        await c.query(
          "INSERT INTO bridge_conversation_participants(conversation_id,account_id) "+
          "VALUES($1,$2),($1,$3)",[newRoom,a,b]);
        await c.query(
          "INSERT INTO bridge_v2_direct_sessions("+
          "conversation_id,connection_id,state,policy_version,opened_at) "+
          "VALUES($1,$2,'open','bridge-v2',$3)",[newRoom,ab.connectionId,now]);
      });
      await assert.rejects(run(a,"live",ab.roomId),denied);
      await assert.rejects(run(b,"live",ab.roomId),denied);
      assert.deepEqual((await run(a,"live",newRoom)).messages,[]);
      assert.deepEqual((await run(b,"live",newRoom)).messages,[]);
    });
    t.diagnostic("R3B-39/46 HOSTED HOLD: legacy writer mutex, keys, Android, Neon and R0 not certified");
  });
});
