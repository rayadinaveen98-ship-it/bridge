/**
 * B3c-2R2 — disconnected PG18 actual 0001..0008 and signed-actor RLS lab.
 * Never imported by HTTP; no Neon/Render data, roles or credentials.
 * SECURITY DEFINER and HMAC here are synthetic demonstration only, NOT a production policy.
 */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash,createHmac,randomBytes,randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import pg from "pg";
import {verifyBearer} from "../../../src/auth.mjs";
import {signedToken,subject,syntheticSigning} from "../identity/fixtures.mjs";

const ACK="disposable-actual-0008-pg18-only";
const DB="bridge_privproof";
const ADMIN="bridge_privproof_admin";
const PASSWORD="bridge_privproof_only";
const CONNECTION_STRING="postgresql://"+ADMIN+":"+PASSWORD+"@127.0.0.1:5432/"+DB;
const FILES=[
  "0001_bridge_foundation.sql","0002_message_outbox.sql","0003_lab_credentials.sql",
  "0004_v2_metadata.sql","0005_v2_delivery.sql","0006_v2_history.sql",
  "0007_v2_evidence_retention.sql","0008_v2_secure_messaging.sql"
];
const ROOT=new URL("../../../../../",import.meta.url);
const secure=["bridge_v2_secure_messages","bridge_v2_secure_live","bridge_v2_secure_unread"];
const testOnlyFailure=code=>new Error("b3c2r2_"+code);
export function assertOnlyDisposablePg18(env=process.env){
  if(env.CI!=="true"||env.GITHUB_ACTIONS!=="true"||
    env.BRIDGE_B3C2R2_ACK!==ACK||
    env.BRIDGE_B3C2R2_PG_MAJOR!=="18"||
    env.BRIDGE_B3C2R2_TEST_DATABASE_URL!==CONNECTION_STRING)
      throw testOnlyFailure("environment_refused");
  return CONNECTION_STRING;
}
async function verifyCluster(client){
  const identity=(await client.query(
    "SELECT current_database() db,current_user usr,session_user sess,"+
    "current_setting('server_version_num')::int version,pg_is_in_recovery() recovery,"+
    "system_identifier::text sid FROM pg_control_system()"
  )).rows[0];
  if(identity?.db!==DB||identity.usr!==ADMIN||identity.sess!==ADMIN||
    Math.trunc(identity.version/10000)!==18||identity.recovery!==false)
    throw testOnlyFailure("identity_refused");
  const attrs=(await client.query(
    "SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user"
  )).rows[0];
  if(attrs?.rolsuper!==true)throw testOnlyFailure("owner_refused");
  try {
    const ids=execFileSync("docker",
      ["ps","--filter","ancestor=postgres:18","--format","{{.ID}}"],
      {encoding:"utf8",timeout:5000}).trim().split(/\s+/).filter(Boolean);
    if(ids.length!==1||!/^[a-f0-9]{12,64}$/.test(ids[0]))throw Error("wrong container count");
    const independent=execFileSync("docker",
      ["exec",ids[0],"psql","-U",ADMIN,"-d",DB,"-X","-A","-t","-c",
       "SELECT system_identifier::text FROM pg_control_system()"],
      {encoding:"utf8",timeout:5000}).trim();
    if(!/^[0-9]{15,22}$/.test(independent)||independent!==identity.sid)
      throw Error("not the same disposable PG18 service");
  }catch{
    throw testOnlyFailure("disposable_cluster_not_attested");
  }
}
const cleanRole=id=>{
  if(!/^b3r2_[0-9a-f]{12}_(?:m|v|s)$/.test(id))
    throw testOnlyFailure("unsafe_role_identifier");
  return id;
};
async function login(role,password){
  const client=new pg.Client({
    host:"127.0.0.1",port:5432,database:DB,user:role,password,
    connectionTimeoutMillis:4000,
    application_name:"bridge_offline_pg18_signed_rls"
  });
  await client.connect();
  try {
    const who=(await client.query("SELECT current_user usr,session_user sess,current_database() db")).rows[0];
    assert.deepEqual(who,{usr:role,sess:role,db:DB});
    return client;
  }catch(e){await client.end();throw e;}
}
async function applyCheckedInMigrations(admin){
  const report=[];
  for(const name of FILES) {
    const raw=await readFile(new URL("database/migrations/"+name,ROOT),"utf8");
    const version=name.slice(0,4),checksum=createHash("sha256").update(raw).digest("hex");
    await admin.query("BEGIN");
    try {
      await admin.query(raw);
      if(Number(version)>=4)
        await admin.query(
          "INSERT INTO public.bridge_schema_migrations(version,checksum,runner_id) VALUES($1,$2,$3)",
          [version,checksum,"b3c2r2_disposable_pg18_only"]);
      await admin.query("COMMIT");
      report.push(version);
    }catch(e){await admin.query("ROLLBACK");throw e;}
  }
  const tables=(await admin.query(
    "SELECT count(*)::int n FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename LIKE 'bridge_%'"
  )).rows[0].n;
  const ledger=(await admin.query(
    "SELECT version FROM public.bridge_schema_migrations ORDER BY version"
  )).rows.map(x=>x.version);
  assert.equal(tables,37);
  assert.deepEqual(ledger,["0004","0005","0006","0007","0008"]);
  assert.deepEqual(report,["0001","0002","0003","0004","0005","0006","0007","0008"]);
  const state=(await admin.query(
    "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,"+
    "(SELECT count(*)::int FROM pg_catalog.pg_policies p "+
    "WHERE p.schemaname='public' AND p.tablename=c.relname) policies "+
    "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname",
    [secure]
  )).rows;
  assert.equal(state.length,3);
  for(const row of state){
    assert.equal(row.relrowsecurity,true);
    assert.equal(row.relforcerowsecurity,false);
    assert.equal(row.policies,0);
  }
  return Object.freeze({tables,ledger,rlsTables:state.length});
}
async function syntheticActors(admin){
  const ids=[randomUUID(),randomUUID(),randomUUID()];
  for(const id of ids)await admin.query(
    "INSERT INTO public.bridge_accounts (id,auth_subject,status,age_verified_at,safety_eligible) "+
    "VALUES($1,$2,'active',clock_timestamp(),true)",[id,subject(id)]
  );
  // A and B occupy direct session 1; B and C occupy a different direct session.
  async function pair(a,b){
    const sorted=[a,b].sort();
    const sourceId=randomUUID(),roomId=randomUUID(),connectionId=randomUUID();
    await admin.query("INSERT INTO public.bridge_conversations(id,kind,state) "+
      "VALUES($1,'random','open')",[sourceId]);
    await admin.query(
      "INSERT INTO public.bridge_connections(id,member_low,member_high,source_conversation_id) "+
      "VALUES($1,$2,$3,$4)",[connectionId,...sorted,sourceId]);
    await admin.query(
      "INSERT INTO public.bridge_conversations(id,kind,state,connection_id,"+
      "policy_version,v2_session_role) VALUES($1,'connection','open',$2,'bridge-v2','direct')",
      [roomId,connectionId]);
    for(const actor of [a,b])await admin.query(
      "INSERT INTO public.bridge_conversation_participants(conversation_id,account_id) "+
      "VALUES($1,$2)",[roomId,actor]);
    return Object.freeze({roomId,connectionId});
  }
  const ab=await pair(ids[0],ids[1]),bc=await pair(ids[1],ids[2]);
  return Object.freeze({a:ids[0],b:ids[1],c:ids[2],ab,bc});
}
function verifierFunction(schema){
  // This function's only privilege is access to a synthetic signing key in its
  // own private schema; never give it user-data write authority or other access.
  return [
    "CREATE FUNCTION "+schema+".verified_actor() RETURNS uuid",
    "LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $rpr$",
    "DECLARE a text; e text; m text; k bytea; raw text; expected text;",
    "BEGIN",
    " a:=pg_catalog.current_setting('bridge.proof.actor',true);",
    " e:=pg_catalog.current_setting('bridge.proof.expires',true);",
    " m:=pg_catalog.current_setting('bridge.proof.mac',true);",
    " IF a IS NULL OR a !~ '^[0-9a-f-]{36}$' OR",
    "    e IS NULL OR e !~ '^[0-9]{10}$' OR",
    "    m IS NULL OR m !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;",
    " IF e::bigint<=pg_catalog.date_part('epoch',pg_catalog.clock_timestamp())::bigint OR",
    "    e::bigint>pg_catalog.date_part('epoch',pg_catalog.clock_timestamp())::bigint+35",
    " THEN RETURN NULL; END IF;",
    " SELECT secret INTO k FROM "+schema+".signing_secret WHERE label='test-only';",
    " IF k IS NULL THEN RETURN NULL; END IF;",
    " raw:=a||'|'||pg_catalog.txid_current()::text||'|'||e||'|'||session_user;",
    " expected:=pg_catalog.encode(public.hmac(pg_catalog.convert_to(raw,'UTF8'),k,'sha256'),'hex');",
    " IF m<>expected THEN RETURN NULL; END IF;",
    " RETURN a::uuid;",
    "EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN",
    " RETURN NULL;",
    "END $rpr$"
  ].join(" ");
}
async function teardown(admin,names,created){
  const errors=[];
  if(created.app) {
    for(const [table,policies] of [
      ["bridge_v2_secure_messages",["b3r2_meta_read","b3r2_meta_write"]],
      ["bridge_v2_secure_live",["b3r2_live_read","b3r2_live_write"]],
      ["bridge_v2_secure_unread",["b3r2_unread_read","b3r2_unread_write"]]
    ])for(const name of policies)try{
      await admin.query("DROP POLICY IF EXISTS "+name+" ON public."+table);
    }catch{errors.push("policy");}
    for(const table of secure)try{
      await admin.query("REVOKE ALL ON TABLE public."+table+" FROM "+names.app);
    }catch{errors.push("grant");}
  }
  if(created.schema)try{await admin.query("DROP SCHEMA "+names.schema+" CASCADE");}
    catch{errors.push("schema");}
  for(const name of [created.app&&names.app,created.migrator&&names.migrator].filter(Boolean))
    try{await admin.query("DROP ROLE "+name);}catch{errors.push("role");}
  const rest=(await admin.query(
    "SELECT count(*)::int n FROM pg_catalog.pg_roles WHERE rolname LIKE 'b3r2_%'"
  )).rows[0].n;
  const schemas=(await admin.query(
    "SELECT count(*)::int n FROM pg_catalog.pg_namespace WHERE nspname LIKE 'b3r2_%'"
  )).rows[0].n;
  if(rest||schemas||errors.length)throw testOnlyFailure("teardown_not_clean");
}
export async function withActualPg18SignedProof(work){
  const url=assertOnlyDisposablePg18(); // before connection or schema/role actions
  const admin=new pg.Client({
    connectionString:url,connectionTimeoutMillis:5000,
    application_name:"bridge_offline_actual_0008_pg18_admin"
  });
  await admin.connect();
  const stem="b3r2_"+randomBytes(6).toString("hex")+"_";
  const names=Object.freeze({
    migrator:cleanRole(stem+"m"),app:cleanRole(stem+"v"),schema:cleanRole(stem+"s")
  });
  const credentials={migrator:randomBytes(24).toString("hex"),
    app:randomBytes(24).toString("hex")};
  const secret=randomBytes(32),created={migrator:false,app:false,schema:false};
  let appClient=null;
  try{
    await verifyCluster(admin);
    const before=(await admin.query(
      "SELECT count(*)::int n FROM pg_catalog.pg_tables "+
      "WHERE schemaname='public' AND tablename LIKE 'bridge_%'"
    )).rows[0].n;
    if(before!==0)throw testOnlyFailure("nonempty_disposable_database_refused");
    const schemaReceipt=await applyCheckedInMigrations(admin);
    const people=await syntheticActors(admin);
    // The actions below are allowed ONLY after strict URL + independent PG18 attestation.
    await admin.query("CREATE ROLE "+names.migrator+" LOGIN NOINHERIT NOSUPERUSER "+
      "NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+
      credentials.migrator+"'");
    created.migrator=true;
    await admin.query("CREATE ROLE "+names.app+" LOGIN NOINHERIT NOSUPERUSER "+
      "NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+
      credentials.app+"'");
    created.app=true;
    await admin.query("CREATE SCHEMA "+names.schema+" AUTHORIZATION "+names.migrator);
    created.schema=true;
    const owner=await login(names.migrator,credentials.migrator);
    try{
      await owner.query("BEGIN");
      try {
        await owner.query("CREATE TABLE "+names.schema+
          ".signing_secret(label text PRIMARY KEY,secret bytea NOT NULL)");
        await owner.query(
          "INSERT INTO "+names.schema+".signing_secret(label,secret) VALUES('test-only',$1)",
          [secret]);
        await owner.query(verifierFunction(names.schema));
        await owner.query("REVOKE ALL ON FUNCTION "+names.schema+".verified_actor() FROM PUBLIC");
        await owner.query("GRANT USAGE ON SCHEMA "+names.schema+" TO "+names.app);
        await owner.query("GRANT EXECUTE ON FUNCTION "+names.schema+".verified_actor() TO "+names.app);
        await owner.query("COMMIT");
      }catch(e){await owner.query("ROLLBACK");throw e;}
    }finally{await owner.end();}
    for(const name of secure)await admin.query(
      "GRANT SELECT,INSERT ON TABLE public."+name+" TO "+names.app
    );
    await admin.query("CREATE POLICY b3r2_meta_read ON public.bridge_v2_secure_messages "+
      "FOR SELECT TO "+names.app+" USING(sender_id="+names.schema+".verified_actor())");
    await admin.query("CREATE POLICY b3r2_meta_write ON public.bridge_v2_secure_messages "+
      "FOR INSERT TO "+names.app+" WITH CHECK(sender_id="+names.schema+".verified_actor())");
    const own="EXISTS(SELECT 1 FROM public.bridge_v2_secure_messages m "+
      "WHERE m.id=message_id AND m.sender_id="+names.schema+".verified_actor())";
    await admin.query("CREATE POLICY b3r2_live_read ON public.bridge_v2_secure_live "+
      "FOR SELECT TO "+names.app+" USING("+own+")");
    await admin.query("CREATE POLICY b3r2_live_write ON public.bridge_v2_secure_live "+
      "FOR INSERT TO "+names.app+" WITH CHECK("+own+")");
    await admin.query("CREATE POLICY b3r2_unread_read ON public.bridge_v2_secure_unread "+
      "FOR SELECT TO "+names.app+" USING(recipient_id="+names.schema+".verified_actor() "+
      "AND state='unread' AND expires_at>clock_timestamp())");
    await admin.query("CREATE POLICY b3r2_unread_write ON public.bridge_v2_secure_unread "+
      "FOR INSERT TO "+names.app+" WITH CHECK(recipient_id<>"+
      names.schema+".verified_actor() AND "+own+")");
    appClient=await login(names.app,credentials.app);
    const keys=syntheticSigning();
    async function signedTransaction(actor,callback,token=signedToken(keys,{sub:subject(actor)})){
      let auth;
      try{auth=verifyBearer(token,keys.authentication);}
      catch{throw testOnlyFailure("invalid_jwt");}
      if(auth.subject!==subject(actor))throw testOnlyFailure("jwt_subject_mismatch");
      await appClient.query("BEGIN");
      try{
        const tx=(await appClient.query(
          "SELECT pg_catalog.txid_current()::text tx,"+
          "floor(extract(epoch from clock_timestamp()))::bigint epoch,current_user usr"
        )).rows[0];
        assert.equal(tx.usr,names.app);
        const exp=String(Math.min(auth.expiresAt,Number(tx.epoch)+25));
        const payload=actor+"|"+tx.tx+"|"+exp+"|"+names.app;
        const mac=createHmac("sha256",secret).update(payload).digest("hex");
        await appClient.query(
          "SELECT set_config('bridge.proof.actor',$1,true),"+
          "set_config('bridge.proof.expires',$2,true),"+
          "set_config('bridge.proof.mac',$3,true)",
          [actor,exp,mac]
        );
        return await callback(appClient,{actor,exp,mac,tx:tx.tx});
      }finally{await appClient.query("ROLLBACK");}
    }
    return await work(Object.freeze({admin,appClient,people,names,
      schemaReceipt,keys,signedTransaction,secure}));
  }finally{
    if(appClient)try{await appClient.end();}catch{/* propagate teardown failures separately */}
    try{await teardown(admin,names,created);}finally{await admin.end();}
    secret.fill(0);
  }
}
export function syntheticCipherBytes(){
  return {ciphertext:Buffer.from("synthetic-shaped-not-actually-encrypted"),
    dataIv:randomBytes(12),dataTag:randomBytes(16),wrappedDek:randomBytes(32),
    wrapIv:randomBytes(12),wrapTag:randomBytes(16),kekId:"proof-only-"+randomUUID(),
    kekVersion:1,cipherSuite:"aes-256-gcm-v1",aadVersion:1};
}
export {randomUUID};
