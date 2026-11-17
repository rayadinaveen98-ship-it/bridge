/**
 * B3c-2R3B-2A negative controls against EXISTING, unmodified V1 repository.
 * PASS means a known unsafe V1/V2 gap was reproduced and MUST remain BLOCKED.
 * Do not report these cases as V1 firewall or mixed-worker race remediation.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {createPostgresService} from "../../../src/postgres.mjs";
import {subject} from "../identity/fixtures.mjs";

const URI="postgresql://bridge_privproof_admin:bridge_privproof_only@127.0.0.1:5432/bridge_privproof";

export async function legacyWriterChecks(t,lab){
  const {admin,people}=lab;
  const pool=new pg.Pool({connectionString:URI,max:3,connectionTimeoutMillis:4000,
    statement_timeout:8000,query_timeout:12000,
    application_name:"b3c2r3b2a_synthetic_v1_negative_control"});
  const legacy=createPostgresService(pool);
  try{
    await t.test("TB-L01: original V1 POST still writes plaintext to V2-marked room — BLOCKED",async()=>{
      // Synthetic bodies ONLY. This is the real unmodified V1 repository path,
      // which currently has NO policy_version firewall.
      const body="SYNTHETIC_V1_FIREWALL_FAILURE_"+randomUUID();
      const written=await legacy.sendMessage(subject(people.a),people.ab.roomId,{
        body,clientMessageId:randomUUID()
      });
      assert.equal(written.body,body,
        "UNSAFE NEGATIVE CONTROL: a legacy client can write into V2-marked room");
      const q=await admin.query(
        "SELECT body,policy_version FROM public.bridge_messages WHERE conversation_id=$1",
        [people.ab.roomId]);
      assert.ok(q.rows.some(row=>row.body===body&&row.policy_version===null));
      const room=await admin.query("SELECT policy_version FROM public.bridge_conversations "+
        "WHERE id=$1",[people.ab.roomId]);
      assert.equal(room.rows[0].policy_version,"bridge-v2");
    });
    await t.test("TB-L02: V1 unblock commits despite V2 mutex — writer race BLOCKED",async()=>{
      await admin.query("INSERT INTO public.bridge_blocks(blocker_id,blocked_id) "+
        "VALUES($1,$2)",[people.a,people.b]);
      // Hold the mutex in a separate real PostgreSQL session. Current V1
      // unblock() uses pool.query DELETE without acquiring this mutex.
      await admin.query("BEGIN");
      let pending;
      try{
        await admin.query("SELECT pg_advisory_xact_lock(714411)");
        let returned=false,failed=null;
        pending=legacy.unblock(subject(people.a),people.b)
          .then(()=>{returned=true;},err=>{failed=err;});
        await new Promise(resolve=>setTimeout(resolve,600));
        if(failed)throw failed;
        assert.equal(returned,true,
          "KNOWN GAP: a V1 writer without the mutex can commit during V2 guard");
        const remaining=await admin.query("SELECT count(*)::int n FROM public.bridge_blocks "+
          "WHERE blocker_id=$1 AND blocked_id=$2",[people.a,people.b]);
        assert.equal(remaining.rows[0].n,0);
      }finally{
        await admin.query("ROLLBACK");
        if(pending)await pending;
      }
    });
    await t.test("TB-L03: these are gap reproductions, not full F01-F24 coverage",()=>{
      assert.ok(people.ab.roomId);
      assert.ok(people.bc.roomId);
      // F01..F24, multiworker deadlock/throughput, V1 GET/SSE/Keep and hosted
      // migration preservation are separate B3c-2R3B-2B/2C/2D gates.
    });
  }finally{await pool.end();}
}
