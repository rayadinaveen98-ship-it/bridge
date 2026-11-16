import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {verifyBearer} from "../../../src/auth.mjs";
import {createDisposableSubjectAdapter} from "../../../src/v2/private_subject_adapter.mjs";
import {syntheticSigning,signedToken,subject,uuid,blocked}
  from "./fixtures.mjs";

const keys=syntheticSigning();
const id=uuid();
const good=signedToken(keys,{sub:subject(id)});
const verify=(token,authentication=keys.authentication)=>verifyBearer(
  token,authentication
);
const rejectsToken=action=>assert.throws(action, e=>
  e?.code==="unauthorized"||e?.code==="auth_unconfigured");
test("ID03-01: real in-memory 3072-bit RSA RS256 signed bearer",()=>{
  const decoded=verify(good);
  assert.equal(decoded.subject,subject(id));
  assert.ok(decoded.expiresAt>Math.floor(Date.now()/1000));
  assert.ok(keys.authentication.publicKeyPem.includes("BEGIN PUBLIC KEY"));
});
test("ID03-02: no/malformed Bearer and invalid payload fail strict verifier",()=>{
  for(const token of [null,undefined,"","bearer "+good.slice(7),
    "Bearer abc","Bearer a.b.c","Bearer "+
      "x".repeat(9000),"Bearer a..c","Basic "+
      good.slice(7),"Bearer "+good.slice(7)+"!"])
    rejectsToken(()=>verify(token));
});
test("ID03-03: changed signed bytes/foreign RSA public key cannot authorize",()=>{
  const [prefix,payload,sig]=good.slice(7).split(".");
  const forged="Bearer "+prefix+"."+
    (payload[0]==="A"?"B":"A")+payload.slice(1)+"."+sig;
  rejectsToken(()=>verify(forged));
  const other=syntheticSigning();
  rejectsToken(()=>verify(good,other.authentication));
  const mutated="Bearer "+prefix+"."+payload+"."+
    (sig[0]==="A"?"B":"A")+sig.slice(1);
  rejectsToken(()=>verify(mutated));
});
test("ID03-04: alg none, HS256, critical JOSE and unsupported typ rejected",()=>{
  for(const header of [
    {alg:"none"},{alg:"HS256"},{crit:["exp"]},{typ:"other"},
    {alg:"RS512"}
  ])rejectsToken(()=>verify(signedToken(keys,{header})));
});
test("ID03-05: wrong issuer, audience, missing/blank/oversize subject denied",()=>{
  for(const claims of [
    {iss:"evil"},{aud:"foreign"},{sub:""},{sub:"x".repeat(257)},
    {sub:null},{aud:[]}
  ])rejectsToken(()=>verify(signedToken(keys,{sub:subject(uuid()),claims})));
  // The bare verifier validates signatures/claims, NOT account identity.
  assert.equal(verify(signedToken(keys,{sub:"arbitrary-valid-sub"})).subject,
    "arbitrary-valid-sub");
});
test("ID03-06: exp/iat/nbf and long-life claims fail closed",()=>{
  const n=Math.floor(Date.now()/1000);
  for(const claims of [
    {exp:n-1},{nbf:n+100},{iat:n+100},
    {iat:n-1,exp:n+7200},
    {exp:"tomorrow"},{iat:"now"},
    {exp:null},{nbf:"soon"}
  ])rejectsToken(()=>verify(signedToken(keys,{claims})));
});
test("ID03-06b: verifier rejects expired even with valid signature",()=>{
  const n=Math.floor(Date.now()/1000);
  rejectsToken(()=>verify(signedToken(keys,{claims:{exp:n}})));
});
test("ID03-07: auth options cannot use weak/unconfigured public key",()=>{
  rejectsToken(()=>verify(good,{publicKeyPem:"not a key",
    issuer:keys.authentication.issuer,audience:keys.authentication.audience}));
  rejectsToken(()=>verify(good,{}));
  const weak=generateKeyPairSync("rsa",{modulusLength:1024});
  rejectsToken(()=>verify(good,{publicKeyPem:weak.publicKey.export({
    type:"spki",format:"pem"}).toString(),
    issuer:keys.authentication.issuer,audience:keys.authentication.audience}));
});
test("ID03-19: subject adapter refuses to create cloud/wrong pool before DB",()=>{
  for(const dsn of [
    "postgresql://bridge_test:secret@cloud.neon.tech:5432/bridge_test",
    "postgresql://bridge_test:secret@127.0.0.1:5432/bridge",
    "postgresql://other:secret@127.0.0.1:5432/bridge_test",
    "postgresql://bridge_test:secret@127.0.0.1:5432/bridge_test?sslmode=require"
  ]){
    const originalDsn=process.env.BRIDGE_TEST_DATABASE_URL;
    const originalAck=process.env.BRIDGE_TEST_MIGRATION_ACK;
    try{
      process.env.BRIDGE_TEST_DATABASE_URL=dsn;
      process.env.BRIDGE_TEST_MIGRATION_ACK="disposable-bridge_test-only";
      const fakePool={options:{connectionString:dsn},
        connect:()=>{throw Error("UNAUTHORIZED-CONNECT")}};
      assert.throws(()=>createDisposableSubjectAdapter(fakePool,{
        authentication:keys.authentication
      }),blocked);
    }finally{
      if(originalDsn===undefined)delete process.env.BRIDGE_TEST_DATABASE_URL;
      else process.env.BRIDGE_TEST_DATABASE_URL=originalDsn;
      if(originalAck===undefined)delete process.env.BRIDGE_TEST_MIGRATION_ACK;
      else process.env.BRIDGE_TEST_MIGRATION_ACK=originalAck;
    }
  }
});
test("ID03-20: signed identity helper never exposes a route or hosted import",async()=>{
  const {readFile}=await import("node:fs/promises");
  const source=await readFile(new URL(
    "../../../src/v2/private_subject_adapter.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/BRIDGE_DATABASE_URL|NEON_DATABASE_URL|SELECT\s+\*/i);
  assert.doesNotMatch(source,/private_repository\.mjs|private_delivery_repository\.mjs/);
  for(const live of ["http.mjs","start.mjs","postgres.mjs","outbox.mjs","live.mjs"]){
    const text=await readFile(new URL("../../../src/"+live,import.meta.url),"utf8");
    assert.doesNotMatch(text,/private_subject_adapter\.mjs/);
  }
});
