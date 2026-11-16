import test from "node:test";
import assert from "node:assert/strict";
import {withRoleLab,createCanary,sqlState} from "./fixtures.mjs";

test("B3c-1 canary-only owner-view and SECURITY DEFINER privilege demonstrations",async t=>{
  await withRoleLab(async lab=>{
    const {admin,owner,actor,names}=lab;
    const table=await createCanary(lab);
    const schema=names.schema;
    await owner.query("GRANT USAGE ON SCHEMA "+schema+" TO "+names.actor);
    await t.test("P03-15 default view OWNER authority exposes canary-only synthetic count",async()=>{
      await owner.query("CREATE VIEW "+schema+
        ".owner_view AS SELECT count(*)::integer n FROM "+table);
      await owner.query("GRANT SELECT ON "+schema+".owner_view TO "+names.actor);
      const ownerResult=(await owner.query(
        "SELECT n FROM "+schema+".owner_view"
      )).rows[0].n;
      const outsider=(await actor.query(
        "SELECT n FROM "+schema+".owner_view"
      )).rows[0].n;
      assert.equal(ownerResult,1);
      assert.equal(outsider,1,
        "view-owner RLS exemption can expose a synthetic aggregate");
      await assert.rejects(actor.query("SELECT count(*) FROM "+table),
        sqlState("42501"),
        "actor did not directly acquire access to underlying canary table");
    });
    await t.test("P03-16 security_invoker PG16 view checks true caller permissions/RLS",async()=>{
      await owner.query("CREATE VIEW "+schema+
        ".invoker_view WITH (security_invoker=true) AS "+
        "SELECT count(*)::integer n FROM "+table);
      await owner.query("GRANT SELECT ON "+schema+".invoker_view TO "+names.actor);
      await assert.rejects(actor.query(
        "SELECT n FROM "+schema+".invoker_view"
      ),sqlState("42501"));
      await owner.query("GRANT SELECT ON "+table+" TO "+names.actor);
      assert.equal((await actor.query(
        "SELECT n FROM "+schema+".invoker_view"
      )).rows[0].n,0,
      "RLS default-deny applies after underlying SELECT grant");
      assert.equal((await owner.query(
        "SELECT n FROM "+schema+".invoker_view"
      )).rows[0].n,1,
      "non-superuser owner still sees its own data without FORCE");
    });
    await t.test("P03-17/18 SECURITY DEFINER risk contained with same-tx PUBLIC revoke",async()=>{
      const fn=schema+".test_count()";
      const create="CREATE FUNCTION "+fn+
        " RETURNS integer LANGUAGE SQL SECURITY DEFINER "+
        "SET search_path=pg_catalog AS $$"+
        "SELECT count(*)::integer FROM "+table+
        "$$";
      await owner.query("BEGIN");
      try{
        await owner.query(create);
        const before=(await owner.query(
          "SELECT proacl IS NULL default_acl "+
          "FROM pg_proc WHERE oid=$1::regprocedure",[fn]
        )).rows[0];
        assert.equal(before.default_acl,true,
          "new functions default to PUBLIC EXECUTE unless revoked");
        await owner.query("REVOKE ALL ON FUNCTION "+fn+" FROM PUBLIC");
        await owner.query("GRANT EXECUTE ON FUNCTION "+fn+" TO "+names.actor);
        const after=(await owner.query(
          "SELECT proacl IS NULL default_acl "+
          "FROM pg_proc WHERE oid=$1::regprocedure",[fn]
        )).rows[0];
        assert.equal(after.default_acl,false);
        await owner.query("COMMIT");
      }catch(e){await owner.query("ROLLBACK");throw e;}
      // Function has only synthetic integer count, no secure/legacy bodies.
      assert.equal((await actor.query("SELECT "+fn+" AS n")).rows[0].n,1);
      await owner.query("REVOKE EXECUTE ON FUNCTION "+fn+" FROM "+names.actor);
      await assert.rejects(actor.query(
        "SELECT "+fn+" AS n"
      ),sqlState("42501"));
      assert.equal((await owner.query(
        "SELECT "+fn+" AS n"
      )).rows[0].n,1);
    });
    await t.test("P03-22/23 only isolated canary schema changed, no app policies or roles retained",async()=>{
      const rows=(await admin.query(
        "SELECT n.nspname,p.proname,p.prosecdef FROM pg_proc p "+
        "JOIN pg_namespace n ON n.oid=p.pronamespace "+
        "WHERE n.nspname=$1",[schema]
      )).rows;
      assert.equal(rows.length,1);
      assert.deepEqual({name:rows[0].proname,definer:rows[0].prosecdef},
        {name:"test_count",definer:true});
      assert.equal((await admin.query(
        "SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' "+
        "AND tablename LIKE 'bridge_v2_secure_%'"
      )).rows[0].n,0);
    });
  });
});
