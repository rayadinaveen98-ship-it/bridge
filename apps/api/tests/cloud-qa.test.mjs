import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readCloudQaConfig, verifyCloudQaCredentials } from "../src/cloud_qa.mjs";
import { hashLabPassphrase } from "../src/lab_auth.mjs";

const keys=generateKeyPairSync("rsa",{modulusLength:3072});
const privatePem=keys.privateKey.export({type:"pkcs8",format:"pem"}).toString();
const good={
  BRIDGE_DEPLOYMENT_MODE:"cloud_qa",
  BRIDGE_ALLOW_LAB_LOGIN:"1",
  BRIDGE_BIND_HOST:"0.0.0.0",
  BRIDGE_DATABASE_URL:"postgresql://user:secret@ep-bridge.us-east-1.aws.neon.tech/neondb?sslmode=require",
  BRIDGE_QA_TESTER_A_PASSPHRASE:"a".repeat(48),
  BRIDGE_QA_TESTER_B_PASSPHRASE:"b".repeat(48),
  BRIDGE_QA_PRIVATE_KEY_B64:Buffer.from(privatePem).toString("base64")
};

test("cloud QA mode disabled by default",()=>{
  assert.equal(readCloudQaConfig({}),null);
  assert.equal(readCloudQaConfig({BRIDGE_DEPLOYMENT_MODE:"local"}),null);
});
test("cloud QA requires TLS Neon DB, explicit login opt-in and strong secrets",()=>{
  const config=readCloudQaConfig(good);
  assert.equal(config.signing.issuer,"bridge-private-cloud-qa");
  assert.match(config.signing.publicKeyPem,/BEGIN PUBLIC KEY/);
  const bad=[
    {BRIDGE_ALLOW_LAB_LOGIN:"0"},
    {BRIDGE_BIND_HOST:"127.0.0.1"},
    {BRIDGE_DATABASE_URL:"postgresql://user:p@db.other.example/neondb?sslmode=require"},
    {BRIDGE_DATABASE_URL:"postgresql://user:p@ep-qa.neon.tech/neondb"},
    {BRIDGE_DATABASE_URL:"postgresql://user:p@ep-qa.neon.tech/neondb?sslmode=disable"},
    {BRIDGE_QA_TESTER_A_PASSPHRASE:"short"},
    {BRIDGE_QA_TESTER_B_PASSPHRASE:good.BRIDGE_QA_TESTER_A_PASSPHRASE},
    {BRIDGE_QA_PRIVATE_KEY_B64:"bad key"}
  ];
  for(const overrides of bad)assert.throws(()=>readCloudQaConfig({...good,...overrides}));
});
test("cloud QA cannot accept a short RSA signing key",()=>{
  const weak=generateKeyPairSync("rsa",{modulusLength:2048}).privateKey
    .export({type:"pkcs8",format:"pem"}).toString();
  assert.throws(()=>readCloudQaConfig({
    ...good,BRIDGE_QA_PRIVATE_KEY_B64:Buffer.from(weak).toString("base64")
  }),/key/i);
});

test("QA startup self-check verifies both accounts through real login logic",async()=>{
  const a=await hashLabPassphrase(good.BRIDGE_QA_TESTER_A_PASSPHRASE);
  const b=await hashLabPassphrase(good.BRIDGE_QA_TESTER_B_PASSPHRASE);
  const pool={
    query:async(_sql,args)=>{
      const data={
        tester_a:{...a, subject:"bridge-cloud-qa:a"},
        tester_b:{...b, subject:"bridge-cloud-qa:b"}
      };
      const selected=data[args[0]];
      return {rows:selected ? [{
        auth_subject:selected.subject,status:"active",age_verified_at:new Date(),
        safety_eligible:true,salt:selected.salt,passphrase_hash:selected.hash
      }] : []};
    }
  };
  const signing=readCloudQaConfig(good).signing;
  await verifyCloudQaCredentials(pool,{
    tester_a:good.BRIDGE_QA_TESTER_A_PASSPHRASE,
    tester_b:good.BRIDGE_QA_TESTER_B_PASSPHRASE
  },signing);
  await assert.rejects(
    verifyCloudQaCredentials(pool,{
      tester_a:good.BRIDGE_QA_TESTER_A_PASSPHRASE,
      tester_b:"a wrong test passphrase that is long enough"
    },signing),
    /Cloud QA login self-check failed/
  );
});
