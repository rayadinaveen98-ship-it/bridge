import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPairSync, createSign } from "node:crypto";
import { verifyBearer, ApiError, assertMessage, assertPreferences } from "../src/auth.mjs";
import { createHandler } from "../src/http.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const auth = { issuer: "bridge-tests", audience: "bridge-api", publicKeyPem: publicKey.export({ format: "pem", type: "spki" }) };
const now = Math.floor(Date.now()/1000);
function token(claims = {}, header = { alg: "RS256", typ: "JWT" }) {
  const payload = { sub: "test|member-a", iss: auth.issuer, aud: auth.audience, iat: now, exp: now+600, ...claims };
  const data = [header, payload].map(x => Buffer.from(JSON.stringify(x)).toString("base64url")).join(".");
  const signer = createSign("RSA-SHA256");
  signer.update(data); signer.end();
  return data + "." + signer.sign(privateKey).toString("base64url");
}
const uuid = "deacfa21-9210-4d1c-af29-aa11aa22bb33";
test("rejects algorithm confusion, forged signature, expired tokens and claims", () => {
  assert.equal(verifyBearer("Bearer "+token(), auth).subject, "test|member-a");
  for (const invalid of [
    token({}, { alg: "none", typ: "JWT" }), token({ exp: now-1 }),
    token({ aud: "someone-else" }), token({ nbf: now+400 }),
    token({ iat: now-10000, exp: now+10000 }), "not.a.jwt"
  ]) assert.throws(() => verifyBearer("Bearer "+invalid,auth), ApiError);
  const forged = token().slice(0,-4) + "AAAA";
  assert.throws(() => verifyBearer("Bearer "+forged, auth),ApiError);
});
test("body validation enforces explicit supported syntax, not age flags", () => {
  assert.deepEqual(assertPreferences({
    languageCodes: ["TE","en"], interests: [], intention: "just_chat"
  }).languageCodes, ["te","en"]);
  assert.throws(() => assertPreferences({languageCodes:[],interests:[],intention:"just_chat"}), ApiError);
  assert.equal(assertMessage({clientMessageId:uuid,body:"hello"}).body,"hello");
  assert.throws(() => assertMessage({clientMessageId:uuid,body:"   "}),ApiError);
});

test("HTTP routes require verified token and delegate immutable subject", async () => {
  const recorded=[];
  const svc = {
    bootstrap: async subject=>({ subject, languages:[], featureFlags:{} }),
    enqueue: async(subject,body)=>{recorded.push({subject,body});return {requestId:uuid,state:"waiting"};},
    report: async()=>({reportId:uuid,state:"queued"}),
    onError:()=>{}
  };
  const server=createServer(createHandler(svc,auth));
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  try {
    const base = "http://127.0.0.1:"+server.address().port;
    const unauthorized=await fetch(base+"/v1/bootstrap");
    assert.equal(unauthorized.status,401);
    const opts={headers:{Authorization:"Bearer "+token()}};
    const bootstrap=await fetch(base+"/v1/bootstrap",opts);
    assert.equal(bootstrap.status,200);
    assert.equal((await bootstrap.json()).subject,"test|member-a");
    const queued=await fetch(base+"/v1/matches/search",{
      method:"POST",headers:{...opts.headers,"Content-Type":"application/json","Idempotency-Key":uuid},
      body:JSON.stringify({topic:"Cinema",ageVerified:true,accountId:"victim"})
    });
    assert.equal(queued.status,202);
    assert.equal(recorded.length,1);
    assert.deepEqual(recorded[0],{subject:"test|member-a",body:{topic:"Cinema",idempotencyKey:uuid}});
    assert.equal((await fetch(base+"/v1/connections",opts)).status,500); // not implemented mock
  } finally {await new Promise(r=>server.close(r));}
});
