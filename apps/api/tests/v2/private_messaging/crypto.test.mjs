import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID,createCipheriv,createDecipheriv} from "node:crypto";
import {readFile} from "node:fs/promises";
import {encryptSyntheticPrivate,decryptSyntheticPrivate}
  from "../../../src/messaging/private_crypto.mjs";
import {createInMemoryTestKeyProvider,createTestWrapNonceRegistry,
  PrivateCryptoError,encodePrivateAAD,encodeWrapAAD}
  from "../../../src/messaging/private_key_contract.mjs";

const fail=e=>e instanceof PrivateCryptoError&&e.message==="private_crypto_unavailable";
const own=()=>({
  messageId:randomUUID(),conversationId:randomUUID(),senderId:randomUUID(),
  recipientId:randomUUID(),acceptedAtMs:Date.UTC(2026,10,16,12,34,56,123),
  policyVersion:"bridge-v2",payloadVersion:1,purpose:"unread"
});
function context() {
  const keyProvider=createInMemoryTestKeyProvider(),wrapNonceRegistry=createTestWrapNonceRegistry();
  keyProvider.registerKey({
    purpose:"live",keyId:"b1b-only-live",version:1,key:randomBytes(32)
  });
  keyProvider.registerKey({
    purpose:"unread",keyId:"b1b-only-unread",version:1,key:randomBytes(32)
  });
  return {keyProvider,wrapNonceRegistry};
}
function encode({ctx,meta=own(),value="synthetic confidential fixture"}={}) {
  ctx??=context();
  const keyId=meta.purpose==="live"?"b1b-only-live":"b1b-only-unread";
  const record=encryptSyntheticPrivate({
    plaintext:value,metadata:meta,keyProvider:ctx.keyProvider,
    keyId,keyVersion:1,wrapNonceRegistry:ctx.wrapNonceRegistry
  });
  return {ctx,meta,record};
}
const cloneRecord=(rec)=>Object.fromEntries(Object.entries(rec).map(([k,v])=>
  [k,Buffer.isBuffer(v)?Buffer.from(v):v]));
function changed(buffer){
  const output=Buffer.from(buffer);
  output[0]^=1;
  return output;
}
function unwrapForTest({record,meta,ctx}){
  // White-box synthetic QA only: proves actual ephemeral DEK separation.
  const kek=ctx.keyProvider.getKek({
    purpose:meta.purpose,keyId:record.kekId,version:record.kekVersion
  });
  try{
    const d=createDecipheriv("aes-256-gcm",kek,record.wrapIv,{authTagLength:16});
    d.setAAD(encodeWrapAAD(meta,{
      purpose:meta.purpose,keyId:record.kekId,version:record.kekVersion
    }));
    d.setAuthTag(record.wrapTag);
    return Buffer.concat([d.update(record.wrappedDek),d.final()]);
  }finally{kek.fill(0);}
}

test("C08-01 Node 22 AES-256-GCM NIST zero-key vector + B1b tagged roundtrip",()=>{
  // NIST SP 800-38D AES-256-GCM: 0-bit plaintext, zero key/IV/AAD.
  const cipher=createCipheriv("aes-256-gcm",Buffer.alloc(32),Buffer.alloc(12),
    {authTagLength:16});
  cipher.setAAD(Buffer.alloc(0));
  cipher.final();
  assert.equal(cipher.getAuthTag().toString("hex"),
    "530f8afbc74536b9a963b4f1c4cb738b");
  const {ctx,meta,record}=encode();
  assert.equal(record.dataIv.length,12);
  assert.equal(record.dataTag.length,16);
  assert.equal(decryptSyntheticPrivate({record,metadata:meta,keyProvider:ctx.keyProvider}),
    "synthetic confidential fixture");
  ctx.keyProvider.destroy();
  ctx.wrapNonceRegistry.destroy();
});
test("C08-02 normalize decomposed multilingual UTF-8 and invalid U+FFFD avoidance",()=>{
  const data=Buffer.from("e\u0301 తెలుగు 日本語 🎬","utf8");
  const {ctx,meta,record}=encode({value:data});
  assert.equal(
    decryptSyntheticPrivate({record,metadata:meta,keyProvider:ctx.keyProvider}),
    "é తెలుగు 日本語 🎬"
  );
  assert.equal(record.ciphertext.includes(Buffer.from("తెలుగు")),false);
  ctx.keyProvider.destroy();
});
test("C08-03 AEAD fails closed on altered data bytes, data tag, data IV, DEK wrap or wrap tag",()=>{
  const {ctx,meta,record}=encode();
  for(const name of ["ciphertext","dataTag","dataIv","wrappedDek","wrapIv","wrapTag"]) {
    const forged=cloneRecord(record);
    forged[name]=changed(forged[name]); // Always changes actual bytes; never a flaky base64 tail edit.
    assert.throws(()=>decryptSyntheticPrivate({
      record:forged,metadata:meta,keyProvider:ctx.keyProvider
    }),fail,name);
  }
  ctx.keyProvider.destroy();
});
test("C08-04 authenticated AAD binds every immutable field and scope",()=>{
  const {ctx,meta,record}=encode();
  const substitutions=[
    {messageId:randomUUID()},{conversationId:randomUUID()},
    {senderId:randomUUID()},{recipientId:randomUUID()},
    {acceptedAtMs:meta.acceptedAtMs+1},{policyVersion:"legacy"},
    {payloadVersion:2},{purpose:"live",recipientId:null}
  ];
  for(const patch of substitutions) {
    assert.throws(()=>decryptSyntheticPrivate({
      record,metadata:{...meta,...patch},keyProvider:ctx.keyProvider
    }),fail,JSON.stringify(Object.keys(patch)));
  }
  ctx.keyProvider.destroy();
});
test("C08-05 no default key, wrong key version, swapped purpose or absent provider",()=>{
  const {ctx,meta,record}=encode();
  const wrong=cloneRecord(record);
  wrong.kekVersion=2;
  assert.throws(()=>decryptSyntheticPrivate({
    record:wrong,metadata:meta,keyProvider:ctx.keyProvider
  }),fail);
  assert.throws(()=>decryptSyntheticPrivate({
    record,metadata:meta,keyProvider:null
  }),fail);
  wrong.kekVersion=1;
  wrong.kekId="b1b-only-live";
  assert.throws(()=>decryptSyntheticPrivate({
    record:wrong,metadata:meta,keyProvider:ctx.keyProvider
  }),fail);
  ctx.keyProvider.destroy();
});
test("C08-06 LIVE vs UNREAD have distinct independent data DEKs, IVs and KEKs",()=>{
  const ctx=context(),base=own();
  const live=encode({ctx,meta:{...base,purpose:"live",recipientId:null}});
  const unread=encode({ctx,meta:base});
  const liveDek=unwrapForTest(live),unreadDek=unwrapForTest(unread);
  try{
    assert.equal(liveDek.length,32);
    assert.equal(unreadDek.length,32);
    assert.equal(liveDek.equals(unreadDek),false);
    assert.equal(live.record.dataIv.equals(unread.record.dataIv),false);
    assert.equal(live.record.wrapIv.equals(unread.record.wrapIv),false);
    assert.notEqual(live.record.kekId,unread.record.kekId);
    assert.equal(decryptSyntheticPrivate({
      record:live.record,metadata:live.meta,keyProvider:ctx.keyProvider
    }),"synthetic confidential fixture");
  }finally{liveDek.fill(0);unreadDek.fill(0);ctx.keyProvider.destroy();}
});
test("C08-07 wrapped DEK AEAD cannot unwrap under different purpose or wrap AAD",()=>{
  const {ctx,meta,record}=encode();
  const key=ctx.keyProvider.getKek({
    purpose:meta.purpose,keyId:record.kekId,version:record.kekVersion
  });
  try {
    const d=createDecipheriv("aes-256-gcm",key,record.wrapIv,{authTagLength:16});
    d.setAAD(encodePrivateAAD(meta)); // Wrong domain: missing "wrap" and KEK id/version.
    d.setAuthTag(record.wrapTag);
    assert.throws(()=>Buffer.concat([
      d.update(record.wrappedDek),d.final()
    ]));
  }finally{key.fill(0);ctx.keyProvider.destroy();}
});
test("C08-09 CSPRNG-produced 12-byte random IVs and 16-byte tags per encryption",()=>{
  const ctx=context(),meta=own();
  const a=encode({ctx,meta}),b=encode({ctx,meta});
  assert.equal(a.record.dataIv.length,12);
  assert.equal(a.record.wrapIv.length,12);
  assert.equal(a.record.wrapTag.length,16);
  assert.equal(b.record.dataIv.length,12);
  assert.equal(a.record.wrapIv.equals(b.record.wrapIv),false);
  assert.equal(a.record.wrappedDek.equals(b.record.wrappedDek),false);
  ctx.keyProvider.destroy();
});
test("C08-11 ciphertext relabelled to another message/recipient never decrypts",()=>{
  const ctx=context(),meta=own(),a=encode({ctx,meta});
  assert.throws(()=>decryptSyntheticPrivate({
    record:a.record,metadata:{...meta,messageId:randomUUID(),recipientId:randomUUID()},
    keyProvider:ctx.keyProvider
  }),fail);
  ctx.keyProvider.destroy();
});
test("C08-13 input rejection for noncanonical UTF-8, empty, long, malformed Buffer and tag",()=>{
  const ctx=context(),meta=own();
  for(const bad of ["", "x".repeat(4001), "\ud800",
    Buffer.from([0xff,0xfe]),Buffer.alloc(0),null,3]) {
    assert.throws(()=>encryptSyntheticPrivate({
      plaintext:bad,metadata:meta,keyProvider:ctx.keyProvider,
      keyId:"b1b-only-unread",keyVersion:1,wrapNonceRegistry:ctx.wrapNonceRegistry
    }),fail);
  }
  const {record}=encode({ctx,meta});
  for(const [field,value] of [
    ["dataTag",Buffer.alloc(15)],["dataIv",Buffer.alloc(11)],
    ["wrappedDek",Buffer.alloc(31)],["ciphertext",Buffer.alloc(0)],
    ["kekVersion",0],["aadVersion",2],["cipherSuite","aes-128-gcm"]
  ])assert.throws(()=>decryptSyntheticPrivate({
    record:{...record,[field]:value},metadata:meta,keyProvider:ctx.keyProvider
  }),fail);
  ctx.keyProvider.destroy();
});
test("C08-14 no keys or test plaintext in AEAD failures or returned record",()=>{
  const ctx=context(),meta=own(),secret="B1b synthetic text stays in-memory only";
  const {record}=encode({ctx,meta,value:secret});
  assert.equal(JSON.stringify(record).includes(secret),false);
  assert.equal(Object.hasOwn(record,"plaintext"),false);
  assert.equal(Object.hasOwn(record,"key"),false);
  try {
    decryptSyntheticPrivate({
      record:{...record,dataTag:changed(record.dataTag)},
      metadata:meta,keyProvider:ctx.keyProvider
    });
    assert.fail("tampering should deny");
  }catch(e){
    assert.ok(fail(e));
    assert.equal(e.stack?.includes(secret),false);
    assert.equal(e.message.includes(secret),false);
  }
  ctx.keyProvider.destroy();
});
test("C08-15 new crypto modules have no hosted runtime, Android or cloud integration",async()=>{
  const root=new URL("../../../src/messaging/",import.meta.url);
  for(const f of ["private_crypto.mjs","private_key_contract.mjs"]) {
    const source=await readFile(new URL(f,root),"utf8");
    assert.doesNotMatch(source,/from\s+["'][^"']*(?:http|postgres|start|outbox|live)\.mjs["']/);
    assert.doesNotMatch(source,/process\.env|fetch\(|https?:\/\/|require\(/);
  }
  // Existing live server bootstrap and route handlers are untouched by B1b.
  for(const f of ["start.mjs","http.mjs","postgres.mjs"]) {
    const source=await readFile(new URL(f,new URL("../../../src/",import.meta.url)),"utf8");
    assert.doesNotMatch(source,/private_crypto|private_key_contract/);
  }
});
