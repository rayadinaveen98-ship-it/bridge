/**
 * Bridge V2-06A current-session cursor contract, test-only disconnected.
 * Opaque HMAC cursor is an authorization-bounded position, NEVER a timeline ID.
 */
import {createHmac,timingSafeEqual,createHash} from "node:crypto";
export const hashBytes=(bytes)=>createHash("sha256").update(bytes).digest("hex");
const valid=(n)=>Number.isSafeInteger(n)&&n>=0;
function secretKey(key){
  if(!Buffer.isBuffer(key)||key.length<32)throw new TypeError("32-byte trusted key required");
  return key;
}
export function nextAcceptedSequence(current,{duplicate=false}={}){
  if(!valid(current)||current===0||current===Number.MAX_SAFE_INTEGER)
    throw new RangeError("Invalid DB sequence");
  return duplicate?{sequence:current-1,next:current}:{sequence:current,next:current+1};
}
export function signCursor({actorId,conversationId,scope="live",afterSequence,key}) {
  secretKey(key);
  if(typeof actorId!=="string"||typeof conversationId!=="string"||
     !["live","unread"].includes(scope)||!valid(afterSequence))
    throw new TypeError("Invalid cursor binding");
  const payload=Buffer.from(JSON.stringify([actorId,conversationId,scope,afterSequence]));
  const mac=createHmac("sha256",key).update(payload).digest();
  return payload.toString("base64url")+"."+mac.toString("base64url");
}
export function verifyCursor(token,{actorId,conversationId,scope="live",key}) {
  secretKey(key);
  if(typeof token!=="string"||token.length>1500||token.length<40||
     !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return null;
  const parts=token.split(".");
  try {
    const payload=Buffer.from(parts[0],"base64url"),mac=Buffer.from(parts[1],"base64url");
    if(mac.length!==32||!timingSafeEqual(mac,createHmac("sha256",key).update(payload).digest()))
      return null;
    const data=JSON.parse(payload.toString("utf8"));
    if(!Array.isArray(data)||data.length!==4||data[0]!==actorId||
       data[1]!==conversationId||data[2]!==scope||!valid(data[3]))return null;
    return data[3];
  }catch{return null;}
}
