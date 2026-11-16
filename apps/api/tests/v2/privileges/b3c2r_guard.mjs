/**
 * B3c-2R. Disposable GitHub Actions PG16/PG18 role-isolation harness ONLY.
 * NEVER connect to Neon, Render, development user databases, or prod endpoints.
 * Every role and schema is synthetic; generated identifiers/secrets are never logged.
 */
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {execFileSync} from "node:child_process";
import pg from "pg";

const ACK="disposable-bridge-role-lab-pg16-18-only";
const DB="bridge_role_lab";
const USER="bridge_role_test";
const PASSWORD="bridge_role_only";
const PREFIX="b3c2r_";

export function validateRoleLabEnv(env=process.env) {
  if(env.CI!=="true"||env.GITHUB_ACTIONS!=="true"||
     env.BRIDGE_B3C2R_ROLE_ACK!==ACK||
     !["16","18"].includes(String(env.BRIDGE_B3C2R_PG_MAJOR)))
    throw new Error("b3c2r_refuse_non_disposable_environment");
  const raw=env.BRIDGE_B3C2R_TEST_DATABASE_URL;
  let u;
  try{u=new URL(raw);}catch{throw Error("b3c2r_refuse_non_disposable_environment");}
  if(!["postgres:","postgresql:"].includes(u.protocol)||
     u.hostname!=="127.0.0.1"||
     u.port!=="5432"||u.pathname!=="/"+DB||
     u.username!==USER||u.password!==PASSWORD||
     u.search!==""||u.hash!=="")
    throw Error("b3c2r_refuse_non_disposable_environment");
  return Object.freeze({url:raw,major:Number(env.BRIDGE_B3C2R_PG_MAJOR)});
}

async function attestDisposableCluster(admin,major) {
  const meta=(await admin.query(
    "SELECT current_database() db,current_user usr,session_user sess,"+
    "current_setting('server_version_num')::int version,pg_is_in_recovery() recovery,"+
    "system_identifier::text sid FROM pg_control_system()"
  )).rows[0];
  if(meta?.db!==DB||meta.usr!==USER||meta.sess!==USER||
    Math.trunc(meta.version/10000)!==major||meta.recovery!==false)
    throw Error("b3c2r_refuse_role_or_pg_version");
  const role=(await admin.query(
    "SELECT rolsuper,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user"
  )).rows[0];
  if(role?.rolsuper!==true)throw Error("b3c2r_refuse_non_disposable_owner");
  // Independently attest the same exact cluster by the GitHub Actions
  // postgres:16/18 service container. Docker NAT need not report loopback.
  try {
    const ids=execFileSync("docker",
      ["ps","--filter","ancestor=postgres:"+major,"--format","{{.ID}}"],
      {encoding:"utf8",timeout:5000}).trim().split(/\s+/).filter(Boolean);
    if(ids.length!==1||!/^[a-f0-9]{12,64}$/.test(ids[0]))
      throw Error("wrong disposable container count");
    const sid=execFileSync("docker",
      ["exec",ids[0],"psql","-U",USER,"-d",DB,"-X","-A","-t","-c",
       "SELECT system_identifier::text FROM pg_control_system()"],
      {encoding:"utf8",timeout:5000}).trim();
    if(!/^[0-9]{15,22}$/.test(sid)||sid!==meta.sid)
      throw Error("disposable cluster identity mismatch");
  } catch {
    throw Error("b3c2r_refuse_disposable_cluster_unverified");
  }
}

const sq=(id)=> {
  if(typeof id!=="string"||!/^b3c2r_[0-9a-f]{12}_(?:m|v1|v2|c|r|s)$/.test(id))
    throw Error("b3c2r_unsafe_generated_identifier");
  return id;
};
async function independentLogin(role,password) {
  const client=new pg.Client({
    host:"127.0.0.1",port:5432,database:DB,user:role,password,
    connectionTimeoutMillis:4000,
    application_name:"bridge_b3c2r_disposable_role_test"
  });
  await client.connect();
  try {
    const identity=(await client.query(
      "SELECT current_user usr,session_user sess,current_database() db"
    )).rows[0];
    assert.deepEqual(identity,{usr:role,sess:role,db:DB});
    return client;
  } catch(e) {await client.end();throw e;}
}

async function roleSnapshot(admin) {
  const rows=(await admin.query(
    "SELECT rolname FROM pg_catalog.pg_roles WHERE left(rolname,6)=$1 ORDER BY rolname",
    [PREFIX]
  )).rows.map(x=>x.rolname);
  const schemas=(await admin.query(
    "SELECT nspname FROM pg_catalog.pg_namespace WHERE left(nspname,6)=$1 ORDER BY nspname",
    [PREFIX]
  )).rows.map(x=>x.nspname);
  return JSON.stringify({rows,schemas});
}

export async function withDisposableRoleLab(run) {
  const env=validateRoleLabEnv(); // Fail BEFORE any network access/DDL.
  const admin=new pg.Client({
    connectionString:env.url,connectionTimeoutMillis:5000,
    application_name:"bridge_b3c2r_disposable_admin_only"
  });
  await admin.connect();
  const stem=PREFIX+randomBytes(6).toString("hex")+"_";
  const names=Object.freeze({
    migrator:sq(stem+"m"),v1:sq(stem+"v1"),v2:sq(stem+"v2"),
    reviewer:sq(stem+"c"),retention:sq(stem+"r"),schema:sq(stem+"s")
  });
  const keys=Object.fromEntries(["migrator","v1","v2","reviewer","retention"].map(k=>
    [k,randomBytes(24).toString("hex")]
  ));
  const opened={},created=[],schemaCreated=false;
  let before,cleanupFailed=false;
  try {
    await attestDisposableCluster(admin,env.major);
    before=await roleSnapshot(admin);
    if(before!==JSON.stringify({rows:[],schemas:[]}))
      throw Error("b3c2r_unexpected_role_fixture_present");
    for(const k of ["migrator","v1","v2","reviewer","retention"]) {
      await admin.query(
        "CREATE ROLE "+names[k]+" LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS "+
        "NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+keys[k]+"'"
      );
      created.push(names[k]);
    }
    await admin.query("CREATE SCHEMA "+names.schema+" AUTHORIZATION "+names.migrator);
    schemaCreated=true;
    for(const k of ["migrator","v1","v2","reviewer","retention"])
      opened[k]=await independentLogin(names[k],keys[k]);
    const s=names.schema,owner=opened.migrator;
    await owner.query("CREATE TABLE "+s+
      ".legacy_messages(id integer PRIMARY KEY, body text NOT NULL)");
    await owner.query("CREATE TABLE "+s+
      ".secure_messages(id integer PRIMARY KEY, classification text NOT NULL, payload bytea NOT NULL)");
    await owner.query("CREATE TABLE "+s+
      ".case_evidence(id integer PRIMARY KEY, evidence_digest text NOT NULL)");
    await owner.query("CREATE TABLE "+s+
      ".retention_queue(id integer PRIMARY KEY, expired boolean NOT NULL)");
    await owner.query("INSERT INTO "+s+
      ".legacy_messages VALUES(1,'synthetic-only-legacy-fixture')");
    await owner.query("INSERT INTO "+s+
      ".secure_messages VALUES(1,'current_live',decode('beef','hex')),"+
      "(2,'other_actor',decode('cafe','hex'))");
    await owner.query("INSERT INTO "+s+
      ".case_evidence VALUES(1,'synthetic-digest')");
    await owner.query("INSERT INTO "+s+
      ".retention_queue VALUES(1,true)");
    for(const name of ["secure_messages","case_evidence","retention_queue"])
      await owner.query("ALTER TABLE "+s+"."+name+" ENABLE ROW LEVEL SECURITY");
    for(const key of ["v1","v2","reviewer","retention"])
      await owner.query("GRANT USAGE ON SCHEMA "+s+" TO "+names[key]);
    await owner.query("GRANT SELECT ON "+s+".legacy_messages TO "+names.v1);
    await owner.query("GRANT SELECT,INSERT,UPDATE ON "+s+".secure_messages TO "+names.v2);
    await owner.query("GRANT SELECT ON "+s+".case_evidence TO "+names.reviewer);
    await owner.query("GRANT DELETE ON "+s+".retention_queue TO "+names.retention);
    return await run(Object.freeze({admin,opened,names,major:env.major}));
  } finally {
    // No production or live connection exists in this tool. Explicit teardown
    // still matters: CI must FAIL if any temporary role/schema survives.
    for(const client of Object.values(opened))
      try {await client.query("ROLLBACK");await client.end();}
      catch {cleanupFailed=true;try{await client.end();}catch{}}
    if(schemaCreated)try {
      await admin.query("DROP SCHEMA "+names.schema+" CASCADE");
    } catch {cleanupFailed=true;}
    for(const name of created.reverse())try {
      await admin.query("DROP ROLE "+name);
    } catch {cleanupFailed=true;}
    if(before!==undefined)try {
      if(await roleSnapshot(admin)!==before)cleanupFailed=true;
    }catch{cleanupFailed=true;}
    try{await admin.end();}catch{cleanupFailed=true;}
    if(cleanupFailed)throw Error("b3c2r_disposable_cleanup_failed");
  }
}
