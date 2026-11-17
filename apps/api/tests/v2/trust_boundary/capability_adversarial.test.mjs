/**
 * B3c-2R3B-2A: signed test-only command bound to actor, operation, target,
 * optional recipient, payload digest, nonce, expiry, SQL session and PG txid.
 * Synthetic secret is test-fixture-owned; no production issuer selected.
 */
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {verifyBearer} from "../../../src/auth.mjs";
import {signedToken,subject,syntheticSigning} from "../identity/fixtures.mjs";

export async function capabilityChecks(t,lab){
  const {admin,clients,schemas,roles,people,keys,withTx}=lab;
  const deny=async(action)=>assert.rejects(action,e=>e.code==="42501");
  await t.test("TB-C01: mutate every bound claim without new issuer signature",async()=>{
    await withTx(async({client,issue,call})=>{
      const cap=issue();
      const mutations=[
        ["actor",{actor:people.b}],
        ["target",{target:people.bc.roomId}],
        ["operation",{operation:"send"}],
        ["recipient",{recipient:people.c}],
        ["payload digest",{digest:"f".repeat(64)}],
        ["nonce",{nonce:randomBytes(16).toString("hex")}],
        ["expiry",{expiry:cap.expiry+1}],
        ["transaction",{tx:"999999999"}],
        ["issuer MAC",{mac:"0".repeat(64)}]
      ];
      for(const [label,patch] of mutations){
        await deny(()=>call(client,{...cap,...patch}),label);
      }
      assert.equal(await call(client,cap),1,
        "invalid attempts must not consume a legitimate nonce");
      await deny(()=>call(client,cap),"same transaction replay denied");
    });
  });
  await t.test("TB-C02: expiry and maximum proof lifetime are fail-closed",async()=>{
    await withTx(async({client,issue,call,epoch})=>{
      await deny(()=>call(client,issue({expiry:epoch-1})));
      await deny(()=>call(client,issue({expiry:epoch+30})));
      await deny(()=>call(client,{...issue(),nonce:"bad"}));
      await deny(()=>call(client,{...issue(),mac:"malformed"}));
    });
  });
  await t.test("TB-C03: stale signed transaction proof cannot be reused",async()=>{
    let token;
    await withTx(async({issue})=>{token=issue();});
    await withTx(async({client,call})=>{
      await deny(()=>call(client,token));
    });
  });
  await t.test("TB-C04: signed but unsupported operation or recipient fails",async()=>{
    await withTx(async({client,issue,call})=>{
      await deny(()=>call(client,issue({operation:"send"})));
      await deny(()=>call(client,issue({recipient:people.b})));
      await deny(()=>call(client,issue({digest:"a".repeat(64)})));
    });
  });
  await t.test("TB-C05: caller-controlled GUC cannot retarget an authorized command",async()=>{
    await withTx(async({client,issue,call})=>{
      await client.query("SELECT set_config('bridge.tb.room',$1,true)",
        [people.bc.roomId]);
      assert.equal(await call(client,issue()),1,
        "command overwrites an untrusted session GUC after signature verification");
    });
  });
  await t.test("TB-C06: runtime cannot read issuer key or spoof key functions",async()=>{
    const rt=clients.runtime;
    await deny(()=>rt.query("SELECT * FROM "+schemas.key+".private_key"));
    await deny(()=>rt.query("SELECT * FROM "+schemas.key+".consumed_nonce"));
    await deny(()=>rt.query("SELECT "+schemas.key+
      ".verify(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)"));
    await deny(()=>rt.query("CREATE FUNCTION "+schemas.cmd+
      ".inspect() RETURNS int LANGUAGE sql AS 'SELECT 1'"));
    const hasKeyRead=(await admin.query(
      "SELECT has_table_privilege($1,$2,'SELECT') yes",
      [roles.runtime,schemas.key+".private_key"])).rows[0].yes;
    assert.equal(hasKeyRead,false);
    const privilege=(await rt.query(
      "SELECT has_function_privilege($1,$2,'EXECUTE') can_call",
      [roles.actor,schemas.cmd+".inspect(uuid,text,uuid,uuid,text,text,bigint,text,text)"])).rows[0];
    assert.equal(privilege.can_call,false,"actor LOGIN cannot invoke runtime command");
  });
  await t.test("TB-C07: independent runtime receives fixed operation only",async()=>{
    await withTx(async({client,issue,call})=>{
      const cap=issue({actor:people.b,target:people.ab.roomId});
      assert.equal(await call(client,cap),1);
    });
    // Direct secure LIVE and UNREAD must remain inaccessible regardless of a
    // valid metadata command. Nothing in this lab decrypts message bytes.
    await deny(()=>clients.runtime.query("SELECT * FROM bridge_v2_secure_live"));
    await deny(()=>clients.runtime.query("SELECT * FROM bridge_v2_secure_unread"));
  });
  await t.test("TB-C08: issued proof denied after live Block revocation, then one-time recovery",async()=>{
    await withTx(async({client,issue,call})=>{
      const cap=issue();
      await admin.query("INSERT INTO public.bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
        [people.b,people.a]);
      try{
        await deny(()=>call(client,cap));
      }finally{
        await admin.query("DELETE FROM public.bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",
          [people.b,people.a]);
      }
      assert.equal(await call(client,cap),1,
        "authorization must recheck current Block state and allow a still-valid proof after rollback");
      await deny(()=>call(client,cap));
    });
  });
  await t.test("TB-C09: attacker temp-table and search_path spoof cannot change qualified command",async()=>{
    await withTx(async({client,issue,call})=>{
      await client.query("CREATE TEMP TABLE bridge_blocks(blocker_id uuid,blocked_id uuid)");
      await client.query("SET LOCAL search_path=pg_temp,public");
      await client.query("SELECT pg_catalog.set_config('bridge.tb.room',$1,true)",
        [people.bc.roomId]);
      assert.equal(await call(client,issue()),1,
        "real fully-qualified eligibility checks and command-owned RLS context must prevail");
    });
  });
  await t.test("TB-C10: synthetic JWT key rotation and expiry fail closed",()=>{
    const old=signedToken(keys,{sub:subject(people.a)});
    assert.equal(verifyBearer(old,keys.authentication).subject,subject(people.a));
    const rotated=syntheticSigning();
    assert.throws(()=>verifyBearer(old,rotated.authentication),
      e=>e.status===401&&e.code==="unauthorized");
    const replacement=signedToken(rotated,{sub:subject(people.a)});
    assert.throws(()=>verifyBearer(replacement,keys.authentication),
      e=>e.status===401&&e.code==="unauthorized");
    const expired=signedToken(keys,{sub:subject(people.a),
      claims:{exp:Math.floor(Date.now()/1000)-5}});
    assert.throws(()=>verifyBearer(expired,keys.authentication),
      e=>e.status===401&&e.code==="unauthorized");
    // No per-JWT denylist exists: account/Block revocation is checked by the
    // SQL command and hosted token revocation remains a separate production gate.
  });
}
