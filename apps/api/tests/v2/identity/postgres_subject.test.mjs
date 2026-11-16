import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {createDisposableSubjectAdapter} from "../../../src/v2/private_subject_adapter.mjs";
import {b2SchemaReady,legacyFixture,legacySnapshot,qty} from "../private_messaging/b2_fixtures.mjs";
import {
  disposableUrl,syntheticSigning,signedToken,syntheticAccount,adapter,
  subject,uuid,blocked,fixtureSnapshot,counts
} from "./fixtures.mjs";

const hasDb=!!process.env.BRIDGE_TEST_DATABASE_URL;
test("B3b-1 disposable signed JWT -> locked account identity only",{
  skip:!hasDb
},async t=>{
  const pool=new pg.Pool({connectionString:disposableUrl(),max:8});
  const keys=syntheticSigning();
  try{
    await b2SchemaReady(pool);
    const repo=adapter(pool,keys);
    await t.test("ID03-01,03: signed subject exactly maps to locked DB actor",async()=>{
      const a=await syntheticAccount(pool),b=await syntheticAccount(pool);
      const response=await repo.withVerifiedActor({
        authorization:signedToken(keys,{sub:a.subject}),
        work:async(c,trusted)=>{
          assert.equal(Object.isFrozen(trusted),true);
          assert.deepEqual(Object.keys(trusted),["actorId"]);
          assert.equal(trusted.actorId,a.id);
          assert.notEqual(trusted.actorId,b.id);
          const row=(await c.query(
            "SELECT auth_subject,status FROM bridge_accounts WHERE id=$1",
            [trusted.actorId]
          )).rows[0];
          assert.equal(row.auth_subject,a.subject);
          assert.equal(row.status,"active");
          return Object.freeze({allowed:true});
        }
      });
      assert.deepEqual(response,{allowed:true});
    });
    await t.test("ID03-08: user/body actorId, admin and other claims rejected",async()=>{
      const a=await syntheticAccount(pool),b=await syntheticAccount(pool);
      const token=signedToken(keys,{sub:a.subject});
      const before=await counts(pool);
      let called=false;
      for(const extra of [{actorId:b.id},{premium:true},{age_verified_at:true},
        {sub:b.subject},{role:"admin"}]){
        await assert.rejects(repo.withVerifiedActor({
          authorization:token,work:()=>{called=true;return true;},...extra
        }),blocked);
      }
      assert.equal(called,false);
      assert.deepEqual(await counts(pool),before);
    });
    await t.test("ID03-09,10: A and B tokens never resolve to the other actor",async()=>{
      const a=await syntheticAccount(pool),b=await syntheticAccount(pool);
      for(const acc of [a,b]){
        const result=await repo.withVerifiedActor({
          authorization:signedToken(keys,{sub:acc.subject}),
          work:async(_c,trusted)=>trusted.actorId
        });
        assert.equal(result,acc.id);
      }
      for(const fakeSub of [subject(uuid()),a.subject.toUpperCase(),
        "b3b-disposable:non-uuid","other-prefix:"+a.id]){
        await assert.rejects(repo.withVerifiedActor({
          authorization:signedToken(keys,{sub:fakeSub}),
          work:async()=>{throw Error("SHOULD NOT RUN");}
        }),blocked);
      }
    });
    await t.test("ID03-12: restricted/suspended/deleted account denies",async()=>{
      for(const opts of [{status:"restricted"},{status:"suspended"},
        {status:"deleted"},{deleted:true}]){
        const a=await syntheticAccount(pool,opts);
        let invoked=false;
        await assert.rejects(repo.withVerifiedActor({
          authorization:signedToken(keys,{sub:a.subject}),
          work:()=>{invoked=true;return true;}
        }),blocked);
        assert.equal(invoked,false);
      }
    });
    await t.test("ID03-13: missing age or safety flags never authorize",async()=>{
      for(const opts of [{age:false},{eligible:false},
        {age:false,eligible:false}]){
        const a=await syntheticAccount(pool,opts);
        await assert.rejects(repo.withVerifiedActor({
          authorization:signedToken(keys,{sub:a.subject}),
          work:async()=>({shouldNotExist:true})
        }),blocked);
      }
    });
    await t.test("ID03-17: callback failure rolls back only test fixture write",async()=>{
      const a=await syntheticAccount(pool);
      const before=await counts(pool);
      await assert.rejects(repo.withVerifiedActor({
        authorization:signedToken(keys,{sub:a.subject}),
        work:async(c,trusted)=>{
          await c.query(
            "INSERT INTO bridge_preferences(account_id,intention) VALUES($1,'just_chat')",
            [trusted.actorId]
          );
          throw Error("SYNTHETIC_CALLBACK_ROLLBACK");
        }
      }),blocked);
      const found=await pool.query(
        "SELECT account_id FROM bridge_preferences WHERE account_id=$1",[a.id]
      );
      assert.equal(found.rows.length,0);
      assert.deepEqual(await counts(pool),before);
    });
    await t.test("ID03-20: actual DB role and 0008 receipt are checked before lookup",async()=>{
      const fakeClient={
        async query(sql){
          if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK")
            return {rows:[]};
          if(sql.includes("pg_advisory_xact_lock"))return {rows:[{}]};
          if(sql.includes("current_database()"))
            return {rows:[{db:"cloud_database",usr:"cloud_role",host:"127.0.0.1"}]};
          throw Error("UNEXPECTED SQL BEFORE GUARD");
        },release(){}
      };
      const fakePool={
        options:{connectionString:process.env.BRIDGE_TEST_DATABASE_URL},
        async connect(){return fakeClient;}
      };
      const guarded=createDisposableSubjectAdapter(fakePool,{
        authentication:keys.authentication
      });
      await assert.rejects(guarded.withVerifiedActor({
        authorization:signedToken(keys,{sub:subject(uuid())}),
        work:async()=>{throw Error("CALLBACK SHOULD NOT RUN");}
      }),blocked);
      const noLedger={
        ...fakeClient,
        async query(sql) {
          if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK")
            return {rows:[]};
          if(sql.includes("pg_advisory_xact_lock"))return {rows:[{}]};
          if(sql.includes("current_database()"))
            return {rows:[{db:"bridge_test",usr:"bridge_test",host:"127.0.0.1"}]};
          if(sql.includes("bridge_schema_migrations"))return {rows:[]};
          throw Error("QUERY WITHOUT LEDGER");
        }
      };
      const missing=createDisposableSubjectAdapter({
        options:{connectionString:process.env.BRIDGE_TEST_DATABASE_URL},
        async connect(){return noLedger;}
      },{authentication:keys.authentication});
      await assert.rejects(missing.withVerifiedActor({
        authorization:signedToken(keys,{sub:subject(uuid())}),
        work:async()=>{throw Error("SHOULD NOT RUN");}
      }),blocked);
    });
    await t.test("ID03-19: changed ACK or pool DSN rejects before any DB",async()=>{
      const a=await syntheticAccount(pool),token=signedToken(keys,{sub:a.subject});
      const original=process.env.BRIDGE_TEST_MIGRATION_ACK;
      try{
        process.env.BRIDGE_TEST_MIGRATION_ACK="not-disposable";
        await assert.rejects(repo.withVerifiedActor({
          authorization:token,work:()=>true
        }),blocked);
      }finally{process.env.BRIDGE_TEST_MIGRATION_ACK=original;}
      const fake={
        options:{connectionString:"postgresql://bridge_test:x@cloud.neon.tech/bridge_test"},
        connect:()=>{throw Error("FORBIDDEN CONNECTION");}
      };
      assert.throws(()=>createDisposableSubjectAdapter(fake,{
        authentication:keys.authentication
      }),blocked);
    });
    await t.test("ID03-22: four-message synthetic legacy QA snapshot unchanged",async()=>{
      const fixture=await legacyFixture(pool);
      const sha=await fixtureSnapshot(pool,fixture);
      assert.equal(await qty(pool,
        "SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",
        [fixture.room]),4);
      const actor=await syntheticAccount(pool);
      const reply=await repo.withVerifiedActor({
        authorization:signedToken(keys,{sub:actor.subject}),
        work:async(_c,verified)=>verified.actorId
      });
      assert.equal(reply,actor.id);
      assert.equal(await fixtureSnapshot(pool,fixture),sha);
      assert.equal(await legacySnapshot(pool,fixture),fixture.before);
    });
  }finally{await pool.end();}
});
