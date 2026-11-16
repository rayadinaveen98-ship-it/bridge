/**
 * Bridge V2-04A random-room clock contract. NO background worker.
 * Caller supplies a server-origin timestamp (never Date.now/phone time).
 */
export const RANDOM_IDLE_MS=30*60*1000;
export const RANDOM_POLICY="bridge-v2";
export const TERMINAL_REASONS=Object.freeze([
  "expired","ended","safety_closed"
]);
export function epoch(value) {
  if(value instanceof Date)return Number.isFinite(value.getTime())?value.getTime():null;
  return Number.isSafeInteger(value)&&value>=0?value:null;
}
export function deadlineFrom(accepted) {
  const t=epoch(accepted);
  if(t===null||!Number.isSafeInteger(t+RANDOM_IDLE_MS))return null;
  return t+RANDOM_IDLE_MS;
}
export function isManagedRandom(room) {
  return Boolean(room && room.kind==="random" &&
    room.v2_session_role==="random" &&
    room.policy_version===RANDOM_POLICY &&
    room.legacy_qa===false &&
    epoch(room.last_accepted_at)!==null &&
    epoch(room.idle_expires_at)!==null &&
    epoch(room.idle_expires_at)===deadlineFrom(room.last_accepted_at));
}
export function evaluateRandom(room,serverTime) {
  const now=epoch(serverTime);
  if(now===null||!isManagedRandom(room))return "unavailable";
  if(room.state!=="open")return "closed";
  return now>=epoch(room.idle_expires_at)?"expired":"active";
}
