/**
 * V2-05A direct-session time windows are independent of the free relationship.
 * No paid entitlement, message body, unread or transcript behavior lives here.
 */
export const DIRECT_POLICY="bridge-v2";
export const DIRECT_IDLE_MS=30*60*1000;
export function millis(value) {
  if(value instanceof Date)return Number.isFinite(value.getTime())?value.getTime():null;
  return Number.isSafeInteger(value)&&value>=0?value:null;
}
export function isV2Direct(room,segment,relationId) {
  const last=millis(room?.last_accepted_at);
  const expiry=millis(room?.idle_expires_at);
  return Boolean(room && segment &&
    room.kind==="connection"&&room.v2_session_role==="direct"&&
    room.policy_version===DIRECT_POLICY&&room.legacy_qa===false&&
    room.connection_id===relationId&&
    segment.connection_id===relationId&&segment.conversation_id===room.id&&
    segment.policy_version===DIRECT_POLICY&&
    last!==null&&expiry!==null&&expiry-last===DIRECT_IDLE_MS);
}
export function directState(room,segment,relationId,serverInstant) {
  if(!isV2Direct(room,segment,relationId))return "unavailable";
  if(room.state!=="open"||segment.state!=="open")return "closed";
  const now=millis(serverInstant);
  if(now===null)return "unavailable";
  return now>=millis(room.idle_expires_at)?"expired":"active";
}
export function mayStartDirect(relation) {
  return Boolean(relation?.policy_version===DIRECT_POLICY && relation?.ended_at==null);
}
