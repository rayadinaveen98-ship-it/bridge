/**
 * Bridge B3c-1: disposable CI-only PostgreSQL16 independent LOGIN adversary.
 * NO production URL, no Neon/Render connection, no application-code imports.
 * All role/schema DDL is guarded by two explicit ACKs and GitHub Actions CI.
 */
import {createHash,randomBytes} from "node:crypto";
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import pg from "pg";
import {digestSql} from "../migrations/runner.mjs";

export const secureTables=Object.freeze([
  "bridge_v2_secure_messages","bridge_v2_secure_live","bridge_v2_secure_unread"
]);
const ACK="disposable-bridge_test-only";
const DDL_ACK="disposable-pg16-service-role-ddl";
const SAFE=/^b3c1_[a-f0-9]{12}(?:_[aog])?$/;
const SQL_SRC=new URL("../../../../../database/migrations/0008_v2_secure_messaging.sql",import.meta.url);
export const refused=()=>new Error("b3c1_disposable_environment_required");
export const sqlState=(code)=>(e)=>e?.code===code;

function validateName(name){
  if(typeof name!=="string"||!SAFE.test(name))throw refused();
  return name;
}
export function validateEnvironment({
  url=process.env.BRIDGE_TEST_DATABASE_URL,
  acknowledgment=process.env.BRIDGE_TEST_MIGRATION_ACK,
  roleAcknowledgment=process.env.BRIDGE_B3C1_ROLE_TEST_ACK,
  ci=process.env.CI,actions=process.env.GITHUB_ACTIONS
}={}){
  if(ci!=="true"||actions!=="true"||
    acknowledgment!==ACK||roleAcknowledgment!==DDL_ACK||
    typeof url!=="string")throw refused();
  let parsed;
  try{parsed=new URL(url);}catch{throw refused();}
  if(!["postgres:","postgresql:"].includes(parsed.protocol)||
    !["127.0.0.1","localhost"].includes(parsed.hostname)||
    parsed.pathname!=="/bridge_test"||parsed.username!=="bridge_test"||
    parsed.password!=="bridge_test_only"||
    !["","5432"].includes(parsed.port)||parsed.search||parsed.hash)throw refused();
  return Object.freeze({url,hostname:parsed.hostname});
}
function confirmedCiDockerServiceAddress(host){
  if(typeof host!=="string"||!host||host.length>48)return false;
  // Docker port publishing maps caller 127.0.0.1 to a PG service with a
  // distinct bridge IP. Authenticate the actual server IP against the single
  // GitHub Actions postgres:16 service container instead of trusting RFC1918.
  try{
    const ids=execFileSync("docker",
      ["ps","--filter","ancestor=postgres:16","--format","{{.ID}}"],
      {encoding:"utf8",timeout:4000}).trim().split(/\s+/).filter(Boolean);
    if(ids.length!==1||!/^[a-f0-9]{12,64}$/.test(ids[0]))return false;
    const ips=execFileSync("docker",
      ["inspect","--format",
       "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}",ids[0]],
      {encoding:"utf8",timeout:4000}).trim().split(/\s+/).filter(Boolean);
    return ips.length>=1&&ips.includes(host);
  }catch{return false;}
}
async function assertConnectedOwner(admin,conf){
  const v=(await admin.query(
    "SELECT current_database() db,current_user usr,session_user sess,"+
    "inet_server_addr()::text host,current_setting('server_version_num')::integer version,"+
    "pg_is_in_recovery() recovery"
  )).rows[0];
  const role=(await admin.query(
    "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user"
  )).rows[0];
  if(v?.db!=="bridge_test"||v.usr!=="bridge_test"||v.sess!=="bridge_test")
    throw Error("b3c1_preflight_identity_mismatch");
  if(!confirmedCiDockerServiceAddress(v.host))
    throw Error("b3c1_preflight_pg16_service_attestation_failed");
  if(Math.floor(v.version/10000)!==16||v.recovery!==false)
    throw Error("b3c1_preflight_pg16_or_recovery_mismatch");
  if(role?.rolsuper!==true)
    throw Error("b3c1_preflight_ci_fixture_admin_missing");
  const source=await readFile(SQL_SRC,"utf8");
  const recorded=(await admin.query(
    "SELECT trim(checksum) checksum FROM bridge_schema_migrations WHERE version='0008'"
  )).rows;
  if(recorded.length!==1||recorded[0].checksum!==digestSql(source))throw refused();
  const tables=(await admin.query(
    "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,"+
    "pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n "+
    "ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relkind='r' "+
    "AND c.relname=ANY($1::text[]) ORDER BY c.relname",
    [secureTables]
  )).rows;
  if(tables.length!==3||tables.some(t=>!t.relrowsecurity||
    t.relforcerowsecurity||t.owner!=="bridge_test"))throw refused();
  return conf;
}
function sha(rows){return createHash("sha256").update(JSON.stringify(rows)).digest("hex");}
export async function baseline(admin){
  const result={};
  result.legacy=sha((await admin.query(
    "SELECT id,conversation_id,sender_id,client_message_id,sequence_number,body,sent_at "+
    "FROM bridge_messages ORDER BY id"
  )).rows);
  result.slots=sha((await admin.query(
    "SELECT account_id,match_session_id,claimed_at FROM bridge_active_match_slots ORDER BY account_id"
  )).rows);
  result.ledger=sha((await admin.query(
    "SELECT version,trim(checksum) checksum,runner_id FROM bridge_schema_migrations ORDER BY version"
  )).rows);
  result.catalog=sha((await admin.query(
    "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,"+
    "pg_get_userbyid(c.relowner) owner,"+
    "(SELECT jsonb_agg(jsonb_build_object('grantee',a.grantee,'grantor',a.grantor,"+
    "'priv',a.privilege_type,'grantable',a.is_grantable) ORDER BY "+
    "a.grantee,a.grantor,a.privilege_type) FROM "+
    "aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a) acl,"+
    "(SELECT count(*)::int FROM pg_policies p "+
    "WHERE p.schemaname='public' AND p.tablename=c.relname) policies "+
    "FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid "+
    "WHERE n.nspname='public' AND c.relkind='r' "+
    "AND c.relname=ANY($1::text[]) ORDER BY c.relname",[secureTables]
  )).rows);
  result.tables=Number((await admin.query(
    "SELECT count(*)::int n FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'bridge_%'"
  )).rows[0].n);
  result.roleNames=(await admin.query(
    "SELECT rolname FROM pg_roles WHERE rolname LIKE 'b3c1_%' ORDER BY rolname"
  )).rows.map(x=>x.rolname);
  result.schemas=(await admin.query(
    "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'b3c1_%' ORDER BY nspname"
  )).rows.map(x=>x.nspname);
  if(result.tables!==37||result.roleNames.length||result.schemas.length)throw refused();
  return Object.freeze(result);
}
async function login(conf,user,password){
  const client=new pg.Client({
    host:conf.hostname,port:5432,database:"bridge_test",
    user,password,connectionTimeoutMillis:3000,
    application_name:"bridge_b3c1_disposable_ci_only"
  });
  await client.connect();
  const actual=(await client.query(
    "SELECT current_user usr,session_user sess,current_database() db"
  )).rows[0];
  if(actual?.usr!==user||actual.sess!==user||actual.db!=="bridge_test"){
    await client.end();throw refused();
  }
  return client;
}
export async function withRoleLab(work){
  const conf=validateEnvironment(); // before any connection
  const admin=new pg.Client({
    connectionString:conf.url,connectionTimeoutMillis:3000,
    application_name:"bridge_b3c1_guarded_role_lab"
  });
  await admin.connect();
  let owner=null,actor=null,created=false,previous,cleanupError=null;
  const stem=validateName("b3c1_"+randomBytes(6).toString("hex"));
  const names=Object.freeze({
    schema:stem,owner:validateName(stem+"_o"),
    actor:validateName(stem+"_a"),group:validateName(stem+"_g")
  });
  const passwords=Object.freeze({
    owner:randomBytes(24).toString("hex"),actor:randomBytes(24).toString("hex")
  });
  const originalQuery=admin.query.bind(admin);
  try{
    await assertConnectedOwner(admin,conf);
    previous=await baseline(admin);
    // Only generated safe identifier and synthetic hex password are interpolated.
    await originalQuery(
      "CREATE ROLE "+names.owner+" LOGIN NOSUPERUSER NOBYPASSRLS "+
      "NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+passwords.owner+"'"
    );
    created=true;
    await originalQuery("CREATE ROLE "+names.actor+" LOGIN NOSUPERUSER "+
      "NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+
      passwords.actor+"'");
    await originalQuery("CREATE ROLE "+names.group+" NOLOGIN NOSUPERUSER "+
      "NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION");
    await originalQuery("CREATE SCHEMA "+names.schema+" AUTHORIZATION "+names.owner);
    owner=await login(conf,names.owner,passwords.owner);
    actor=await login(conf,names.actor,passwords.actor);
    // No human-supplied callbacks/identifiers are ever passed from HTTP.
    return await work(Object.freeze({admin,owner,actor,names,secureTables}));
  }finally{
    // Never silently hide a teardown failure; safely try all remaining steps.
    for(const c of [actor,owner])if(c){
      try{await c.query("ROLLBACK");}catch{} // cleans open fixture transactions
      try{await c.end();}catch(e){cleanupError??=e;}
    }
    if(created){
      const steps=[
        "REVOKE ALL PRIVILEGES ON TABLE "+secureTables.map(x=>"public."+x).join(",")+
          " FROM "+[names.owner,names.actor,names.group].join(","),
        "REVOKE "+names.group+" FROM "+names.actor,
        "DROP SCHEMA IF EXISTS "+names.schema+" CASCADE",
        "DROP ROLE IF EXISTS "+names.actor,
        "DROP ROLE IF EXISTS "+names.group,
        "DROP ROLE IF EXISTS "+names.owner
      ];
      for(const statement of steps)try{await originalQuery(statement);}
      catch(e){cleanupError??=e;}
    }
    if(previous)try{
      const after=await baseline(admin);
      if(JSON.stringify(after)!==JSON.stringify(previous))
        cleanupError??=Error("b3c1_disposable_cleanup_or_catalog_mismatch");
    }catch(e){cleanupError??=e;}
    try{await admin.end();}catch(e){cleanupError??=e;}
    if(cleanupError)throw Error("b3c1_disposable_cleanup_failed");
  }
}
export async function createCanary(lab){
  const s=lab.names.schema;
  await lab.owner.query("CREATE TABLE "+s+
    ".canary (id integer PRIMARY KEY, synthetic_value integer NOT NULL)");
  await lab.owner.query("INSERT INTO "+s+".canary VALUES (1,7)");
  await lab.owner.query("ALTER TABLE "+s+".canary ENABLE ROW LEVEL SECURITY");
  return s+".canary";
}
export const sqlCodes=Object.freeze({denied:"42501",rls:"42501"});
