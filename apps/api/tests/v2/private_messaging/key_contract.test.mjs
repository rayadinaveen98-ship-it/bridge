import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import {
  createInMemoryTestKeyProvider,createTestWrapNonceRegistry,
  encodePrivateAAD,encodeWrapAAD,PrivateCryptoError,
  validatePrivateMetadata,validateKeyRef
} from "../../../src/messaging/private_key_contract.mjs";
import {encryptSyntheticPrivate,decryptSyntheticPrivate}
  from "../../../src/messaging/private_crypto.mjs";

const denied=e=>e instanceof PrivateCryptoError&&e.code==="private_crypto_unavailable";
const A=()=>({
  policyVersion:"bridge-v2",payloadVersion:1,purpose:"unread",
  messageId:randomUUID(),conversationId:randomUUID(),
  senderId:randomUUID(),recipientId:randomUUID(),
  acceptedAtMs:Date.UTC(2026,10,16,15,0,0,213)
});
const REF={purpose:"unread",keyId:"b1b-unread-v1",version:1};
const make=()=>({provider:createInMemoryTestKeyProvider(),nonces:createTestWrapNonceRegistry()});
const encrypt=(t,meta=A(),v=REF)=>encryptSyntheticPrivate({
  plaintext:"isolated synthetic item",metadata:meta,keyProvider:t.provider,
  keyId:v.keyId,keyVersion:v.version,wrapNonceRegistry:t.nonces
});

test("C08-08 duplicate 96-bit wrap nonce denied; invalid nonce size denied",()=>{
  const x=createTestWrapNonceRegistry(),iv=randomBytes(12);
  assert.equal(x.claim({...REF,iv}),true);
  assert.throws(()=>x.claim({...REF,iv}),denied);
  assert.throws(()=>x.claim({...REF,iv:Buffer.alloc(11)}),denied);
  assert.throws(()=>x.claim({...REF,iv:"not-a-buffer"}),denied);
  assert.equal(x.claim({...REF,version:2,iv}),true,
    "A different KEK version has an independent nonce namespace");
  x.destroy();
  assert.throws(()=>x.claim({...REF,iv:randomBytes(12)}),denied);
});
test("C08-10 canonical length-prefixed AAD and distinct wrap domain",()=>{
  const m=A(),a=encodePrivateAAD(m),b=encodePrivateAAD({...m});
  assert.equal(a.equals(b),true);
  assert.equal(a.readUInt32BE(0),Buffer.byteLength("bridge:v2:private:1"));
  const wrap=encodeWrapAAD(m,REF);
  assert.equal(wrap.equals(a),false);
  assert.equal(wrap.readUInt32BE(0),Buffer.byteLength("bridge:v2:wrap:1"));
  for(const patch of [
    {messageId:randomUUID()},{conversationId:randomUUID()},
    {senderId:randomUUID()},{recipientId:randomUUID()},
    {acceptedAtMs:m.acceptedAtMs+1},{purpose:"live",recipientId:null}
  ])assert.equal(a.equals(encodePrivateAAD({...m,...patch})),false);
  assert.equal(wrap.equals(encodeWrapAAD(m,{...REF,version:2})),false);
  assert.equal(wrap.equals(encodeWrapAAD(m,{...REF,keyId:"different"})),false);
  assert.throws(()=>encodeWrapAAD(m,{...REF,purpose:"live"}),denied);
});
test("C08-10 reject forged, fractional, string or noncanonical acceptance timestamp",()=>{
  const m=A();
  for(const value of [
    "2026-11-16T15:00:00.213Z",String(m.acceptedAtMs),
    new Date(m.acceptedAtMs),m.acceptedAtMs+0.25,
    NaN,Infinity,-1,8640000000000001
  ])assert.throws(()=>encodePrivateAAD({...m,acceptedAtMs:value}),denied);
  for(const [name,value] of [
    ["messageId",randomUUID().toUpperCase()],
    ["senderId","any"],["recipientId",null],["policyVersion","bridge-v1"],
    ["payloadVersion",2],["purpose","history"]
  ])assert.throws(()=>validatePrivateMetadata({...m,[name]:value}),denied);
  assert.throws(()=>validateKeyRef({...REF,keyId:"key\ninjection"}),denied);
  assert.throws(()=>validateKeyRef({...REF,version:0}),denied);
});
test("C08-12 key contract has no default/fallback and rejects unknown or retired key",()=>{
  const t=make(),meta=A();
  assert.throws(()=>t.provider.getKek(REF),denied);
  assert.throws(()=>encrypt(t,meta),denied);
  t.provider.registerKey({...REF,key:randomBytes(32)});
  const record=encrypt(t,meta);
  assert.equal(decryptSyntheticPrivate({
    record,metadata:meta,keyProvider:t.provider
  }),"isolated synthetic item");
  t.provider.retireKey(REF);
  assert.throws(()=>t.provider.getKek(REF),denied);
  assert.throws(()=>decryptSyntheticPrivate({
    record,metadata:meta,keyProvider:t.provider
  }),denied);
  t.provider.destroy();
});
test("C08-16 separate purpose KEKs, no aliasing or exposed keyring serialization",()=>{
  const t=make(),raw=randomBytes(32);
  t.provider.registerKey({...REF,key:raw});
  assert.throws(()=>t.provider.registerKey({
    purpose:"live",keyId:"b1b-live-v1",version:1,key:Buffer.from(raw)
  }),denied,"same KEK bytes cannot be reused in a different purpose");
  assert.throws(()=>t.provider.getKek({...REF,purpose:"cursor"}),denied);
  assert.throws(()=>t.provider.getKek({...REF,purpose:"recovery"}),denied);
  assert.equal(JSON.stringify(t.provider),"{}");
  const first=t.provider.getKek(REF);
  assert.equal(first.equals(raw),true);
  first.fill(0);
  const second=t.provider.getKek(REF);
  assert.equal(second.equals(raw),true,"returned copy must not be live keyring material");
  second.fill(0);
  raw.fill(0);
  const still=t.provider.getKek(REF);
  assert.equal(still.length,32);
  assert.equal(still.equals(Buffer.alloc(32)),false);
  still.fill(0);
  t.provider.destroy();
  assert.throws(()=>t.provider.getKek(REF),denied);
});
test("C08-17 simulated rotation preserves only explicitly retained old version",()=>{
  const t=make(),meta=A();
  t.provider.registerKey({...REF,key:randomBytes(32)});
  const before=encrypt(t,meta);
  const next={...REF,version:2};
  t.provider.registerKey({...next,key:randomBytes(32)});
  assert.equal(decryptSyntheticPrivate({
    record:before,metadata:meta,keyProvider:t.provider
  }),"isolated synthetic item");
  t.provider.retireKey(REF);
  assert.throws(()=>decryptSyntheticPrivate({
    record:before,metadata:meta,keyProvider:t.provider
  }),denied);
  const newer=encrypt(t,meta,next);
  assert.equal(newer.kekVersion,2);
  assert.equal(decryptSyntheticPrivate({
    record:newer,metadata:meta,keyProvider:t.provider
  }),"isolated synthetic item");
  assert.throws(()=>decryptSyntheticPrivate({
    record:{...newer,kekVersion:1},metadata:meta,keyProvider:t.provider
  }),denied);
  t.provider.destroy();
  assert.throws(()=>decryptSyntheticPrivate({
    record:newer,metadata:meta,keyProvider:t.provider
  }),denied);
});
test("C08-17 key destruction prevents recovery and repeated registration fails closed",()=>{
  const t=make(),meta=A();
  t.provider.registerKey({...REF,key:randomBytes(32)});
  assert.throws(()=>t.provider.registerKey({...REF,key:randomBytes(32)}),denied);
  const record=encrypt(t,meta);
  t.provider.removeKey(REF);
  assert.throws(()=>decryptSyntheticPrivate({
    record,metadata:meta,keyProvider:t.provider
  }),denied);
  assert.throws(()=>t.provider.removeKey(REF),denied);
  t.provider.destroy();
});
test("C08-18 isolated crypto runner doesn't alter existing B1a npm test script",async()=>{
  const pkg=JSON.parse(await readFile(new URL("../../../package.json",import.meta.url),"utf8"));
  assert.equal(pkg.scripts["test:v2:private-schema"],
    "node --test tests/v2/private_messaging/schema.test.mjs && node --test tests/v2/private_messaging/backup_restore.test.mjs");
  assert.equal(pkg.scripts["test:v2:private-crypto"],
    "node --test tests/v2/private_messaging/crypto.test.mjs tests/v2/private_messaging/key_contract.test.mjs");
});
test("C08-19 V2-06A original synthetic engine remains guarded and disconnected",async()=>{
  const src=await readFile(new URL("../../../src/messaging/repository.mjs",import.meta.url),"utf8");
  assert.match(src,/disposable-bridge_test-only/);
  assert.match(src,/BRIDGE_TEST_DATABASE_URL/);
  assert.doesNotMatch(src,/from\s+["']\.\/private_crypto\.mjs["']/);
  assert.doesNotMatch(src,/from\s+["']\.\/private_key_contract\.mjs["']/);
});
