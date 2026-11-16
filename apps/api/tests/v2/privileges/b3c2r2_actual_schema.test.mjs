/**
 * Actual checked-in 0001–0008 on one attested disposable PostgreSQL18 service.
 * The RLS policies, HMAC signing key, JWTs, rows and principals are synthetic:
 * this is not production role deployment or Bridge API/Android activation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createSign} from "node:crypto";
import {assertOnlyDisposablePg18,withActualPg18SignedProof,
  syntheticCipherBytes,randomUUID} from "./b3c2r2_actual_schema_fixture.mjs";
import {signedToken,subject} from "../identity/fixtures.mjs";

const exact="postgresql://bridge_privproof_admin:bridge_privproof_only@127.0.0.1:5432/bridge_privproof";
const safeEnv={
  CI:"true",GITHUB_ACTIONS:"true",
  BRIDGE_B3C2R2_ACK:"disposable-actual-0008-pg18-only",
  BRIDGE_B3C2R2_PG_MAJOR:"18",
  BRIDGE_B3C2R2_TEST_DATABASE_URL:exact
};
const denied=e=>e?.code==="42501";
const count=async(c,table)=>(await c.query(
  "SELECT count(*)::int n FROM public."+table
)).rows[0].n;
async function insertFixture(admin,actor,room,connection,recipient){
  const mid=randomUUID(),cmid=randomUUID(),now=new Date();
  const blob=syntheticCipherBytes();
  await admin.query(
    "INSERT INTO public.bridge_v2_secure_messages "+
    "(id,conversation_id,sender_id,client_message_id,sequence_number,policy_version,accepted_at) "+
    "VALUES($1,$2,$3,$4,1,'bridge-v2',$5)",
    [mid,room,actor,cmid,now]);
  await admin.query(
    "INSERT INTO public.bridge_v2_secure_live "+
    "(message_id,ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
    "kek_id,kek_version,cipher_suite,aad_version) "+
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [mid,blob.ciphertext,blob.dataIv,blob.dataTag,blob.wrappedDek,
      blob.wrapIv,blob.wrapTag,blob.kekId,1,blob.cipherSuite,1]);
  const unread=syntheticCipherBytes();
  await admin.query(
    "INSERT INTO public.bridge_v2_secure_unread "+
    "(message_id,connection_id,recipient_id,accepted_at,expires_at,"+
    "ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
    "kek_id,kek_version,cipher_suite,aad_version) "+
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    [mid,connection,recipient,now,new Date(now.getTime()+7*86400000),
      unread.ciphertext,unread.dataIv,unread.dataTag,unread.wrappedDek,
      unread.wrapIv,unread.wrapTag,unread.kekId,1,unread.cipherSuite,1]);
  return mid;
}
test("R2-01 preflight refuses remote, wrong database/role, version, CI, wrong ACK",()=>{
  assert.equal(assertOnlyDisposablePg18(safeEnv),exact);
  for(const patch of [
    {CI:"false"},{GITHUB_ACTIONS:"false"},{BRIDGE_B3C2R2_ACK:"wrong"},
    {BRIDGE_B3C2R2_PG_MAJOR:"16"},{BRIDGE_B3C2R2_PG_MAJOR:""},
    {BRIDGE_B3C2R2_TEST_DATABASE_URL:exact.replace("127.0.0.1","ep.neon.tech")},
    {BRIDGE_B3C2R2_TEST_DATABASE_URL:exact.replace("bridge_privproof_admin","neondb_owner")},
    {BRIDGE_B3C2R2_TEST_DATABASE_URL:exact.replace("/bridge_privproof","/neondb")},
    {BRIDGE_B3C2R2_TEST_DATABASE_URL:exact+"?sslmode=require"}
  ])assert.throws(()=>assertOnlyDisposablePg18({...safeEnv,...patch}),
    /b3c2r2_environment_refused/);
});
test("R2-02 actual 0008 PG18 signed-user/nonowner RLS boundaries",async t=>{
  await withActualPg18SignedProof(async lab=>{
    const {admin,appClient,people,names,keys,secure,signedTransaction,schemaReceipt}=lab;
    const {a,b,c,ab,bc}=people;
    await t.test("R2-02/03 real 0001..0008 schema and RLS enabled; migrations ledger 5",async()=>{
      assert.equal(schemaReceipt.tables,37);
      assert.deepEqual(schemaReceipt.ledger,["0004","0005","0006","0007","0008"]);
      assert.equal(schemaReceipt.rlsTables,3);
      const role=(await appClient.query(
        "SELECT current_user usr,session_user sess,"+
        "r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,"+
        "r.rolinherit FROM pg_catalog.pg_roles r WHERE r.rolname=current_user"
      )).rows[0];
      assert.equal(role.usr,names.app);
      assert.equal(role.sess,names.app);
      for(const attr of ["rolsuper","rolbypassrls","rolcreaterole","rolcreatedb","rolinherit"])
        assert.equal(role[attr],false,attr);
    });
    await t.test("R2-04/05 role cannot read legacy body, identity, other schemas or signing key",async()=>{
      for(const table of ["bridge_messages","bridge_accounts","bridge_conversation_participants",
        "bridge_report_evidence","bridge_history_items"])
        await assert.rejects(appClient.query("SELECT * FROM public."+table+" LIMIT 1"),denied);
      await assert.rejects(appClient.query(
        "SELECT secret FROM "+names.schema+".signing_secret"),denied);
      await assert.rejects(appClient.query("SET ROLE "+names.migrator),denied);
      await assert.rejects(appClient.query(
        "ALTER TABLE public.bridge_v2_secure_live DISABLE ROW LEVEL SECURITY"),denied);
    });
    await t.test("R2-06 without signed context SELECT returns no ciphertext metadata",async()=>{
      for(const table of secure)assert.equal(await count(appClient,table),0);
      const id=(await appClient.query("SELECT "+names.schema+".verified_actor() actor")).rows[0].actor;
      assert.equal(id,null);
    });
    const seedAB=await insertFixture(admin,a,ab.roomId,ab.connectionId,b);
    const seedBC=await insertFixture(admin,b,bc.roomId,bc.connectionId,c);
    await t.test("R2-07 A token sees only A metadata and LIVE, not B unread or BC",async()=>{
      await signedTransaction(a,async client=>{
        assert.deepEqual((await client.query(
          "SELECT id FROM public.bridge_v2_secure_messages")).rows,[{id:seedAB}]);
        assert.deepEqual((await client.query(
          "SELECT message_id FROM public.bridge_v2_secure_live")).rows,[{message_id:seedAB}]);
        assert.equal(await count(client,"bridge_v2_secure_unread"),0);
        assert.equal((await client.query(
          "SELECT "+names.schema+".verified_actor() actor")).rows[0].actor,a);
      });
    });
    await t.test("R2-08 B token sees only B-sent LIVE and A-to-B unread",async()=>{
      await signedTransaction(b,async client=>{
        assert.deepEqual((await client.query(
          "SELECT id FROM public.bridge_v2_secure_messages")).rows,[{id:seedBC}]);
        assert.deepEqual((await client.query(
          "SELECT message_id FROM public.bridge_v2_secure_live")).rows,[{message_id:seedBC}]);
        assert.deepEqual((await client.query(
          "SELECT message_id FROM public.bridge_v2_secure_unread")).rows,[{message_id:seedAB}]);
      });
    });
    await t.test("R2-09 C sees unread only addressed to C and no A/B metadata",async()=>{
      await signedTransaction(c,async client=>{
        assert.equal(await count(client,"bridge_v2_secure_messages"),0);
        assert.equal(await count(client,"bridge_v2_secure_live"),0);
        assert.deepEqual((await client.query(
          "SELECT message_id FROM public.bridge_v2_secure_unread")).rows,[{message_id:seedBC}]);
      });
    });
    await t.test("R2-10 A is permitted a scoped metadata/LIVE/unread INSERT on actual 0008",async()=>{
      await signedTransaction(a,async client=>{
        const mid=randomUUID(), now=new Date(),blob=syntheticCipherBytes(),u=syntheticCipherBytes();
        const ins=await client.query(
          "INSERT INTO public.bridge_v2_secure_messages "+
          "(id,conversation_id,sender_id,client_message_id,sequence_number,policy_version,accepted_at) "+
          "VALUES($1,$2,$3,$4,2,'bridge-v2',$5)",
          [mid,ab.roomId,a,randomUUID(),now]);
        assert.equal(ins.rowCount,1);
        assert.equal((await client.query(
          "INSERT INTO public.bridge_v2_secure_live "+
          "(message_id,ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
          "kek_id,kek_version,cipher_suite,aad_version) "+
          "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [mid,blob.ciphertext,blob.dataIv,blob.dataTag,blob.wrappedDek,
            blob.wrapIv,blob.wrapTag,blob.kekId,1,blob.cipherSuite,1])).rowCount,1);
        assert.equal((await client.query(
          "INSERT INTO public.bridge_v2_secure_unread "+
          "(message_id,connection_id,recipient_id,accepted_at,expires_at,"+
          "ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
          "kek_id,kek_version,cipher_suite,aad_version) "+
          "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
          [mid,ab.connectionId,b,now,new Date(now.getTime()+7*86400000),
            u.ciphertext,u.dataIv,u.dataTag,u.wrappedDek,u.wrapIv,u.wrapTag,
            u.kekId,1,u.cipherSuite,1])).rowCount,1);
        assert.equal((await client.query(
          "SELECT count(*)::int n FROM public.bridge_v2_secure_messages")).rows[0].n,2);
      });
      assert.equal((await admin.query(
        "SELECT count(*)::int n FROM public.bridge_v2_secure_messages")).rows[0].n,2,
        "synthetic test transaction rolled back, leaving only seeded fixtures");
    });
    await t.test("R2-11 B cannot forge A sender, even in a valid B-signed transaction",async()=>{
      await signedTransaction(b,async client=>{
        await assert.rejects(client.query(
          "INSERT INTO public.bridge_v2_secure_messages "+
          "(id,conversation_id,sender_id,client_message_id,sequence_number,policy_version,accepted_at) "+
          "VALUES($1,$2,$3,$4,4,'bridge-v2',clock_timestamp())",
          [randomUUID(),ab.roomId,a,randomUUID()]),denied);
      });
    });
    await t.test("R2-12 arbitrary GUC tampering without MAC fails, no ciphertext",async()=>{
      await appClient.query("BEGIN");
      try {
        await appClient.query(
          "SELECT set_config('bridge.proof.actor',$1,true),"+
          "set_config('bridge.proof.expires',$2,true),"+
          "set_config('bridge.proof.mac',$3,true)",
          [a,String(Math.floor(Date.now()/1000)+20),"0".repeat(64)]);
        assert.equal((await appClient.query(
          "SELECT "+names.schema+".verified_actor() actor")).rows[0].actor,null);
        assert.equal(await count(appClient,"bridge_v2_secure_messages"),0);
      }finally{await appClient.query("ROLLBACK");}
    });
    await t.test("R2-13 changing signed actor context inside same transaction fails",async()=>{
      await signedTransaction(a,async(client,ctx)=>{
        assert.equal((await client.query(
          "SELECT "+names.schema+".verified_actor() actor")).rows[0].actor,a);
        await client.query("SELECT set_config('bridge.proof.actor',$1,true)",[b]);
        assert.equal((await client.query(
          "SELECT "+names.schema+".verified_actor() actor")).rows[0].actor,null);
        assert.equal(await count(client,"bridge_v2_secure_live"),0);
        await client.query("SELECT set_config('bridge.proof.actor',$1,true)",[ctx.actor]);
      });
    });
    await t.test("R2-14 signed context expires and cannot replay in another transaction",async()=>{
      let old;
      await signedTransaction(a,async(_client,ctx)=>{old=ctx;});
      await appClient.query("BEGIN");
      try {
        await appClient.query(
          "SELECT set_config('bridge.proof.actor',$1,true),"+
          "set_config('bridge.proof.expires',$2,true),"+
          "set_config('bridge.proof.mac',$3,true)",
          [old.actor,old.exp,old.mac]);
        assert.equal(await count(appClient,"bridge_v2_secure_messages"),0);
      }finally{await appClient.query("ROLLBACK");}
    });
    await t.test("R2-15 a mismatched/tampered JWT is denied BEFORE SQL context",async()=>{
      const signedA=signedToken(keys,{sub:subject(a)});
      await assert.rejects(signedTransaction(b,async()=>{},signedA),/jwt_subject_mismatch/);
      const altered=signedA.slice(0,-1)+(signedA.at(-1)==="A"?"B":"A");
      await assert.rejects(signedTransaction(a,async()=>{},altered),/invalid_jwt/);
      assert.equal(await count(appClient,"bridge_v2_secure_messages"),0);
    });
    await t.test("R2-16 original V1 body remains untouched and no dummy legacy row inserted",async()=>{
      assert.equal((await admin.query(
        "SELECT count(*)::int n FROM public.bridge_messages")).rows[0].n,0);
      assert.equal((await admin.query(
        "SELECT count(*)::int n FROM public.bridge_v2_secure_messages")).rows[0].n,2);
      assert.equal((await admin.query(
        "SELECT count(*)::int n FROM public.bridge_schema_migrations")).rows[0].n,5);
    });
  });
});
