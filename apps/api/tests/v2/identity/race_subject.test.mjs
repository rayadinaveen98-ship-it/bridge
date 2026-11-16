import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {b2SchemaReady} from "../private_messaging/b2_fixtures.mjs";
import {disposableUrl,syntheticSigning,signedToken,syntheticAccount,
  subject,uuid,adapter,blocked,sleep} from "./fixtures.mjs";

const hasDb=!!process.env.BRIDGE_TEST_DATABASE_URL;
test("B3b-1 synthetic PG16 advisory/row-lock and JWT expiration races",{
  skip:!hasDb
},async t=>{
  const pool=new pg.Pool({connectionString:disposableUrl(),max:10});
  const keys=syntheticSigning();
  try{
    await b2SchemaReady(pool);
    const repo=adapter(pool,keys);
    async function withAdvisoryBlock(work){
      const client=await pool.connect();
      await client.query("BEGIN");
      try{
        await client.query("SELECT pg_advisory_xact_lock($1)",[714411]);
        return await work(client);
      }finally{
        try{await client.query("ROLLBACK");}catch{}
        client.release();
      }
    }
    await t.test("ID03-14: account restriction committed before mutex release wins",async()=>{
      const a=await syntheticAccount(pool);
      await withAdvisoryBlock(async locker=>{
        let callback=false;
        const pending=repo.withVerifiedActor({
          authorization:signedToken(keys,{sub:a.subject}),
          work:async()=>{callback=true;return true;}
        });
        // Attach an early rejection handler; the pending call is expected
        // to fail only AFTER the held advisory lock is released.
        const settled=pending.then(v=>({ok:true,v}),e=>({ok:false,e}));
        await sleep(70);
        await pool.query(
          "UPDATE bridge_accounts SET status='restricted' WHERE id=$1",
          [a.id]
        );
        await locker.query("COMMIT");
        const answer=await settled;
        assert.equal(answer.ok,false);
        assert.equal(blocked(answer.e),true);
        assert.equal(callback,false);
      });
    });
    await t.test("ID03-15: auth_subject changed before queued callback denies old JWT",async()=>{
      const a=await syntheticAccount(pool);
      await withAdvisoryBlock(async locker=>{
        let callback=false;
        const pending=repo.withVerifiedActor({
          authorization:signedToken(keys,{sub:a.subject}),
          work:async()=>{callback=true;return true;}
        }).then(v=>({ok:true,v}),e=>({ok:false,e}));
        await sleep(70);
        await pool.query(
          "UPDATE bridge_accounts SET auth_subject=$2 WHERE id=$1",
          [a.id,subject(uuid())]
        );
        await locker.query("COMMIT");
        const result=await pending;
        assert.equal(result.ok,false);
        assert.equal(blocked(result.e),true);
        assert.equal(callback,false);
      });
    });
    await t.test("ID03-26: synthetic UUID-bound sub cannot be reassigned to B",async()=>{
      const a=await syntheticAccount(pool),b=await syntheticAccount(pool);
      const token=signedToken(keys,{sub:a.subject});
      await pool.query("BEGIN");
      // The transaction belongs to the SAME pooled single client below.
      const c=await pool.connect();
      try{
        await c.query("BEGIN");
        await c.query(
          "UPDATE bridge_accounts SET auth_subject=$2 WHERE id=$1",
          [a.id,subject(uuid())]
        );
        await c.query(
          "UPDATE bridge_accounts SET auth_subject=$2 WHERE id=$1",
          [b.id,a.subject]
        );
        await c.query("COMMIT");
      }catch(e){
        await c.query("ROLLBACK");throw e;
      }finally{c.release();}
      let invoked=false;
      await assert.rejects(repo.withVerifiedActor({
        authorization:token,work:()=>{invoked=true;return b.id;}
      }),blocked);
      assert.equal(invoked,false);
      // The caller never receives b.id from the reassigned stale subject.
    });
    await t.test("ID03-16: account FOR UPDATE blocks conflicting status UPDATE until callback completes",async()=>{
      const a=await syntheticAccount(pool);
      let entered,release;
      const enteredGate=new Promise(resolve=>{entered=resolve;});
      const callbackGate=new Promise(resolve=>{release=resolve;});
      const op=repo.withVerifiedActor({
        authorization:signedToken(keys,{sub:a.subject}),
        work:async(c,trusted)=>{
          assert.equal(trusted.actorId,a.id);
          const lock=(await c.query(
            "SELECT id FROM bridge_accounts WHERE id=$1 FOR UPDATE",
            [a.id]
          )).rows;
          assert.equal(lock.length,1);
          entered();
          await callbackGate;
          return trusted.actorId;
        }
      });
      try{
        await enteredGate;
        let completed=false;
        const update=pool.query(
          "UPDATE bridge_accounts SET status='suspended' WHERE id=$1",
          [a.id]
        ).then(()=>{completed=true;});
        await sleep(90);
        assert.equal(completed,false,
          "A concurrent account mutation must wait for row lock/commit");
        release();
        assert.equal(await op,a.id);
        await update;
        assert.equal(completed,true);
        await assert.rejects(repo.withVerifiedActor({
          authorization:signedToken(keys,{sub:a.subject}),work:()=>true
        }),blocked);
      }finally{release();}
    });
    await t.test("ID03-07: token expires during advisory wait; callback NEVER starts",async()=>{
      const a=await syntheticAccount(pool);
      await withAdvisoryBlock(async locker=>{
        const expiration=Math.floor(Date.now()/1000)+2;
        let callback=false;
        const pending=repo.withVerifiedActor({
          authorization:signedToken(keys,{sub:a.subject,
            claims:{exp:expiration}}),
          work:async()=>{callback=true;return true;}
        }).then(v=>({ok:true,v}),e=>({ok:false,e}));
        await sleep(2450);
        await locker.query("COMMIT");
        const result=await pending;
        assert.equal(result.ok,false);
        assert.equal(blocked(result.e),true);
        assert.equal(callback,false);
      });
    });
    await t.test("ID03-09: status change after signed issuance denies despite still-valid JWT",async()=>{
      const a=await syntheticAccount(pool);
      const original=signedToken(keys,{sub:a.subject});
      await pool.query(
        "UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",
        [a.id]
      );
      let called=false;
      await assert.rejects(repo.withVerifiedActor({
        authorization:original,work:()=>{called=true;return true;}
      }),blocked);
      assert.equal(called,false);
    });
    await t.test("ID03-21: generic errors never include signed subject/token/SQL",async()=>{
      const sub=subject(uuid()),authorization=signedToken(keys,{sub});
      let error;
      try{
        await repo.withVerifiedActor({
          authorization,work:()=>true
        });
      }catch(e){error=e;}
      assert.equal(blocked(error),true);
      for(const secret of [sub,authorization,"bridge_accounts","SELECT",
        "JWT","auth_subject"]){
        assert.equal(String(error).includes(secret),false);
      }
    });
  }finally{await pool.end();}
});
