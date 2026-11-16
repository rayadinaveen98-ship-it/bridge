/**
 * B3c-2R3A OFFLINE RED-TEAM GAP REPRODUCTION ONLY.
 * Tests intentionally assert that B3c-2R2's synthetic, unshipped RLS
 * remains UNSAFE after account or relationship revocation.
 * PASS == privacy gap reproduced, NOT remediation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {withActualPg18SignedProof,assertOnlyDisposablePg18,
  syntheticCipherBytes,randomUUID} from "./b3c2r2_actual_schema_fixture.mjs";

const env={CI:"true",GITHUB_ACTIONS:"true",
  BRIDGE_B3C2R2_ACK:"disposable-actual-0008-pg18-only",
  BRIDGE_B3C2R2_PG_MAJOR:"18",
  BRIDGE_B3C2R2_TEST_DATABASE_URL:
    "postgresql://bridge_privproof_admin:bridge_privproof_only@127.0.0.1:5432/bridge_privproof"};
const denied=e=>e?.code==="42501";
async function seed(admin,author,room,connection,recipient){
  const id=randomUUID(),now=new Date(),l=syntheticCipherBytes(),u=syntheticCipherBytes();
  await admin.query("INSERT INTO bridge_v2_secure_messages "+
    "(id,conversation_id,sender_id,client_message_id,sequence_number,policy_version,accepted_at) "+
    "VALUES($1,$2,$3,$4,1,'bridge-v2',$5)",[id,room,author,randomUUID(),now]);
  await admin.query("INSERT INTO bridge_v2_secure_live "+
    "(message_id,ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
    "kek_id,kek_version,cipher_suite,aad_version) "+
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [id,l.ciphertext,l.dataIv,l.dataTag,l.wrappedDek,l.wrapIv,l.wrapTag,l.kekId,1,l.cipherSuite,1]);
  await admin.query("INSERT INTO bridge_v2_secure_unread "+
    "(message_id,connection_id,recipient_id,accepted_at,expires_at,"+
    "ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
    "kek_id,kek_version,cipher_suite,aad_version) "+
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    [id,connection,recipient,now,new Date(now.getTime()+86400000),
    u.ciphertext,u.dataIv,u.dataTag,u.wrappedDek,u.wrapIv,u.wrapTag,u.kekId,1,u.cipherSuite,1]);
  return id;
}
test("R3A-00: guard refuses remote connection and absent ACK",()=>{
  assert.equal(assertOnlyDisposablePg18(env),env.BRIDGE_B3C2R2_TEST_DATABASE_URL);
  for(const patch of [{BRIDGE_B3C2R2_ACK:"not-approved"},
    {BRIDGE_B3C2R2_TEST_DATABASE_URL:env.BRIDGE_B3C2R2_TEST_DATABASE_URL.replace("127.0.0.1","ep.neon.tech")}])
    assert.throws(()=>assertOnlyDisposablePg18({...env,...patch}),
      /b3c2r2_environment_refused/);
});
test("R3A-01: synthetic sender-only RLS incorrectly persists after revocation",async t=>{
  await withActualPg18SignedProof(async({admin,appClient,people,signedTransaction})=>{
    const {a,b,c,ab,bc}=people;
    const mine=await seed(admin,a,ab.roomId,ab.connectionId,b);
    const theirs=await seed(admin,b,bc.roomId,bc.connectionId,c);
    const query=(actor,sql)=>signedTransaction(actor,async client=>(await client.query(sql)).rows);
    const metadata="SELECT id FROM bridge_v2_secure_messages ORDER BY id";
    const live="SELECT message_id FROM bridge_v2_secure_live";
    const inbox="SELECT message_id FROM bridge_v2_secure_unread";
    async function proveUnsafeRead(){
      assert.deepEqual(await query(a,metadata),[{id:mine}]);
      assert.deepEqual(await query(a,live),[{message_id:mine}]);
    }
    await t.test("baseline sender and recipient only; third-party excluded",async()=>{
      assert.deepEqual(await query(a,metadata),[{id:mine}]);
      assert.deepEqual(await query(b,metadata),[{id:theirs}]);
      assert.deepEqual(await query(b,inbox),[{message_id:mine}]);
      assert.deepEqual(await query(c,inbox),[{message_id:theirs}]);
      assert.deepEqual(await query(a,inbox),[]);
    });
    for(const state of [
      {label:"suspended account",sql:"UPDATE bridge_accounts SET status='suspended' WHERE id=$1",
       restore:"UPDATE bridge_accounts SET status='active' WHERE id=$1"},
      {label:"unverified age",sql:"UPDATE bridge_accounts SET age_verified_at=NULL WHERE id=$1",
       restore:"UPDATE bridge_accounts SET age_verified_at=clock_timestamp() WHERE id=$1"},
      {label:"revoked safety eligibility",sql:"UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",
       restore:"UPDATE bridge_accounts SET safety_eligible=true WHERE id=$1"}
    ])await t.test(state.label+" still reads LIVE: explicit HOLD",async()=>{
      await admin.query(state.sql,[a]);
      try{await proveUnsafeRead();}
      finally{await admin.query(state.restore,[a]);}
    });
    for(const [actor,peer] of [[b,a],[a,b]])
      await t.test("block "+(actor===a?"A to B":"B to A")+" still reads: HOLD",async()=>{
        await admin.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",[actor,peer]);
        try{
          await proveUnsafeRead();
          assert.deepEqual(await query(b,inbox),[{message_id:mine}]);
        }finally{
          await admin.query("DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",[actor,peer]);
        }
      });
    for(const state of [
      {label:"participant leaves",sql:"UPDATE bridge_conversation_participants SET left_at=clock_timestamp() WHERE conversation_id=$1 AND account_id=$2",
       restore:"UPDATE bridge_conversation_participants SET left_at=NULL WHERE conversation_id=$1 AND account_id=$2",args:[ab.roomId,a]},
      {label:"direct relationship ends",sql:"UPDATE bridge_connections SET ended_at=clock_timestamp() WHERE id=$1",
       restore:"UPDATE bridge_connections SET ended_at=NULL WHERE id=$1",args:[ab.connectionId]},
      {label:"conversation closes",sql:"UPDATE bridge_conversations SET state='closed',closed_at=clock_timestamp() WHERE id=$1",
       restore:"UPDATE bridge_conversations SET state='open',closed_at=NULL WHERE id=$1",args:[ab.roomId]}
    ])await t.test(state.label+" still reads LIVE: HOLD",async()=>{
      await admin.query(state.sql,state.args);
      try{await proveUnsafeRead();}
      finally{await admin.query(state.restore,state.args);}
    });
    await t.test("blocked actor can still INSERT metadata: unsafe RLS example",async()=>{
      await admin.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",[b,a]);
      try{
        await signedTransaction(a,async client=>{
          const row=await client.query("INSERT INTO bridge_v2_secure_messages "+
            "(id,conversation_id,sender_id,client_message_id,sequence_number,policy_version,accepted_at) "+
            "VALUES($1,$2,$3,$4,2,'bridge-v2',clock_timestamp())",
            [randomUUID(),ab.roomId,a,randomUUID()]);
          assert.equal(row.rowCount,1);
        });
      }finally{
        await admin.query("DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",[b,a]);
      }
      const actual=(await admin.query("SELECT count(*)::int n FROM bridge_v2_secure_messages "+
        "WHERE conversation_id=$1",[ab.roomId])).rows[0].n;
      assert.equal(actual,1,"blocked write was rolled back by synthetic transaction fixture");
    });
    await t.test("revoked unread state does fail closed (existing positive control)",async()=>{
      await admin.query("UPDATE bridge_v2_secure_unread SET state='revoked' WHERE message_id=$1",[mine]);
      try{assert.deepEqual(await query(b,inbox),[]);}
      finally{await admin.query("UPDATE bridge_v2_secure_unread SET state='unread' WHERE message_id=$1",[mine]);}
    });
    await t.test("unsigned session and legacy/case/history still default deny",async()=>{
      assert.deepEqual((await appClient.query(metadata)).rows,[]);
      assert.deepEqual((await appClient.query(live)).rows,[]);
      for(const name of ["bridge_messages","bridge_accounts","bridge_report_evidence","bridge_history_items"])
        await assert.rejects(appClient.query("SELECT * FROM "+name+" LIMIT 1"),denied);
    });
    await t.test("no V1 plaintext created; synthetic blocked INSERT did not persist",async()=>{
      assert.equal((await admin.query("SELECT count(*)::int n FROM bridge_messages")).rows[0].n,0);
      assert.equal((await admin.query("SELECT count(*)::int n FROM bridge_v2_secure_messages")).rows[0].n,2);
    });
  });
});
