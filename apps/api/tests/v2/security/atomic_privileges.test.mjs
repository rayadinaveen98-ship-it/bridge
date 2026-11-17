/**
 * B3c-2R3B-1 exported helper cases. Only atomic_revocation.test.mjs is an
 * executable test entrypoint so all three suites share ONE attested PG18
 * disposable fixture rather than racing migrations on the same database.
 */
import assert from "node:assert/strict";
import {randomUUID,denied,fixtureEnv} from "./atomic_pg18_fixture.mjs";
import {assertDisposableB3c2r3b1} from "../../../src/v2/security/disposable_atomic_guard.mjs";
export async function privilegeCases(t,lab) {
  const {a,b,ab}=lab.people;
  const req=(who,operation,targetId,extra={})=>({
    authorization:lab.token(who),operation,targetId,...extra
  });
  await t.test("R3B-01/41 all guard environment preflights reject hosted connections",()=>{
    const safe=fixtureEnv();
    assert.equal(assertDisposableB3c2r3b1(safe),safe.BRIDGE_B3C2R2_TEST_DATABASE_URL);
    for(const patch of [{CI:"false"},{GITHUB_ACTIONS:"false"},
      {BRIDGE_B3C2R3B1_ACK:"wrong"},
      {BRIDGE_B3C2R2_PG_MAJOR:"16"},
      {BRIDGE_B3C2R2_TEST_DATABASE_URL:safe.BRIDGE_B3C2R2_TEST_DATABASE_URL.replace("127.0.0.1","example.neon.tech")},
      {BRIDGE_B3C2R2_TEST_DATABASE_URL:safe.BRIDGE_B3C2R2_TEST_DATABASE_URL.replace("/bridge_privproof","/neondb")}])
      assert.throws(()=>assertDisposableB3c2r3b1({...safe,...patch}),denied);
  });
  await t.test("R3B-01 signed expired issuer audience and future token are rejected",async()=>{
    const now=Math.floor(Date.now()/1000);
    const invalid=[
      {exp:now-2},{iss:"untrusted-issuer"},{aud:"other-api"},
      {nbf:now+120},{iat:now+90},{exp:now+7200}
    ];
    for(const claims of invalid)
      await assert.rejects(lab.guard.dispatch({
        ...req(a,"live",ab.roomId),
        authorization:lab.tokenWithClaims(a,claims)
      }),denied);
  });
  await t.test("R3B-02 source rejects actor, role, query, unsafe options supplied by caller",async()=>{
    for(const patch of [{actorId:b},{schema:"public"},{sql:"SELECT *"},{policy:"allow"},
      {connectionId:ab.connectionId},{role:"bridge_privproof_admin"}])
      await assert.rejects(lab.guard.dispatch({
        ...req(a,"live",ab.roomId),...patch
      }),denied);
  });
  await t.test("R3B-01 malformed/tampered/untrusted JWT rejects before any secure SQL",async()=>{
    for(const authorization of [
      "Bearer bad.jwt.token","",lab.token(a).slice(0,-5)+"ABCDE","Bearer ",
      lab.token(a).replace("Bearer ","Basic ")
    ])await assert.rejects(lab.guard.dispatch({
      authorization,operation:"live",targetId:ab.roomId
    }),denied);
  });
  await t.test("R3B-04,09 runtime cannot forge a signed gateway command",async()=>{
    await assert.rejects(lab.appClient.query(
      "SELECT "+lab.schema+".dispatch($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::bigint,$7)",
      [a,"live",ab.roomId,null,null,String(Math.floor(Date.now()/1000)+20),
        "0".repeat(64)]
    ),e=>e?.code==="P0001");
    await assert.rejects(lab.guard.dispatch(req(a,"history",ab.roomId)),denied);
    await assert.rejects(lab.guard.dispatch(req(a,"live",randomUUID(),{sql:"SELECT 1"})),denied);
  });
  await t.test("R3B-05/06/07 runtime independent role has no table, legacy, evidence or key grants",async()=>{
    await lab.verify();
    for(const table of ["bridge_messages","bridge_accounts","bridge_report_evidence",
      "bridge_history_items","bridge_v2_secure_messages",
      "bridge_v2_secure_live","bridge_v2_secure_unread"])
      await assert.rejects(lab.appClient.query(
        "SELECT * FROM public."+table+" LIMIT 1"
      ),e=>e?.code==="42501",table);
    await assert.rejects(lab.appClient.query(
      "SELECT * FROM "+lab.schema+".guard_key"),e=>e?.code==="42501");
    await assert.rejects(lab.appClient.query(
      "SET ROLE "+lab.names.migrator),e=>e?.code==="42501");
    await assert.rejects(lab.appClient.query(
      "ALTER TABLE public.bridge_v2_secure_live DISABLE ROW LEVEL SECURITY"),
      e=>e?.code==="42501");
  });
  await t.test("R3B-40 REVOKED gateway EXECUTE never falls back to owner",async()=>{
    const signature=lab.schema+".dispatch(uuid,text,uuid,uuid,text,bigint,text)";
    await lab.admin.query("REVOKE EXECUTE ON FUNCTION "+signature+
      " FROM "+lab.names.app);
    try{
      const access=(await lab.appClient.query(
        "SELECT has_function_privilege(current_user,$1,'EXECUTE') AS allowed",
        [signature])).rows[0].allowed;
      assert.equal(access,false);
      await assert.rejects(lab.guard.dispatch(req(a,"live",ab.roomId)),denied);
      assert.equal((await lab.appClient.query(
        "SELECT current_user AS who")).rows[0].who,lab.names.app);
    }finally{
      await lab.admin.query("GRANT EXECUTE ON FUNCTION "+signature+
        " TO "+lab.names.app);
    }
  });
  await t.test("R3B-08 no session actor/credential leaks after COMMIT or ROLLBACK",async()=>{
    const result=await lab.guard.dispatch(req(a,"live",ab.roomId));
    assert.ok(Array.isArray(result.messages));
    const attrs=(await lab.appClient.query(
      "SELECT current_user usr,session_user sess,current_setting('bridge.proof.actor',true) AS actor"
    )).rows[0];
    assert.equal(attrs.usr,lab.names.app);
    assert.equal(attrs.sess,lab.names.app);
    assert.equal(attrs.actor,null);
    await assert.rejects(lab.guard.dispatch(req(b,"live",randomUUID())),denied);
    assert.equal((await lab.appClient.query(
      "SELECT current_user usr"
    )).rows[0].usr,lab.names.app);
  });
}
