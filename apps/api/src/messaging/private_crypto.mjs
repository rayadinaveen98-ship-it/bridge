/**
 * Bridge B1b: DISCONNECTED TEST-ONLY authenticated encryption codec.
 *
 * Synthetic plaintext + ephemeral in-memory test KEKs ONLY. This module is
 * not used by hosted HTTP/PostgreSQL, Android, Neon, Render, or a KMS.
 * This is server-side AEAD design, NOT end-to-end encryption.
 */
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {
  CRYPTO_SUITE,AAD_VERSION,DATA_KEY_BYTES,GCM_IV_BYTES,GCM_TAG_BYTES,
  MAX_MESSAGE_BYTES,cryptoDeny,validatePrivateMetadata,validateKeyRef,
  encodePrivateAAD,encodeWrapAAD
} from "./private_key_contract.mjs";

const decoder=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true});
function canonicalPlaintext(input) {
  let value;
  if(typeof input==="string") {
    if(!input.isWellFormed())cryptoDeny();
    value=input;
  } else if(Buffer.isBuffer(input)) {
    try{value=decoder.decode(input);}catch{cryptoDeny();}
  } else cryptoDeny();
  const bytes=Buffer.from(value.normalize("NFC"),"utf8");
  if(bytes.length<1||bytes.length>MAX_MESSAGE_BYTES)cryptoDeny();
  return bytes;
}
function strictBuffer(value,min,max=min) {
  if(!Buffer.isBuffer(value)||value.length<min||value.length>max)cryptoDeny();
  return value;
}
function encryptGcm({key,iv,plaintext,aad}) {
  const cipher=createCipheriv("aes-256-gcm",key,iv,{authTagLength:GCM_TAG_BYTES});
  cipher.setAAD(aad);
  return {
    ciphertext:Buffer.concat([cipher.update(plaintext),cipher.final()]),
    tag:cipher.getAuthTag()
  };
}
function decryptGcm({key,iv,ciphertext,tag,aad}) {
  const decipher=createDecipheriv("aes-256-gcm",key,iv,{authTagLength:GCM_TAG_BYTES});
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]);
}
function validateStored(record){
  if(!record||typeof record!=="object"||Array.isArray(record))cryptoDeny();
  if(record.cipherSuite!==CRYPTO_SUITE||record.aadVersion!==AAD_VERSION)cryptoDeny();
  validateKeyRef({purpose:"live",keyId:record.kekId,version:record.kekVersion});
  strictBuffer(record.ciphertext,1,MAX_MESSAGE_BYTES);
  strictBuffer(record.dataIv,GCM_IV_BYTES);
  strictBuffer(record.dataTag,GCM_TAG_BYTES);
  strictBuffer(record.wrappedDek,DATA_KEY_BYTES);
  strictBuffer(record.wrapIv,GCM_IV_BYTES);
  strictBuffer(record.wrapTag,GCM_TAG_BYTES);
}
/**
 * For each invocation: new CSPRNG 32-byte DEK + two independent 96-bit IVs.
 * A distinct purpose KEK encrypts the DEK with versioned authenticated AAD.
 * A required test registry rejects duplicate wrap nonces in this process.
 *
 * Future B2 must provide durable key custody and cross-process nonce controls.
 */
export function encryptSyntheticPrivate({
  plaintext,metadata,keyProvider,keyId,keyVersion,wrapNonceRegistry
}={}) {
  validatePrivateMetadata(metadata);
  validateKeyRef({purpose:metadata.purpose,keyId,version:keyVersion});
  if(typeof keyProvider?.getKek!=="function"||
     typeof wrapNonceRegistry?.claim!=="function")cryptoDeny();
  const payload=canonicalPlaintext(plaintext);
  const ref={purpose:metadata.purpose,keyId,version:keyVersion};
  const aad=encodePrivateAAD(metadata);
  const wrapAAD=encodeWrapAAD(metadata,ref);
  const dek=randomBytes(DATA_KEY_BYTES);
  let kek=null;
  try{
    kek=strictBuffer(keyProvider.getKek(ref),DATA_KEY_BYTES);
    const dataIv=randomBytes(GCM_IV_BYTES);
    const wrapIv=randomBytes(GCM_IV_BYTES);
    if(wrapNonceRegistry.claim({...ref,iv:wrapIv})!==true)cryptoDeny();
    const data=encryptGcm({key:dek,iv:dataIv,plaintext:payload,aad});
    const wrapped=encryptGcm({key:kek,iv:wrapIv,plaintext:dek,aad:wrapAAD});
    if(wrapped.ciphertext.length!==DATA_KEY_BYTES)cryptoDeny();
    return {
      ciphertext:data.ciphertext,
      dataIv,
      dataTag:data.tag,
      wrappedDek:wrapped.ciphertext,
      wrapIv,
      wrapTag:wrapped.tag,
      kekId:keyId,
      kekVersion:keyVersion,
      cipherSuite:CRYPTO_SUITE,
      aadVersion:AAD_VERSION
    };
  }catch{
    cryptoDeny(); // Do not expose library errors, keys, AAD, or plaintext.
  }finally{
    payload.fill(0); // Ephemeral normalized plaintext buffer, synthetic only.
    dek.fill(0);
    if(Buffer.isBuffer(kek))kek.fill(0);
  }
}
export function decryptSyntheticPrivate({record,metadata,keyProvider}={}) {
  validatePrivateMetadata(metadata);
  validateStored(record);
  if(typeof keyProvider?.getKek!=="function")cryptoDeny();
  const ref={purpose:metadata.purpose,keyId:record.kekId,version:record.kekVersion};
  const aad=encodePrivateAAD(metadata);
  const wrapAAD=encodeWrapAAD(metadata,ref);
  let kek=null,dek=null,plaintext=null;
  try{
    kek=strictBuffer(keyProvider.getKek(ref),DATA_KEY_BYTES);
    dek=decryptGcm({
      key:kek,iv:record.wrapIv,ciphertext:record.wrappedDek,
      tag:record.wrapTag,aad:wrapAAD
    });
    if(dek.length!==DATA_KEY_BYTES)cryptoDeny();
    plaintext=decryptGcm({
      key:dek,iv:record.dataIv,ciphertext:record.ciphertext,
      tag:record.dataTag,aad
    });
    if(plaintext.length<1||plaintext.length>MAX_MESSAGE_BYTES)cryptoDeny();
    const value=decoder.decode(plaintext);
    if(value!==value.normalize("NFC"))cryptoDeny();
    return value;
  }catch{
    cryptoDeny(); // AEAD failure is atomic: never return partial plaintext.
  }finally{
    if(Buffer.isBuffer(plaintext))plaintext.fill(0);
    if(Buffer.isBuffer(dek))dek.fill(0);
    if(Buffer.isBuffer(kek))kek.fill(0);
  }
}
