/**
 * Bridge V2-06A disconnected metadata-only authorization.
 * This is NOT an HTTP/authentication adapter. Caller must derive EVERY fact
 * from a trusted locked DB read, never from a phone-supplied policy flag.
 */
import {evaluateRandom,isManagedRandom} from "../sessions/clock.mjs";
import {directState,isV2Direct} from "../sessions/direct_lifecycle.mjs";
export class MessagingDenied extends Error {
  constructor(){super("resource_unavailable");this.name="MessagingDenied";this.code="resource_unavailable";}
}
export const deny=()=>{throw new MessagingDenied();};
const stamp=x=>x instanceof Date?x.getTime():Number.isSafeInteger(x)&&x>=0?x:null;
export const finiteTime=stamp;
export function pairAllowed({actorId,participants,accounts,blocked=false}={}) {
  if(typeof actorId!=="string"||!Array.isArray(participants)||participants.length!==2||
     new Set(participants).size!==2||!participants.includes(actorId)||
     !Array.isArray(accounts)||accounts.length!==2||blocked!==false)return false;
  const ids=new Set(participants);
  return accounts.every(a=>ids.has(a?.id)&&a.status==="active"&&
    a.age_verified_at!=null&&a.safety_eligible===true)&&
    new Set(accounts.map(a=>a.id)).size===2;
}
export function liveStatus({room,segment=null,relation=null,actorId,participants,
  accounts,blocked=false,now}={}) {
  if(!pairAllowed({actorId,participants,accounts,blocked}))return "unavailable";
  if(!room||stamp(now)===null)return "unavailable";
  if(room.kind==="random") {
    if(relation!==null||segment!==null||!isManagedRandom(room))return "unavailable";
    return evaluateRandom(room,now);
  }
  if(room.kind==="connection"){
    if(!relation||relation.policy_version!=="bridge-v2"||relation.ended_at!=null||
       !participants.includes(relation.member_low)||!participants.includes(relation.member_high)||
       !isV2Direct(room,segment,relation.id))return "unavailable";
    return directState(room,segment,relation.id,now);
  }
  return "unavailable";
}
export function requireLive(context) {
  if(liveStatus(context)!=="active")deny();
  return true;
}
export function unreadStatus({envelope,actorId,relation,accounts,blocked=false,now}={}) {
  if(!envelope||!relation||envelope.connection_id!==relation.id||
     envelope.recipient_id!==actorId||relation.policy_version!=="bridge-v2"||
     relation.ended_at!=null||!pairAllowed({
       actorId,participants:[relation.member_low,relation.member_high],accounts,blocked
     }))return "unavailable";
  const t=stamp(now),accepted=stamp(envelope.accepted_at),expires=stamp(envelope.expires_at);
  if(t===null||accepted===null||expires===null||expires<=accepted||
     expires>accepted+7*86400000||t>=expires)return "expired";
  if(envelope.state==="revoked"||envelope.state==="expired")return "unavailable";
  if(envelope.state==="unread"&&envelope.acknowledged_at==null)return "unread";
  if(envelope.state==="acknowledged"&&stamp(envelope.acknowledged_at)!==null)
    return "acknowledged";
  return "unavailable";
}
