/**
 * B3c-2R3B-2A, disposable PG18 trust-boundary feasibility lab only.
 * All database DDL is behind the attested existing 0001..0008 PG18 fixture.
 * No hosted DSN, production HTTP import, live credentials or role migration.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createHash,createHmac,randomBytes,randomUUID} from "node:crypto";
import pg from "pg";
import {verifyBearer} from "../../../src/auth.mjs";
import {signedToken,subject} from "../identity/fixtures.mjs";
import {withActualPg18SignedProof,assertOnlyDisposablePg18}
  from "../privileges/b3c2r2_actual_schema_fixture.mjs";
import {actorAndRoleChecks} from "./actor_and_role.test.mjs";
import {capabilityChecks} from "./capability_adversarial.test.mjs";
import {legacyWriterChecks} from "./legacy_writer_races.test.mjs";

const ACK="bridge-b3c2r3b2a-disposable-only";
const URI="postgresql://bridge_privproof_admin:bridge_privproof_only@127.0.0.1:5432/bridge_privproof";
const SHA_EMPTY=createHash("sha256").update("").digest("hex");
const secureTables=["bridge_v2_secure_messages","bridge_v2_secure_live","bridge_v2_secure_unread"];
const contextTables=["bridge_accounts","bridge_blocks","bridge_conversations",
  "bridge_connections","bridge_conversation_participants","bridge_v2_direct_sessions"];
export const refused=e=>e?.code==="42501";
export function assertTrustEnvironment(env=process.env){
  assert.equal(env.BRIDGE_B3C2R3B2A_ACK,ACK,"2A explicit disposable-only ACK required");
  assert.equal(env.BRIDGE_B3C2R3B2A_TEST_DATABASE_URL,URI);
  assert.equal(env.BRIDGE_B3C2R3B2A_PG_MAJOR,"18");
  return assertOnlyDisposablePg18(env);
}
function checkedName(value){
  assert.match(value,/^tb_[0-9a-f]{12}_(?:runtime|issuer|actor|exec|migrator|key|cmd)$/);
  return value;
}
function verifyFunction(schema,role){
  return "CREATE FUNCTION "+schema+".verify(actor uuid,operation text,target uuid,"+
    "recipient uuid,digest text,nonce text,expiry bigint,tx text,mac text) "+
    "RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER "+
    "SET search_path=pg_catalog AS $verify$ "+
    "DECLARE k bytea; expected text; epoch bigint; used integer; body text; "+
    "BEGIN "+
    "IF session_user<>'"+role+"' OR actor IS NULL OR target IS NULL OR "+
    "operation IS NULL OR digest IS NULL OR nonce !~ '^[a-f0-9]{32}$' "+
    "OR mac !~ '^[a-f0-9]{64}$' OR tx<>pg_catalog.txid_current()::text "+
    "THEN RETURN false; END IF; "+
    "epoch:=pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()))::bigint; "+
    "IF expiry IS NULL OR expiry<=epoch OR expiry>epoch+26 THEN RETURN false; END IF; "+
    "SELECT secret INTO k FROM "+schema+".private_key WHERE id=1; "+
    "IF k IS NULL THEN RETURN false; END IF; "+
    "body:=actor::text||'|'||operation||'|'||target::text||'|'||"+
    "coalesce(recipient::text,'')||'|'||digest||'|'||nonce||'|'||expiry::text||"+
    "'|'||tx||'|'||session_user; "+
    "expected:=pg_catalog.encode(public.hmac(pg_catalog.convert_to(body,'UTF8'),k,'sha256'),'hex'); "+
    "IF expected<>mac THEN RETURN false; END IF; "+
    "INSERT INTO "+schema+".consumed_nonce(nonce) VALUES(nonce) ON CONFLICT DO NOTHING; "+
    "GET DIAGNOSTICS used = ROW_COUNT; "+
    "RETURN used=1; "+
    "EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false; "+
    "END $verify$";
}
function commandFunction(cmd,keys,roles){
  return "CREATE FUNCTION "+cmd+".inspect(actor uuid,operation text,target uuid,"+
    "recipient uuid,digest text,nonce text,expiry bigint,tx text,mac text) "+
    "RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER "+
    "SET search_path=pg_catalog AS $inspect$ "+
    "DECLARE room record; relation record; members uuid[]; n integer; total integer; "+
    "BEGIN "+
    "IF session_user<>'"+roles.runtime+"' OR current_user<>'"+roles.exec+"' "+
    "THEN RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='42501'; END IF; "+
    "PERFORM pg_catalog.pg_advisory_xact_lock(714411); "+
    "IF NOT "+keys+".verify(actor,operation,target,recipient,digest,nonce,expiry,tx,mac) "+
    "OR operation<>'inspect' OR recipient IS NOT NULL OR digest<>'"+SHA_EMPTY+"' "+
    "THEN RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='42501'; END IF; "+
    "SELECT kind,state,policy_version,v2_session_role,legacy_qa,connection_id,idle_expires_at "+
    "INTO room FROM public.bridge_conversations WHERE id=target; "+
    "IF NOT FOUND OR room.kind<>'connection' OR room.state<>'open' "+
    "OR room.policy_version<>'bridge-v2' OR room.v2_session_role<>'direct' "+
    "OR room.legacy_qa IS DISTINCT FROM false OR room.connection_id IS NULL "+
    "OR room.idle_expires_at<=pg_catalog.clock_timestamp() "+
    "THEN RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='42501'; END IF; "+
    "SELECT member_low,member_high,ended_at,policy_version INTO relation "+
    "FROM public.bridge_connections WHERE id=room.connection_id; "+
    "IF NOT FOUND OR relation.ended_at IS NOT NULL OR relation.policy_version<>'bridge-v2' "+
    "THEN RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='42501'; END IF; "+
    "SELECT pg_catalog.array_agg(account_id ORDER BY account_id),pg_catalog.count(*)::int "+
    "INTO members,n FROM public.bridge_conversation_participants "+
    "WHERE conversation_id=target AND left_at IS NULL; "+
    "IF n<>2 OR actor<>ALL(members) AND NOT actor=ANY(members) OR "+
    "members[1]<>relation.member_low OR members[2]<>relation.member_high "+
    "THEN RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='42501'; END IF; "+
    "SELECT pg_catalog.count(*)::int INTO n FROM public.bridge_accounts "+
    "WHERE id=ANY(members) AND status='active' AND age_verified_at IS NOT NULL "+
    "AND safety_eligible IS TRUE AND deleted_at IS NULL; "+
    "IF n<>2 OR EXISTS(SELECT 1 FROM public.bridge_blocks WHERE "+
    "(blocker_id=members[1] AND blocked_id=members[2]) OR "+
    "(blocker_id=members[2] AND blocked_id=members[1])) "+
    "OR NOT EXISTS(SELECT 1 FROM public.bridge_v2_direct_sessions "+
    "WHERE conversation_id=target AND connection_id=room.connection_id "+
    "AND state='open' AND policy_version='bridge-v2') "+
    "THEN RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='42501'; END IF; "+
    "PERFORM pg_catalog.set_config('bridge.tb.room',target::text,true); "+
    "SELECT pg_catalog.count(*)::int INTO total FROM public.bridge_v2_secure_messages "+
    "WHERE conversation_id=target; "+
    "RETURN total; "+
    "END $inspect$";
}
async function asRole(admin,role,sql,params=[]){
  await admin.query("SET ROLE "+role);
  try{return await admin.query(sql,params);}
  finally{await admin.query("RESET ROLE");}
}
async function connectRole(name,password){
  const client=new pg.Client({host:"127.0.0.1",port:5432,database:"bridge_privproof",
    user:name,password,connectionTimeoutMillis:4000,statement_timeout:8000,query_timeout:12000,
    application_name:"b3c2r3b2a_disposable_only"});
  await client.connect();
  assert.deepEqual((await client.query("SELECT current_user usr,session_user sess")).rows[0],
    {usr:name,sess:name});
  return client;
}
export async function withTrustFixture(work){
  assertTrustEnvironment();
  return withActualPg18SignedProof(async prior=>{
    const {admin,people,schemaReceipt,keys}=prior;
    await admin.query("SET statement_timeout = '8000ms'");
    await admin.query("SET lock_timeout = '5000ms'");
    assert.equal(schemaReceipt.tables,37);
    assert.equal(schemaReceipt.rlsTables,3);
    const stem="tb_"+randomBytes(6).toString("hex")+"_";
    const roles=Object.freeze({runtime:checkedName(stem+"runtime"),
      issuer:checkedName(stem+"issuer"),actor:checkedName(stem+"actor"),
      exec:checkedName(stem+"exec"),migrator:checkedName(stem+"migrator")});
    const schemas=Object.freeze({key:checkedName(stem+"key"),cmd:checkedName(stem+"cmd")});
    const passwords=Object.fromEntries(["runtime","issuer","actor","migrator"]
      .map(x=>[x,randomBytes(24).toString("hex")]));
    const k=randomBytes(32), clients={},created=[],policyNames=[];
    try {
      // Real independently logged-in roles; no SET ROLE masquerading as the runtime.
      for(const name of ["runtime","issuer","actor","exec","migrator"]){
        const ident=roles[name],login=name!=="exec";
        await admin.query("CREATE ROLE "+ident+" "+(login?"LOGIN":"NOLOGIN")+
          " NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION"+
          (login?" PASSWORD '"+passwords[name]+"'":""));
        created.push(ident);
      }
      await admin.query("CREATE SCHEMA "+schemas.key+" AUTHORIZATION "+roles.issuer);
      await admin.query("CREATE SCHEMA "+schemas.cmd+" AUTHORIZATION "+roles.migrator);
      await asRole(admin,roles.issuer,"CREATE TABLE "+schemas.key+
        ".private_key(id integer PRIMARY KEY,secret bytea NOT NULL)");
      await asRole(admin,roles.issuer,"CREATE TABLE "+schemas.key+
        ".consumed_nonce(nonce text PRIMARY KEY)");
      await asRole(admin,roles.issuer,"INSERT INTO "+schemas.key+".private_key VALUES(1,$1)",[k]);
      await asRole(admin,roles.issuer,verifyFunction(schemas.key,roles.runtime));
      const sig=schemaSignature(schemas.key);
      await admin.query("REVOKE ALL ON FUNCTION "+sig+" FROM PUBLIC");
      await admin.query("GRANT USAGE ON SCHEMA "+schemas.key+" TO "+roles.exec);
      await admin.query("GRANT EXECUTE ON FUNCTION "+sig+" TO "+roles.exec);
      await admin.query("GRANT USAGE,CREATE ON SCHEMA "+schemas.cmd+" TO "+roles.exec);
      await admin.query("GRANT USAGE ON SCHEMA "+schemas.cmd+" TO "+roles.runtime);
      for(const table of contextTables){
        const ident="tb_ctx_"+table.replace("bridge_","").replace("v2_","").slice(0,20);
        await admin.query("GRANT SELECT ON public."+table+" TO "+roles.exec);
        await admin.query("CREATE POLICY "+ident+" ON public."+table+
          " FOR SELECT TO "+roles.exec+" USING(true)");
        policyNames.push({table,name:ident});
      }
      await admin.query("GRANT SELECT ON public.bridge_v2_secure_messages TO "+roles.exec);
      await admin.query("CREATE POLICY tb_meta_room ON public.bridge_v2_secure_messages "+
        "FOR SELECT TO "+roles.exec+
        " USING(conversation_id=NULLIF(pg_catalog.current_setting('bridge.tb.room',true),'')::uuid)");
      policyNames.push({table:"bridge_v2_secure_messages",name:"tb_meta_room"});
      await asRole(admin,roles.exec,commandFunction(schemas.cmd,schemas.key,roles));
      const command=schemas.cmd+".inspect(uuid,text,uuid,uuid,text,text,bigint,text,text)";
      await admin.query("REVOKE ALL ON FUNCTION "+command+" FROM PUBLIC");
      await admin.query("GRANT EXECUTE ON FUNCTION "+command+" TO "+roles.runtime);
      for(const p of ["runtime","issuer","actor","migrator"])
        clients[p]=await connectRole(roles[p],passwords[p]);
      // Populate real checked-in 0008 metadata only; no actual user content.
      for(const [pair,author] of [[people.ab,people.a],[people.bc,people.b]]){
        await admin.query("UPDATE public.bridge_conversations SET "+
          "legacy_qa=false,last_accepted_at=clock_timestamp(),"+
          "idle_expires_at=clock_timestamp()+interval '30 minutes' WHERE id=$1",[pair.roomId]);
        await admin.query("UPDATE public.bridge_connections SET policy_version='bridge-v2' "+
          "WHERE id=$1",[pair.connectionId]);
        await admin.query("INSERT INTO public.bridge_v2_direct_sessions "+
          "(conversation_id,connection_id,state,policy_version,opened_at) "+
          "VALUES($1,$2,'open','bridge-v2',clock_timestamp())",
          [pair.roomId,pair.connectionId]);
        await admin.query("INSERT INTO public.bridge_v2_secure_messages "+
          "(id,conversation_id,sender_id,client_message_id,sequence_number,policy_version,accepted_at) "+
          "VALUES($1,$2,$3,$4,1,'bridge-v2',clock_timestamp())",
          [randomUUID(),pair.roomId,author,randomUUID()]);
      }
      const call=async(client,cap)=>{
        await client.query("SAVEPOINT tb_attempt");
        try{
          const params=[cap.actor,cap.operation,cap.target,cap.recipient,
            cap.digest,cap.nonce,cap.expiry,cap.tx,cap.mac];
          const q=await client.query("SELECT "+schemas.cmd+
            ".inspect($1::uuid,$2::text,$3::uuid,$4::uuid,$5::text,$6::text,"+
            "$7::bigint,$8::text,$9::text) AS count",params);
          await client.query("RELEASE SAVEPOINT tb_attempt");
          return q.rows[0].count;
        }catch(e){
          await client.query("ROLLBACK TO SAVEPOINT tb_attempt");
          await client.query("RELEASE SAVEPOINT tb_attempt");
          throw e;
        }
      };
      const withTx=async fn=>{
        const c=clients.runtime;
        await c.query("BEGIN");
        try {
          const row=(await c.query("SELECT pg_catalog.txid_current()::text tx,"+
            "floor(extract(epoch from clock_timestamp()))::bigint epoch")).rows[0];
          const issue=({actor=people.a,operation="inspect",target=people.ab.roomId,
            recipient=null,digest=SHA_EMPTY,nonce=randomBytes(16).toString("hex"),
            expiry=Number(row.epoch)+20,token=signedToken(keys,{sub:subject(actor)})}={})=>{
            const auth=verifyBearer(token,keys.authentication);
            assert.equal(auth.subject,subject(actor));
            const body=[actor,operation,target,recipient??"",digest,nonce,expiry,row.tx,
              roles.runtime].join("|");
            const mac=createHmac("sha256",k).update(body).digest("hex");
            return {actor,operation,target,recipient,digest,nonce,expiry,tx:row.tx,mac};
          };
          return await fn({client:c,issue,call,tx:row.tx,epoch:Number(row.epoch)});
        } finally {await c.query("ROLLBACK");}
      };
      await work(Object.freeze({admin,clients,roles,schemas,people,keys,call,withTx,
        shaEmpty:SHA_EMPTY,secureTables,schemaReceipt}));
    }finally{
      for(const c of Object.values(clients))try{await c.end();}catch{}
      for(const p of policyNames.reverse())try{
        await admin.query("DROP POLICY IF EXISTS "+p.name+" ON public."+p.table);
      }catch{}
      for(const table of [...contextTables,"bridge_v2_secure_messages"])try{
        await admin.query("REVOKE ALL ON TABLE public."+table+" FROM "+roles.exec);
      }catch{}
      for(const schema of [schemas.cmd,schemas.key])try{
        await admin.query("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
      }catch{}
      if(created.length){
        try{await admin.query("DROP OWNED BY "+created.join(",")+" CASCADE");}catch{}
        for(const role of created.reverse())try{await admin.query("DROP ROLE "+role);}catch{}
      }
      k.fill(0);
      const remnants=(await admin.query(
        "SELECT count(*)::int n FROM pg_catalog.pg_roles WHERE rolname LIKE $1",
        [stem+"%"])).rows[0].n;
      assert.equal(remnants,0,"test roles must be fully removed");
    }
  });
}
function schemaSignature(schema){
  return schema+".verify(uuid,text,uuid,uuid,text,text,bigint,text,text)";
}

test("TB-00: reject any non-attested/remote/missing ACK configuration",()=>{
  const env={CI:"true",GITHUB_ACTIONS:"true",BRIDGE_B3C2R2_ACK:"disposable-actual-0008-pg18-only",
    BRIDGE_B3C2R2_PG_MAJOR:"18",BRIDGE_B3C2R2_TEST_DATABASE_URL:URI,
    BRIDGE_B3C2R3B2A_ACK:ACK,BRIDGE_B3C2R3B2A_PG_MAJOR:"18",
    BRIDGE_B3C2R3B2A_TEST_DATABASE_URL:URI};
  assert.equal(assertTrustEnvironment(env),URI);
  for(const change of [
    {BRIDGE_B3C2R3B2A_ACK:""},
    {BRIDGE_B3C2R3B2A_TEST_DATABASE_URL:URI.replace("127.0.0.1","ep.example.neon.tech")},
    {BRIDGE_B3C2R3B2A_PG_MAJOR:"16"},
    {GITHUB_ACTIONS:"false"},
    {BRIDGE_B3C2R2_ACK:""},
  ])assert.throws(()=>assertTrustEnvironment({...env,...change}));
});
test("TB-01: independently logged-in nonowner command and documented negative controls",
  {timeout:90000},async t=>{
  await withTrustFixture(async lab=>{
    await actorAndRoleChecks(t,lab);
    await capabilityChecks(t,lab);
    await legacyWriterChecks(t,lab);
  });
});
