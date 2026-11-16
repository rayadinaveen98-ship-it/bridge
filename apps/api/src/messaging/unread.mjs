/**
 * V2-06A unread / recovery window model; no real body read or token transport.
 * Token material can be derived deterministically for idempotent test retries,
 * but production key custody and live delivery are separately gated.
 */
import {createHmac,createHash,timingSafeEqual} from "node:crypto";
export const UNREAD_MS=7*24*60*60*1000,RECOVERY_MS=15*60*1000;
const stamp=x=>x instanceof Date?x.getTime():Number.isSafeInteger(x)&&x>=0?x:null;
export function unreadExpiry(accepted) {
  const t=stamp(accepted);
  return t!==null&&Number.isSafeInteger(t+UNREAD_MS)?new Date(t+UNREAD_MS):null;
}
export function recoveryUntil(accepted,firstAck) {
  const a=stamp(accepted),b=stamp(firstAck);
  if(a===null||b===null||b<a||b>=a+UNREAD_MS)return null;
  return new Date(Math.min(b+RECOVERY_MS,a+UNREAD_MS));
}
export function tokenForAck({envelopeId,recipientId,acknowledgedAt,key}) {
  if(!Buffer.isBuffer(key)||key.length<32||
     typeof envelopeId!=="string"||typeof recipientId!=="string"||
     stamp(acknowledgedAt)===null)throw new TypeError("Invalid recovery binding");
  return createHmac("sha256",key).update(
    JSON.stringify(["v206-recovery-v1",envelopeId,recipientId,
      new Date(stamp(acknowledgedAt)).toISOString()])
  ).digest("base64url");
}
export function tokenDigest(token) {
  if(typeof token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new TypeError("Invalid recovery token");
  return createHash("sha256").update(token,"utf8").digest();
}
export function tokenMatches(token,expectedDigest){
  if(!Buffer.isBuffer(expectedDigest)||expectedDigest.length!==32)return false;
  try{return timingSafeEqual(tokenDigest(token),expectedDigest);}
  catch{return false;}
}
export function recoveryAllowed({envelope,now,token,digest}){
  if(envelope?.state!=="acknowledged"||!tokenMatches(token,digest))return false;
  const until=recoveryUntil(envelope.accepted_at,envelope.acknowledged_at);
  const t=stamp(now);
  return t!==null&&until!==null&&t<until.getTime()&&t<stamp(envelope.expires_at);
}
