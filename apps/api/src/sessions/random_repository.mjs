/**
 * V2-04A DISCONNECTED PostgreSQL adapter. No existing HTTP, matching,
 * startup, live hub or other production modules import this file.
 * Tests connect only to the disposable loopback bridge_test database.
 *
 * All changes are limited to explicitly marked V2 random rooms.
 * Never infer "not legacy" from a NULL legacy_qa flag.
 */
import {randomUUID} from "node:crypto";
import {evaluateRandom,isManagedRandom,RANDOM_POLICY} from "./clock.mjs";
import {nextAcceptedClock,terminalReason} from "./random_lifecycle.mjs";

const MATCH_MUTEX_ID=714411; // Match/block mutex from isolated V1 baseline.
export class RandomSessionDenied extends Error {
  constructor(code="session_unavailable") {super(code);this.name="RandomSessionDenied";this.code=code;}
}
const deny=code=>{throw new RandomSessionDenied(code);};
async function tx(pool,action) {
  const c=await pool.connect();
  try {
    await c.query("BEGIN");
    // Uniform ordering for ALL V2-04A writes and reads. V1 routes are not wired.
    await c.query("SELECT pg_advisory_xact_lock($1)",[MATCH_MUTEX_ID]);
    const value=await action(c);
    await c.query("COMMIT");
    return value;
  } catch(e) {
    try {await c.query("ROLLBACK");} catch {/* preserve cause */}
    throw e;
  } finally {c.release();}
}
async function dbInstant(c) {
  // PostgreSQL now() is TRANSACTION start, not time AFTER lock wait.
  return (await c.query("SELECT clock_timestamp() AS tick")).rows[0].tick;
}
async function lockRoom(c,id) {
  const q=await c.query(
    "SELECT id,match_session_id,kind,state,policy_version,v2_session_role,"+
    "legacy_qa,last_accepted_at,idle_expires_at,closed_reason,next_message_sequence "+
    "FROM bridge_conversations WHERE id=$1 FOR UPDATE",[id]);
  if(q.rows.length!==1)deny("session_unavailable");
  const room=q.rows[0];
  if(!isManagedRandom(room) || !room.match_session_id)deny("session_unavailable");
  return room;
}
async function checkMembership(c,id,actorId,{requireEligible=true}={}) {
  const q=await c.query(
    "SELECT p.account_id,p.left_at,a.status,a.age_verified_at,a.safety_eligible "+
    "FROM bridge_conversation_participants p JOIN bridge_accounts a ON a.id=p.account_id "+
    "WHERE p.conversation_id=$1 ORDER BY p.account_id",[id]);
  if(q.rows.length!==2||q.rows.some(p=>p.left_at!==null)||
     !q.rows.some(p=>p.account_id===actorId))deny("session_unavailable");
  if(requireEligible&&q.rows.some(p=>p.status!=="active"||!p.age_verified_at||
      p.safety_eligible!==true))deny("session_unavailable");
  const a=q.rows[0].account_id,b=q.rows[1].account_id;
  if(requireEligible&&(await c.query(
    "SELECT 1 FROM bridge_blocks WHERE (blocker_id=$1 AND blocked_id=$2)"+
    " OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",[a,b])).rows.length)
    deny("session_unavailable");
  return [a,b];
}
function currentState(room,tick) {
  const state=evaluateRandom(room,tick);
  if(state!=="active")deny(state==="expired"?"session_expired":"session_unavailable");
}
async function endLocked(c,room,instant,reason,hook) {
  if(room.state!=="open")return {status:"already_closed",reason:room.closed_reason};
  await c.query(
    "UPDATE bridge_conversations SET state='closed',closed_reason=$2,closed_at=$3 WHERE id=$1",
    [room.id,reason,instant]);
  await hook?.("closed_room");
  const matchState=reason==="expired"?"expired":"ended";
  await c.query(
    "UPDATE bridge_match_sessions SET state=$2,ended_at=$3 "+
    "WHERE id=$1 AND state IN ('active','reserved')",
    [room.match_session_id,matchState,instant]);
  await hook?.("closed_match");
  // The parent match ID prevents deleting new/unrelated future slots.
  await c.query("DELETE FROM bridge_active_match_slots WHERE match_session_id=$1",
    [room.match_session_id]);
  await hook?.("released_slots");
  const queueState=reason==="expired"?"expired":"cancelled";
  await c.query(
    "UPDATE bridge_match_queue SET state=$2 WHERE match_session_id=$1 "+
    "AND state IN ('waiting','reserved')",[room.match_session_id,queueState]);
  await hook?.("cleaned_queue");
  return {status:"closed",reason};
}
export function createRandomSessionRepository(pool,{failureHook=null}={}) {
  if(!pool?.connect)throw new TypeError("A PostgreSQL pool is required");
  if(failureHook!==null&&typeof failureHook!=="function")
    throw new TypeError("failureHook must be a function");
  return Object.freeze({
    // Called only by isolated fixture flow for an already-claimed active match.
    async activate({matchId}) {
      return tx(pool,async c=>{
        const q=await c.query(
          "SELECT id,member_low,member_high,state FROM bridge_match_sessions "+
          "WHERE id=$1 FOR UPDATE",[matchId]);
        if(q.rows.length!==1||q.rows[0].state!=="active")deny();
        const pair=q.rows[0];
        const slots=await c.query(
          "SELECT account_id FROM bridge_active_match_slots "+
          "WHERE match_session_id=$1 ORDER BY account_id FOR UPDATE",[matchId]);
        if(slots.rows.length!==2 || slots.rows[0].account_id!==pair.member_low ||
           slots.rows[1].account_id!==pair.member_high)deny();
        const eligible=await c.query(
          "SELECT id FROM bridge_accounts WHERE id IN ($1,$2) AND status='active' "+
          "AND age_verified_at IS NOT NULL AND safety_eligible=true",
          [pair.member_low,pair.member_high]);
        if(eligible.rows.length!==2)deny();
        const blocked=await c.query(
          "SELECT 1 FROM bridge_blocks WHERE "+
          "(blocker_id=$1 AND blocked_id=$2) OR "+
          "(blocker_id=$2 AND blocked_id=$1) LIMIT 1",
          [pair.member_low,pair.member_high]);
        if(blocked.rows.length)deny();
        const existing=await c.query("SELECT 1 FROM bridge_conversations "+
          "WHERE match_session_id=$1",[matchId]);
        if(existing.rows.length)deny("session_exists");
        const instant=await dbInstant(c);
        const r=await c.query(
          "INSERT INTO bridge_conversations(match_session_id,kind,state,policy_version,"+
          "v2_session_role,legacy_qa,last_accepted_at,idle_expires_at) "+
          "VALUES($1,'random','open',$2,'random',false,$3,$3+interval '30 minutes') "+
          "RETURNING id,last_accepted_at,idle_expires_at",
          [matchId,RANDOM_POLICY,instant]);
        await c.query("UPDATE bridge_match_sessions SET activated_at=$2 WHERE id=$1",
          [matchId,instant]);
        await c.query(
          "INSERT INTO bridge_conversation_participants(conversation_id,account_id) "+
          "VALUES($1,$2),($1,$3)",[r.rows[0].id,pair.member_low,pair.member_high]);
        return {id:r.rows[0].id,matchId,
          activatedAt:r.rows[0].last_accepted_at,
          expiresAt:r.rows[0].idle_expires_at};
      });
    },
    async current({conversationId,actorId}) {
      return tx(pool,async c=>{
        const room=await lockRoom(c,conversationId);
        await checkMembership(c,conversationId,actorId);
        const tick=await dbInstant(c);
        currentState(room,tick);
        return {id:room.id,state:"active",expiresAt:room.idle_expires_at};
      });
    },
    // "Keep pending" is merely a current-state gate; V2-05 owns voting.
    async keepAllowed({conversationId,actorId}) {
      return tx(pool,async c=>{
        const room=await lockRoom(c,conversationId);
        await checkMembership(c,conversationId,actorId);
        currentState(room,await dbInstant(c));
        return {allowed:true};
      });
    },
    async acceptUnique({conversationId,actorId,clientMessageId,body}) {
      if(typeof body!=="string"||body.length<1||body.length>4000||
         typeof clientMessageId!=="string"||!clientMessageId)
        deny("invalid_message");
      return tx(pool,async c=>{
        const room=await lockRoom(c,conversationId);
        await checkMembership(c,conversationId,actorId);
        // Required: authoritative time AFTER all awaited DB/row locks.
        const tick=await dbInstant(c);
        currentState(room,tick);
        const existing=await c.query(
          "SELECT id,sequence_number,body FROM bridge_messages "+
          "WHERE conversation_id=$1 AND sender_id=$2 AND client_message_id=$3",
          [conversationId,actorId,clientMessageId]);
        if(existing.rows.length){
          if(existing.rows[0].body!==body)deny("idempotency_conflict");
          return {status:"duplicate",id:existing.rows[0].id,
            sequenceNumber:Number(existing.rows[0].sequence_number)};
        }
        const clock=nextAcceptedClock(room,tick,true);
        if(!clock)deny("session_expired");
        const id=randomUUID();
        await c.query(
          "INSERT INTO bridge_messages(id,conversation_id,sender_id,client_message_id,"+
          "sequence_number,body,sent_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [id,conversationId,actorId,clientMessageId,
           room.next_message_sequence,body,tick]);
        await c.query(
          "UPDATE bridge_conversations SET next_message_sequence=next_message_sequence+1,"+
          "last_accepted_at=$2,idle_expires_at=$3 WHERE id=$1",
          [conversationId,clock.lastAcceptedAt,clock.idleExpiresAt]);
        await c.query(
          "INSERT INTO bridge_event_outbox(event_key,event_type,conversation_id,payload) "+
          "VALUES($1,'conversation.message.accepted',$2,$3::jsonb) "+
          "ON CONFLICT(event_key) DO NOTHING",
          ["message:"+id,conversationId,JSON.stringify({
            messageId:id,sequenceNumber:Number(room.next_message_sequence)
          })]);
        return {status:"accepted",id,sequenceNumber:Number(room.next_message_sequence)};
      });
    },
    async close({conversationId,actorId,reason="ended"}) {
      if(!["ended","expired","safety_closed"].includes(reason))
        deny("invalid_terminal_reason");
      return tx(pool,async c=>{
        const room=await lockRoom(c,conversationId);
        // Participant may End even if their account is currently restricted.
        await checkMembership(c,conversationId,actorId,{requireEligible:false});
        const tick=await dbInstant(c);
        const terminal=terminalReason(room,tick,reason);
        if(terminal===null)deny("session_not_expired");
        // Preserve initial reason forever. No terminal resurrection/overwrite.
        if(room.state==="closed")return {status:"already_closed",reason:terminal};
        return endLocked(c,room,tick,terminal,failureHook);
      });
    }
  });
}
