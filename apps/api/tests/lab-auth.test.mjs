import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { createHandler } from "../src/http.mjs";
import { verifyBearer, ApiError } from "../src/auth.mjs";
import { createLabLogin, createLabLoginLimiter, hashLabPassphrase,
  verifyLabPassphrase, signLabJwt } from "../src/lab_auth.mjs";

const keys=generateKeyPairSync("rsa",{modulusLength:2048});
const privateKeyPem=keys.privateKey.export({type:"pkcs8",format:"pem"});
const publicKeyPem=keys.publicKey.export({type:"spki",format:"pem"});
const signing={privateKeyPem,issuer:"bridge-lab-tests",audience:"bridge-api"};
const verification={publicKeyPem,issuer:signing.issuer,audience:signing.audience};

test("lab secrets use salted scrypt hashes and reject incorrect strings",async()=>{
  const a=await hashLabPassphrase("long synthetic passphrase A");
  const b=await hashLabPassphrase("long synthetic passphrase A");
  assert.notEqual(a.salt,b.salt);
  assert.notEqual(a.hash,b.hash);
  assert.equal(await verifyLabPassphrase("long synthetic passphrase A",a),true);
  assert.equal(await verifyLabPassphrase("bad password",a),false);
  assert.equal(await verifyLabPassphrase("anybody",null),false);
  await assert.rejects(hashLabPassphrase("short"),TypeError);
});

test("RS256 lab token is verifiable and identifies backend account subject",()=>{
  const {token,expiresIn}=signLabJwt("bridge-lab:account-a",signing);
  const claims=verifyBearer("Bearer "+token,verification);
  assert.equal(claims.subject,"bridge-lab:account-a");
  assert.equal(expiresIn,1800);
});

test("per-handle local login throttling rejects repeated attempts",()=>{
  let time=100;
  const check=createLabLoginLimiter(()=>time);
  for(let i=0;i<5;i++)check("tester_a","127.0.0.1");
  assert.throws(()=>check("tester_a","127.0.0.1"),e=>e.status===429);
  check("tester_b","127.0.0.1");
  time+=16*60*1000;
  check("tester_a","127.0.0.1");
});

test("lab login route defaults to 404 and cannot accidentally enable public test auth",async()=>{
  const srv=createServer(createHandler({},verification));
  await new Promise(done=>srv.listen(0,"127.0.0.1",done));
  try {
    const response=await fetch("http://127.0.0.1:"+srv.address().port+"/internal/lab/login",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({handle:"tester_a",passphrase:"fake"})
    });
    assert.equal(response.status,404);
  }finally{await new Promise(done=>srv.close(done));}
});

test("successful local test login returns JWT, unknown account is generic 401",async()=>{
  const passphrase="generated-lab-test-password-2026";
  const secret=await hashLabPassphrase(passphrase);
  const pool={query:async(sql,args)=>{
    assert.ok(sql.includes("bridge_lab_credentials"));
    if(args[0]==="tester_a")return {rows:[{
      auth_subject:"bridge-lab:trusted-a",status:"active",
      age_verified_at:new Date(),safety_eligible:true,
      salt:secret.salt,passphrase_hash:secret.hash
    }]};
    return {rows:[]};
  }};
  const login=createLabLogin(pool,signing,{enabled:true});
  const server=createServer(createHandler({},verification,null,login));
  await new Promise(done=>server.listen(0,"127.0.0.1",done));
  const base="http://127.0.0.1:"+server.address().port+"/internal/lab/login";
  try {
    const valid=await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({handle:"tester_a",passphrase})});
    assert.equal(valid.status,200);
    const data=await valid.json();
    assert.equal(verifyBearer("Bearer "+data.token,verification).subject,
      "bridge-lab:trusted-a");
    const invalid=await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({handle:"no_such_user",passphrase})});
    assert.equal(invalid.status,401);
    assert.deepEqual(await invalid.json(),{error:"invalid_credentials"});
    const wrong=await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({handle:"tester_a",passphrase:"wrong-password"})});
    assert.equal(wrong.status,401);
    assert.deepEqual(await wrong.json(),{error:"invalid_credentials"});
  }finally{await new Promise(done=>server.close(done));}
});
