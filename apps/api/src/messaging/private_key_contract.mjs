/**
 * Bridge B1b: disconnected, in-memory, synthetic-only key/AAD contract.
 * This is NOT production KMS, end-to-end encryption, persistence, or a secret
 * manager. It must not be wired to HTTP, Android, Render, or Neon.
 */
import {timingSafeEqual} from "node:crypto";

export const CRYPTO_SUITE="aes-256-gcm-v1";
export const AAD_VERSION=1;
export const DATA_KEY_BYTES=32;
export const GCM_IV_BYTES=12;
export const GCM_TAG_BYTES=16;
export const MAX_MESSAGE_BYTES=4000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_ID=/^[a-zA-Z0-9._:-]{1,128}$/;

export class PrivateCryptoError extends Error {
  constructor() {
    super("private_crypto_unavailable");
    this.name="PrivateCryptoError";
    this.code="private_crypto_unavailable";
  }
}
export function cryptoDeny(){throw new PrivateCryptoError();}

export function validatePurpose(purpose) {
  if(purpose!=="live"&&purpose!=="unread")cryptoDeny();
  return purpose;
}
export function validateKeyRef({purpose,keyId,version}={}) {
  validatePurpose(purpose);
  if(typeof keyId!=="string"||!KEY_ID.test(keyId)||
     !Number.isSafeInteger(version)||version<1)cryptoDeny();
  return true;
}
function encodeFields(fields) {
  if(!Array.isArray(fields)||fields.length>32)cryptoDeny();
  const chunks=[];
  for(const field of fields) {
    if(typeof field!=="string"&&!Buffer.isBuffer(field))cryptoDeny();
    const value=Buffer.isBuffer(field)?field:Buffer.from(field,"utf8");
    if(value.length>16384)cryptoDeny();
    const size=Buffer.allocUnsafe(4);
    size.writeUInt32BE(value.length);
    chunks.push(size,value);
  }
  return Buffer.concat(chunks);
}
/**
 * The caller must supply the canonical, server-derived acceptance timestamp,
 * in WHOLE epoch milliseconds. Do not accept a client Date/string/default.
 */
export function validatePrivateMetadata(meta) {
  if(!meta||Array.isArray(meta)||typeof meta!=="object")cryptoDeny();
  if(meta.policyVersion!=="bridge-v2"||meta.payloadVersion!==1)cryptoDeny();
  validatePurpose(meta.purpose);
  for(const field of ["messageId","conversationId","senderId"])
    if(typeof meta[field]!=="string"||!UUID.test(meta[field]))cryptoDeny();
  if(meta.purpose==="unread") {
    if(typeof meta.recipientId!=="string"||!UUID.test(meta.recipientId)||
       meta.recipientId===meta.senderId)cryptoDeny();
  } else if(meta.recipientId!==null)cryptoDeny();
  if(!Number.isSafeInteger(meta.acceptedAtMs)||meta.acceptedAtMs<0||
     meta.acceptedAtMs>8640000000000000)cryptoDeny();
  return true;
}
export function encodePrivateAAD(meta) {
  validatePrivateMetadata(meta);
  return encodeFields([
    "bridge:v2:private:1",meta.policyVersion,meta.purpose,
    meta.messageId,meta.conversationId,meta.senderId,
    meta.recipientId??"",String(meta.acceptedAtMs),String(meta.payloadVersion)
  ]);
}
export function encodeWrapAAD(meta,{purpose,keyId,version}={}) {
  validatePrivateMetadata(meta);
  validateKeyRef({purpose,keyId,version});
  if(purpose!==meta.purpose)cryptoDeny();
  return encodeFields([
    "bridge:v2:wrap:1",encodePrivateAAD(meta),"wrap",
    purpose,keyId,String(version)
  ]);
}

/**
 * Ephemeral injectable test keyring. No implicit/default keys, no network,
 * config parsing, fallback, runtime env access, or key bytes in JSON.
 * Caller-supplied Buffers are COPIED. getKek returns an independent copy.
 */
export function createInMemoryTestKeyProvider() {
  const keys=new Map();
  let destroyed=false;
  const id=({purpose,keyId,version})=>JSON.stringify([purpose,keyId,version]);
  const live=()=>{if(destroyed)cryptoDeny();};
  const entry=ref=>{live();validateKeyRef(ref);
    const item=keys.get(id(ref));
    if(!item||item.retired)cryptoDeny();
    return item;
  };
  return Object.freeze({
    registerKey(ref) {
      live();validateKeyRef(ref);
      const raw=ref?.key;
      if(!Buffer.isBuffer(raw)||raw.length!==DATA_KEY_BYTES||keys.has(id(ref)))cryptoDeny();
      // Refuse duplicate KEK bytes under ANY ID, version or purpose. A
      // rotated key must be genuinely new so a fresh IV namespace cannot
      // accidentally reuse the same AES-GCM key material.
      for(const old of keys.values()) {
        if(timingSafeEqual(old.key,raw))cryptoDeny();
      }
      keys.set(id(ref),{purpose:ref.purpose,key:Buffer.from(raw),retired:false});
      return true;
    },
    getKek(ref){return Buffer.from(entry(ref).key);},
    retireKey(ref){entry(ref).retired=true;return true;},
    removeKey(ref){
      const e=entry(ref);
      e.key.fill(0);
      keys.delete(id(ref));
      return true;
    },
    destroy(){
      if(!destroyed) {
        for(const e of keys.values())e.key.fill(0);
        keys.clear();
        destroyed=true;
      }
    }
  });
}
/**
 * Test-process registry against duplicate KEK-wrap nonces.
 * NOT a cross-process, durable or production nonce guarantee.
 */
export function createTestWrapNonceRegistry() {
  let closed=false;
  const seen=new Set();
  return Object.freeze({
    claim({purpose,keyId,version,iv}={}) {
      if(closed)cryptoDeny();
      validateKeyRef({purpose,keyId,version});
      if(!Buffer.isBuffer(iv)||iv.length!==GCM_IV_BYTES)cryptoDeny();
      const token=JSON.stringify([purpose,keyId,version,iv.toString("hex")]);
      if(seen.has(token))cryptoDeny();
      seen.add(token);
      return true;
    },
    destroy(){seen.clear();closed=true;}
  });
}
