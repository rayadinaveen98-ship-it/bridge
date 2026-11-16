import test from "node:test";
import assert from "node:assert/strict";
import {validateRoleLabEnv,withDisposableRoleLab} from "./b3c2r_guard.mjs";

const valid={
  CI:"true",GITHUB_ACTIONS:"true",
  BRIDGE_B3C2R_ROLE_ACK:"disposable-bridge-role-lab-pg16-18-only",
  BRIDGE_B3C2R_PG_MAJOR:"16",
  BRIDGE_B3C2R_TEST_DATABASE_URL:
    "postgresql://bridge_role_test:bridge_role_only@127.0.0.1:5432/bridge_role_lab"
};
const isDenied=e=>e?.code==="42501";
test("B3c-2R environment refuses non-CI, wrong ACK, remote URL, wrong database/user",()=>{
  assert.equal(validateRoleLabEnv(valid).major,16);
  assert.equal(validateRoleLabEnv({...valid,BRIDGE_B3C2R_PG_MAJOR:"18"}).major,18);
  for(const patch of [
    {CI:"false"},{GITHUB_ACTIONS:"false"},{BRIDGE_B3C2R_ROLE_ACK:"wrong"},
    {BRIDGE_B3C2R_PG_MAJOR:"17"},{BRIDGE_B3C2R_PG_MAJOR:""},
    {BRIDGE_B3C2R_TEST_DATABASE_URL:valid.BRIDGE_B3C2R_TEST_DATABASE_URL.replace("127.0.0.1","ep.neon.tech")},
    {BRIDGE_B3C2R_TEST_DATABASE_URL:valid.BRIDGE_B3C2R_TEST_DATABASE_URL.replace("bridge_role_lab","neondb")},
    {BRIDGE_B3C2R_TEST_DATABASE_URL:valid.BRIDGE_B3C2R_TEST_DATABASE_URL.replace("bridge_role_test","neondb_owner")},
    {BRIDGE_B3C2R_TEST_DATABASE_URL:valid.BRIDGE_B3C2R_TEST_DATABASE_URL+"?sslmode=require"},
    {BRIDGE_B3C2R_TEST_DATABASE_URL:valid.BRIDGE_B3C2R_TEST_DATABASE_URL.replace(":5432",":6543")}
  ])assert.throws(()=>validateRoleLabEnv({...valid,...patch}),/b3c2r_refuse_non_disposable_environment/);
});
test("B3c-2R PG16/PG18 synthetic independent LOGIN role isolation and deny tests",async t=>{
  await withDisposableRoleLab(async({admin,opened,names,major})=>{
    const {migrator,v1,v2,reviewer,retention}=opened,s=names.schema;
    await t.test("separate LOGIN users on attested disposable PG"+major+" have no dangerous attributes",async()=>{
      const roles=(await admin.query(
        "SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit "+
        "FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])",
        [[names.migrator,names.v1,names.v2,names.reviewer,names.retention]]
      )).rows;
      assert.equal(roles.length,5);
      for(const role of roles) {
        assert.equal(role.rolsuper,false);
        assert.equal(role.rolbypassrls,false);
        assert.equal(role.rolcreaterole,false);
        assert.equal(role.rolcreatedb,false);
        assert.equal(role.rolinherit,false);
      }
    });
    await t.test("V1 can read only granted legacy fixture, not secure, evidence or retention",async()=>{
      assert.equal((await v1.query("SELECT count(*)::int n FROM "+s+".legacy_messages")).rows[0].n,1);
      for(const tbl of ["secure_messages","case_evidence","retention_queue"])
        await assert.rejects(v1.query("SELECT count(*) FROM "+s+"."+tbl),isDenied);
    });
    await t.test("V2 cannot read legacy or case data; default-deny RLS applies despite table grant",async()=>{
      for(const tbl of ["legacy_messages","case_evidence","retention_queue"])
        await assert.rejects(v2.query("SELECT count(*) FROM "+s+"."+tbl),isDenied);
      assert.equal((await v2.query("SELECT count(*)::int n FROM "+s+".secure_messages")).rows[0].n,0);
      await assert.rejects(v2.query("INSERT INTO "+s+
        ".secure_messages VALUES(3,'current_live',decode('ca','hex'))"),isDenied);
      assert.equal((await migrator.query("SELECT count(*)::int n FROM "+s+".secure_messages")).rows[0].n,2);
    });
    await t.test("canary-only scoped policy allows one synthetic LIVE row but not another actor row",async()=>{
      await migrator.query("CREATE POLICY b3c2r_test_read ON "+s+
        ".secure_messages FOR SELECT TO "+names.v2+
        " USING (id=1 AND classification='current_live')");
      const rows=(await v2.query("SELECT id FROM "+s+".secure_messages ORDER BY id")).rows;
      assert.deepEqual(rows,[{id:1}]);
      const updated=await v2.query("UPDATE "+s+
        ".secure_messages SET classification='changed' WHERE id=2");
      assert.equal(updated.rowCount,0);
      await assert.rejects(v2.query("INSERT INTO "+s+
        ".secure_messages VALUES(4,'current_live',decode('bc','hex'))"),isDenied);
      assert.equal((await migrator.query("SELECT count(*)::int n FROM "+s+".secure_messages")).rows[0].n,2);
    });
    await t.test("reviewer and retention roles cannot browse or modify unauthorized rows",async()=>{
      assert.equal((await reviewer.query("SELECT count(*)::int n FROM "+s+".case_evidence")).rows[0].n,0);
      await assert.rejects(reviewer.query("SELECT body FROM "+s+".legacy_messages"),isDenied);
      await assert.rejects(retention.query("SELECT * FROM "+s+".secure_messages"),isDenied);
      assert.equal((await retention.query("DELETE FROM "+s+".retention_queue")).rowCount,0);
      assert.equal((await migrator.query("SELECT count(*)::int n FROM "+s+".retention_queue")).rows[0].n,1);
    });
    await t.test("all runtime principals denied owner assumption and schema mutation",async()=>{
      for(const [key,client] of Object.entries({v1,v2,reviewer,retention})) {
        await assert.rejects(client.query("SET ROLE "+names.migrator),isDenied,key);
        await assert.rejects(client.query("CREATE TABLE "+s+".forbidden(id int)"),isDenied,key);
      }
      await assert.rejects(v2.query(
        "ALTER TABLE "+s+".secure_messages DISABLE ROW LEVEL SECURITY"),isDenied);
      await assert.rejects(v2.query(
        "CREATE POLICY bad ON "+s+".secure_messages USING (true)"),isDenied);
    });
    await t.test("security-invoker view never launders owner access to legacy table",async()=>{
      await migrator.query("CREATE VIEW "+s+
        ".legacy_invoker WITH (security_invoker=true) AS SELECT body FROM "+s+".legacy_messages");
      await migrator.query("GRANT SELECT ON "+s+".legacy_invoker TO "+names.v2);
      await assert.rejects(v2.query("SELECT * FROM "+s+".legacy_invoker"),isDenied);
    });
    await t.test("PUBLIC gains no table privilege; custom actor context is untrusted",async()=>{
      const q=(await admin.query(
        "SELECT c.relname,COALESCE(bool_or(x.grantee=0),false) as public_access "+
        "FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid "+
        "LEFT JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x ON true "+
        "WHERE n.nspname=$1 AND c.relkind='r' GROUP BY c.relname",
        [s]
      )).rows;
      assert.equal(q.length,4);
      assert.ok(q.every(row=>row.public_access===false));
      await v2.query("BEGIN");
      try {
        const result=await v2.query("SELECT set_config('bridge.actor_id','arbitrary',true) AS injected");
        assert.equal(result.rows[0].injected,"arbitrary");
      } finally {await v2.query("ROLLBACK");}
      // This deliberately demonstrates why an app-provided GUC is NOT an identity proof.
    });
    await t.test("FORCE RLS restricts even table owner on disposable canary",async()=>{
      await migrator.query("ALTER TABLE "+s+".secure_messages FORCE ROW LEVEL SECURITY");
      assert.equal((await migrator.query("SELECT count(*)::int n FROM "+s+".secure_messages")).rows[0].n,0);
      assert.deepEqual((await v2.query("SELECT id FROM "+s+".secure_messages")).rows,[{id:1}]);
    });
  });
});
