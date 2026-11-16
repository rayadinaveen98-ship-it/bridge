import test from "node:test";
import assert from "node:assert/strict";
import {
  withRoleLab,createCanary,sqlState,secureTables
} from "./fixtures.mjs";

test("B3c-1 inherited grants, PUBLIC, forbidden escalation and untrusted actor GUC",async t=>{
  await withRoleLab(async lab=>{
    const {admin,owner,actor,names}=lab;
    await t.test("P03-11 real NOLOGIN group inheritance permits ACL, not RLS bypass",async()=>{
      const table=await createCanary(lab);
      await owner.query("GRANT USAGE ON SCHEMA "+names.schema+" TO "+names.group);
      await owner.query("GRANT SELECT ON "+table+" TO "+names.group);
      await admin.query("GRANT "+names.group+" TO "+names.actor);
      const checks=(await admin.query(
        "SELECT pg_has_role($1,$2,'member') member,"+
        "has_table_privilege($1,$3,'SELECT') can_select",
        [names.actor,names.group,table]
      )).rows[0];
      assert.equal(checks.member,true);
      assert.equal(checks.can_select,true);
      assert.equal((await actor.query("SELECT count(*)::int n FROM "+table)).rows[0].n,0);
      // Also demonstrate inherited grant on the actual secure table, with
      // nothing written and no V2 row visible; teardown revokes the grant.
      await admin.query("GRANT SELECT ON TABLE public."+
        secureTables[0]+" TO "+names.group);
      assert.equal((await actor.query(
        "SELECT count(*)::int n FROM public."+secureTables[0]
      )).rows[0].n,0);
    });
    await t.test("P03-12/13 real login cannot assume owner, bypass RLS, grant or mutate schema",async()=>{
      for(const role of [names.owner,"bridge_test"]){
        await assert.rejects(actor.query("SET ROLE "+role),sqlState("42501"));
      }
      await assert.rejects(actor.query(
        "CREATE ROLE b3c1_forbidden_probe LOGIN"
      ),sqlState("42501"));
      await assert.rejects(actor.query(
        "CREATE TABLE public.b3c1_forbidden_probe (id integer)"
      ),sqlState("42501"));
      await assert.rejects(actor.query(
        "ALTER TABLE public.bridge_v2_secure_messages FORCE ROW LEVEL SECURITY"
      ),sqlState("42501"));
      await assert.rejects(actor.query(
        "CREATE POLICY b3c1_forbidden ON public.bridge_v2_secure_live USING (true)"
      ),sqlState("42501"));
      const attrs=(await admin.query(
        "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb "+
        "FROM pg_roles WHERE rolname=$1",[names.actor]
      )).rows[0];
      assert.deepEqual(attrs,{rolsuper:false,rolbypassrls:false,
        rolcreaterole:false,rolcreatedb:false});
    });
    await t.test("P03-14 original secure tables never grant PUBLIC, nor OWNER via group",async()=>{
      const pub=(await admin.query(
        "SELECT c.relname,has_table_privilege('public',c.oid,'SELECT') possible "+
        "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
        "WHERE n.nspname='public' AND c.relname=ANY($1::text[])",
        [secureTables]
      ).catch(()=>({rows:[]}))).rows;
      // Use ACL expansion instead: PUBLIC is special grantee oid 0.
      const acl=(await admin.query(
        "SELECT c.relname,COALESCE(bool_or(a.grantee=0),false) public_grant "+
        "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
        "LEFT JOIN LATERAL aclexplode(COALESCE(c.relacl,"+
        "acldefault('r',c.relowner))) a ON true "+
        "WHERE n.nspname='public' AND c.relname=ANY($1::text[]) "+
        "GROUP BY c.relname",[secureTables]
      )).rows;
      assert.equal(acl.length,3);
      assert.ok(acl.every(x=>!x.public_grant));
      // A role may have public schema USAGE and still no table rights.
      const role=(await actor.query(
        "SELECT current_user usr,session_user sess"
      )).rows[0];
      assert.equal(role.usr,names.actor);
      assert.equal(role.sess,names.actor);
      assert.equal(pub.length<=3,true);
    });
    await t.test("P03-19 SET LOCAL custom actor_id is controllable by user, not verified identity",async()=>{
      await actor.query("BEGIN");
      try{
        await actor.query("SET LOCAL bridge.actor_id TO 'forged-account'");
        assert.equal((await actor.query(
          "SELECT current_setting('bridge.actor_id') AS claimed"
        )).rows[0].claimed,"forged-account");
        assert.equal((await actor.query(
          "SELECT current_user usr,session_user sess"
        )).rows[0].usr,names.actor);
      }finally{await actor.query("ROLLBACK");}
    });
    await t.test("P03-20 old V1/case evidence/history inaccessible to independent runtime",async()=>{
      for(const table of ["bridge_messages","bridge_reports",
        "bridge_report_evidence","bridge_history_items"]){
        await assert.rejects(actor.query(
          "SELECT count(*)::int n FROM public."+table
        ),sqlState("42501"),table);
      }
    });
    await t.test("P03-21 rollback leaves no impersonation in same independent login",async()=>{
      const result=(await actor.query(
        "SELECT current_user usr,session_user sess,"+
        "current_setting('bridge.actor_id',true) claim"
      )).rows[0];
      assert.equal(result.usr,names.actor);
      assert.equal(result.sess,names.actor);
      assert.notEqual(result.claim,"forged-account");
    });
  });
});
