/**
 * V2-04A domain gates. Pure; no SQL/HTTP; future live adapters are separately gated.
 * Keep is ONLY an eligibility check; V2-05 owns mutual Keep conversion.
 */
import {RANDOM_POLICY,RANDOM_IDLE_MS,isManagedRandom,evaluateRandom} from "./clock.mjs";
export {RANDOM_POLICY,RANDOM_IDLE_MS,isManagedRandom,evaluateRandom};
export const SESSION_RESULTS=Object.freeze({
  ACTIVE:"active",EXPIRED:"expired",CLOSED:"closed",UNAVAILABLE:"unavailable"
});
export function mayResume(room,serverTime){return evaluateRandom(room,serverTime)==="active";}
export function mayKeep(room,serverTime){return mayResume(room,serverTime);}
export function maySend(room,serverTime){return mayResume(room,serverTime);}
export function nextAcceptedClock(room,serverTime,isNew) {
  if(evaluateRandom(room,serverTime)!=="active"||isNew!==true)return null;
  const t=serverTime instanceof Date?serverTime:new Date(serverTime);
  if(!Number.isFinite(t.getTime()))return null;
  return Object.freeze({lastAcceptedAt:new Date(t.getTime()),
    idleExpiresAt:new Date(t.getTime()+RANDOM_IDLE_MS)});
}
export function terminalReason(room,serverTime,requested) {
  const result=evaluateRandom(room,serverTime);
  if(result==="unavailable")return null;
  if(result==="closed")return room.closed_reason||"ended";
  if(requested==="safety_closed")return "safety_closed";
  if(result==="expired")return "expired";
  if(requested==="ended")return "ended";
  return null; // "expire" cannot close an unexpired room.
}
