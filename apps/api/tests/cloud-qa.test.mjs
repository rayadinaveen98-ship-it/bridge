import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readCloudQaConfig } from "../src/cloud_qa.mjs";

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
