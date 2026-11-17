/**
 * B3c-2R3B-2A: signed test-only command bound to actor, operation, target,
 * optional recipient, payload digest, nonce, expiry, SQL session and PG txid.
 * Synthetic secret is test-fixture-owned; no production issuer selected.
 */
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";

export async function capabilityChecks(t,lab){
  const {clients,schemas,roles,people,withTx}=lab;
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
    const hasKeyRead=(await rt.query(
      "SELECT has_table_privilege(current_user,$1,'SELECT') yes",
      [schemas.key+".private_key"])).rows[0].yes;
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
}
