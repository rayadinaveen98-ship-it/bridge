import test from "node:test";
import assert from "node:assert/strict";
import {RUNTIME_ROLE_AUDIT_FLAG,ROLE_AUDIT_SQL,runtimeRoleAuditEnabled,
  classifyRuntimeRole,probeRuntimeRole} from "../../../src/v2/runtime_role_probe.mjs";
const restricted={
  same_principal:true,is_superuser:false,bypasses_rls:false,
  can_create_role:false,can_create_database:false,
  bridge_table_count:20,owned_bridge_tables:0,rls_enabled_tables:20,v2_secure_table_count:0,
  role_name:"MUST_NOT_LEAK",connection_string:"MUST_NOT_LEAK"
};
test("must explicitly opt in to cloud QA diagnostic only",()=>{
  assert.equal(runtimeRoleAuditEnabled({},true),false);
  assert.equal(runtimeRoleAuditEnabled({[RUNTIME_ROLE_AUDIT_FLAG]:"true"},true),false);
  assert.equal(runtimeRoleAuditEnabled({[RUNTIME_ROLE_AUDIT_FLAG]:"1"},false),false);
  assert.equal(runtimeRoleAuditEnabled({[RUNTIME_ROLE_AUDIT_FLAG]:"1"},true),true);
});
test("restricted sample cannot be mistaken for V2 deployment clearance",()=>{
  const x=classifyRuntimeRole([restricted]);
  assert.equal(x.status,"ROLE_REVIEW_ONLY");assert.equal(x.sampled_connection,true);
  assert.equal(x.v2_schema_present,false);
  assert.equal(JSON.stringify(x).includes("MUST_NOT_LEAK"),false);
});
test("privileged role flags always hold V2",()=>{
  for(const k of ["is_superuser","bypasses_rls","can_create_role","can_create_database"]) {
    const x=classifyRuntimeRole([{...restricted,[k]:true}]);
    assert.equal(x.status,"HOLD_V2",k);assert.equal(x.privileged_db_role,true);
  }
});
test("owner status or changed session identity hold V2",()=>{
  for(const patch of [{owned_bridge_tables:1},{same_principal:false}])
    assert.equal(classifyRuntimeRole([{...restricted,...patch}]).status,"HOLD_V2");
});
test("RLS gaps and unknown tables hold V2",()=>{
  for(const patch of [{rls_enabled_tables:19},{bridge_table_count:0,rls_enabled_tables:0}])
    assert.equal(classifyRuntimeRole([{...restricted,...patch}]).status,"HOLD_V2");
});
test("malformed samples fail closed",()=>{
  for(const rows of [[],[restricted,restricted],undefined,[{...restricted,is_superuser:"f"}],
    [{...restricted,bridge_table_count:"20"}],[{...restricted,owned_bridge_tables:21}],
    [{...restricted,v2_secure_table_count:4}],[{...restricted,rls_enabled_tables:21}]])
      assert.equal(classifyRuntimeRole(rows).status,"UNVERIFIED");
});
test("real pool sample uses READ ONLY and rollback/release",async()=>{
  const sql=[];let releases=0;
  const pool={connect:async()=>({query:async q=>{sql.push(q);return q===ROLE_AUDIT_SQL?{rows:[restricted]}:{rows:[]};},
    release:()=>releases++})};
  assert.equal((await probeRuntimeRole(pool)).status,"ROLE_REVIEW_ONLY");
  assert.deepEqual(sql,["BEGIN TRANSACTION READ ONLY",ROLE_AUDIT_SQL,"ROLLBACK"]);
  assert.equal(releases,1);assert.match(ROLE_AUDIT_SQL,/pg_catalog\.pg_roles/);
  assert.doesNotMatch(ROLE_AUDIT_SQL,/\b(INSERT|UPDATE|DELETE|GRANT|ALTER|CREATE|DROP)\s+(TABLE|ROLE|POLICY|SCHEMA)\b/i);
});
test("query error is redacted, rollback and release still run",async()=>{
  const sql=[];let releases=0;
  const pool={connect:async()=>({query:async q=>{sql.push(q);if(q===ROLE_AUDIT_SQL)throw Error("password=PRIVATE");return {rows:[]};},
    release:()=>releases++})};
  const x=await probeRuntimeRole(pool);
  assert.equal(x.status,"UNVERIFIED");assert.equal(JSON.stringify(x).includes("PRIVATE"),false);
  assert.deepEqual(sql,["BEGIN TRANSACTION READ ONLY",ROLE_AUDIT_SQL,"ROLLBACK"]);
  assert.equal(releases,1);
});
test("rollback failure makes the probe unverified",async()=>{
  const pool={connect:async()=>({query:async q=>{if(q==="ROLLBACK")throw Error("SECRET");return q===ROLE_AUDIT_SQL?{rows:[restricted]}:{rows:[]};},release:()=>{}})};
  assert.equal((await probeRuntimeRole(pool)).status,"UNVERIFIED");
});
test("pool failure does not leak connection strings",async()=>{
  const pool={connect:async()=>{throw Error("postgres://username:secret@server");}};
  assert.deepEqual(await probeRuntimeRole(pool),{status:"UNVERIFIED",sampled_connection:false});
});
