import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {
  validateEnvironment,withRoleLab,secureTables,createCanary,sqlState
} from "./fixtures.mjs";

test("B3c-1 RLS: independent PostgreSQL16 login vs actual 0008 tables and owner canary",async t=>{
  await t.test("P03-01/02 missing CI/ACK, remote/wrong user/wrong DB refused before connect",()=>{
    const valid={
      url:"postgresql://bridge_test:bridge_test_only@127.0.0.1:5432/bridge_test",
      acknowledgment:"disposable-bridge_test-only",
      roleAcknowledgment:"disposable-pg16-service-role-ddl",
      ci:"true",actions:"true"
    };
    assert.equal(validateEnvironment(valid).hostname,"127.0.0.1");
    for(const patch of [
      {acknowledgment:"wrong"},{roleAcknowledgment:"wrong"},{ci:"false"},
      {actions:"false"},{url:valid.url.replace("127.0.0.1","example.neon.tech")},
      {url:valid.url.replace("bridge_test:bridge_test_only","admin:secret")},
      {url:valid.url.replace("/bridge_test","/production")},
      {url:valid.url+"?sslmode=require"},
      {url:valid.url.replace(":5432",":6432")}
    ])assert.throws(()=>validateEnvironment({...valid,...patch}),
      /b3c1_disposable_environment_required/);
  });
  await withRoleLab(async lab=>{
    const {admin,owner,actor,names}=lab;
    await t.test("P03-03/04 actual DB, superuser CI owner and two distinct NONowner real LOGIN identities",async()=>{
      const rows=await Promise.all([actor,owner].map(async client=>
        (await client.query(
          "SELECT current_user usr,session_user sess,current_database() db"
        )).rows[0]));
      assert.deepEqual(rows.map(x=>x.usr),[names.actor,names.owner]);
      for(const row of rows){assert.equal(row.usr,row.sess);assert.equal(row.db,"bridge_test");}
      const attrs=(await admin.query(
        "SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolcanlogin "+
        "FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname",
        [[names.actor,names.owner,names.group]]
      )).rows;
      assert.equal(attrs.length,3);
      assert.ok(attrs.every(x=>!x.rolsuper&&!x.rolbypassrls&&
        !x.rolcreatedb&&!x.rolcreaterole));
      assert.equal(attrs.find(x=>x.rolname===names.group).rolcanlogin,false);
    });
    await t.test("P03-05 three real secure tables denied without table privileges",async()=>{
      for(const name of secureTables)
        await assert.rejects(actor.query(
          "SELECT count(*)::int n FROM public."+name
        ),sqlState("42501"));
    });
    await t.test("P03-06/07 explicit SELECT/INSERT/UPDATE/DELETE grant still fails RLS",async()=>{
      const tableSet=secureTables.map(x=>"public."+x).join(",");
      const positive=(await admin.query(
        "SELECT count(*)::int n FROM public.bridge_v2_secure_messages"
      )).rows[0].n;
      assert.ok(positive>0,"prior synthetic CI must have seeded secure messages");
      await admin.query("GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE "+
        tableSet+" TO "+names.actor);
      for(const name of secureTables){
        assert.equal((await actor.query(
          "SELECT count(*)::int n FROM public."+name
        )).rows[0].n,0,"nonowner cannot see even encrypted rows");
      }
      const fake=randomUUID();
      await assert.rejects(actor.query(
        "INSERT INTO public.bridge_v2_secure_messages "+
        "(conversation_id,sender_id,client_message_id,sequence_number,"+
        "policy_version,accepted_at) "+
        "VALUES($1,$2,$3,1,'bridge-v2',now())",
        [fake,fake,randomUUID()]
      ),sqlState("42501"));
      const upd=await actor.query(
        "UPDATE public.bridge_v2_secure_messages SET sequence_number=sequence_number"
      );
      const del=await actor.query(
        "DELETE FROM public.bridge_v2_secure_messages"
      );
      assert.equal(upd.rowCount,0);
      assert.equal(del.rowCount,0);
      assert.equal((await admin.query(
        "SELECT count(*)::int n FROM public.bridge_v2_secure_messages"
      )).rows[0].n,positive);
    });
    await t.test("P03-08 secure tables remain RLS ON, FORCE OFF, no policy, test owner only",async()=>{
      const rows=(await admin.query(
        "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,"+
        "pg_get_userbyid(c.relowner) owner,(SELECT count(*)::int "+
        "FROM pg_policies p WHERE p.schemaname='public' AND "+
        "p.tablename=c.relname) policies FROM pg_class c JOIN "+
        "pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' "+
        "AND c.relname=ANY($1::text[]) ORDER BY c.relname",
        [secureTables]
      )).rows;
      assert.equal(rows.length,3);
      for(const row of rows){
        assert.equal(row.owner,"bridge_test");
        assert.equal(row.relrowsecurity,true);
        assert.equal(row.relforcerowsecurity,false);
        assert.equal(row.policies,0);
      }
    });
    await t.test("P03-09/10 nonsuperuser canary owner bypass vs FORCE RLS",async()=>{
      const table=await createCanary(lab);
      await owner.query("GRANT USAGE ON SCHEMA "+names.schema+" TO "+names.actor);
      await owner.query("GRANT SELECT ON "+table+" TO "+names.actor);
      assert.equal((await owner.query("SELECT count(*)::int n FROM "+table)).rows[0].n,1);
      assert.equal((await actor.query("SELECT count(*)::int n FROM "+table)).rows[0].n,0);
      await owner.query("ALTER TABLE "+table+" FORCE ROW LEVEL SECURITY");
      assert.equal((await owner.query("SELECT count(*)::int n FROM "+table)).rows[0].n,0);
      // Superuser bypass is NOT evidence that a nonowner runtime is authorized.
      assert.equal((await admin.query("SELECT count(*)::int n FROM "+table)).rows[0].n,1);
    });
  });
});
