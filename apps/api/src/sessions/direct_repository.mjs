/**
 * V2-05A disconnected direct-session domain adapter.
 * No import from current http/postgres/start/live; no hosted-DB calls.
 * A single advisory lock precedes relationship/session row locks for V2-only
 * synthetic PG16 tests. Production integration requires separate approval.
 */
import {DIRECT_POLICY,directState,mayStartDirect} from "./direct_lifecycle.mjs";

const MATCH_MUTEX_ID=714411;
export class DirectSessionDenied extends Error {
  constructor(code="resource_unavailable"){super(code);this.name="DirectSessionDenied";this.code=code;}
}
export function denyDirect(code){throw new DirectSessionDenied(code);}
export async function withV2ConnectionTx(pool,work) {
  if(!pool?.connect)throw new TypeError("PostgreSQL pool required");
  const c=await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock($1)",[MATCH_MUTEX_ID]);
    const result=await work(c);
    await c.query("COMMIT");
    return result;
  } catch(error) {
    try{await c.query("ROLLBACK");}catch{/* preserve cause */}
    throw error;
  } finally {c.release();}
}
export async function instantAfterLocks(c) {
  return (await c.query("SELECT clock_timestamp() AS instant")).rows[0].instant;
}
const authorizedIds=(pair,actorId)=>(
  pair?.member_low===actorId||pair?.member_high===actorId
);
export async function verifyPairEligibilityLocked(c,pair,actorId,{strict=true}={}) {
  if(!authorizedIds(pair,actorId))denyDirect();
  if(!strict)return;
  const members=(await c.query(
    "SELECT id,status,age_verified_at,safety_eligible FROM bridge_accounts "+
    "WHERE id IN ($1,$2) ORDER BY id",
    [pair.member_low,pair.member_high])).rows;
  if(members.length!==2||members.some(m=>m.status!=="active"||
     m.age_verified_at==null||m.safety_eligible!==true))denyDirect();
  const block=await c.query(
    "SELECT 1 FROM bridge_blocks WHERE "+
    "(blocker_id=$1 AND blocked_id=$2) OR "+
    "(blocker_id=$2 AND blocked_id=$1) LIMIT 1",
    [pair.member_low,pair.member_high]);
  if(block.rows.length)denyDirect();
}
export async function lockV2Relationship(c,connectionId,actorId,{
  strict=true,requireActive=true
}={}) {
  const rows=await c.query(
    "SELECT id,member_low,member_high,source_conversation_id,ended_at,policy_version "+
    "FROM bridge_connections WHERE id=$1 FOR UPDATE",[connectionId]);
  const pair=rows.rows[0];
  if(!pair||pair.policy_version!==DIRECT_POLICY)denyDirect();
  await verifyPairEligibilityLocked(c,pair,actorId,{strict});
  const source=await c.query(
    "SELECT kind,state,closed_reason,policy_version,v2_session_role,legacy_qa "+
    "FROM bridge_conversations WHERE id=$1",[pair.source_conversation_id]);
  const s=source.rows[0];
  if(!s||s.kind!=="random"||s.state!=="closed"||
     s.closed_reason!=="converted"||s.policy_version!==DIRECT_POLICY||
     s.v2_session_role!=="random"||s.legacy_qa!==false)denyDirect();
  const members=await c.query(
    "SELECT account_id FROM bridge_conversation_participants "+
    "WHERE conversation_id=$1 ORDER BY account_id",
    [pair.source_conversation_id]);
  if(members.rows.length!==2||
     members.rows[0].account_id!==pair.member_low||
     members.rows[1].account_id!==pair.member_high)denyDirect();
  if(requireActive&&!mayStartDirect(pair))denyDirect();
  return pair;
}
export async function findOpenDirectLocked(c,connectionId) {
  const q=await c.query(
    "SELECT ds.conversation_id,ds.connection_id,ds.state AS segment_state,"+
    "ds.policy_version AS segment_policy,conv.id AS room_id,"+
    "conv.kind,conv.state,conv.policy_version,conv.v2_session_role,"+
    "conv.legacy_qa,conv.connection_id AS room_connection_id,"+
    "conv.last_accepted_at,conv.idle_expires_at,conv.next_message_sequence "+
    "FROM bridge_v2_direct_sessions ds "+
    "JOIN bridge_conversations conv ON conv.id=ds.conversation_id "+
    "WHERE ds.connection_id=$1 AND ds.state='open' "+
    "FOR UPDATE OF ds,conv",[connectionId]);
  const data=q.rows[0];
  if(!data)return null;
  const room={
    id:data.room_id,kind:data.kind,state:data.state,
    policy_version:data.policy_version,v2_session_role:data.v2_session_role,
    legacy_qa:data.legacy_qa,connection_id:data.room_connection_id,
    last_accepted_at:data.last_accepted_at,
    idle_expires_at:data.idle_expires_at,
    next_message_sequence:data.next_message_sequence
  };
  const segment={
    conversation_id:data.conversation_id,connection_id:data.connection_id,
    state:data.segment_state,policy_version:data.segment_policy
  };
  return {room,segment};
}
export async function closeDirectLocked(c,entry,instant,reason) {
  if(!["expired","ended","safety_closed"].includes(reason))
    denyDirect("invalid_terminal_reason");
  if(!entry||entry.room.state!=="open"||entry.segment.state!=="open")
    return {status:"already_closed",reason};
  await c.query(
    "UPDATE bridge_conversations SET state='closed',closed_reason=$2,closed_at=$3 "+
    "WHERE id=$1 AND state='open'",
    [entry.room.id,reason,instant]);
  await c.query(
    "UPDATE bridge_v2_direct_sessions SET state='closed',closed_at=$2 "+
    "WHERE conversation_id=$1 AND state='open'",
    [entry.room.id,instant]);
  return {status:"closed",reason,conversationId:entry.room.id};
}
export async function insertFreshDirectLocked(c,pair,instant) {
  if(!mayStartDirect(pair))denyDirect();
  const q=await c.query(
    "INSERT INTO bridge_conversations "+
    "(kind,state,policy_version,v2_session_role,legacy_qa,connection_id,"+
    "next_message_sequence,last_accepted_at,idle_expires_at) "+
    "VALUES('connection','open',$1,'direct',false,$2,1,"+
    "$3::timestamptz,($3::timestamptz)+interval '30 minutes') "+
    "RETURNING id,idle_expires_at",
    [DIRECT_POLICY,pair.id,instant]);
  const room=q.rows[0];
  await c.query(
    "INSERT INTO bridge_conversation_participants(conversation_id,account_id) "+
    "VALUES($1,$2),($1,$3)",
    [room.id,pair.member_low,pair.member_high]);
  await c.query(
    "INSERT INTO bridge_v2_direct_sessions "+
    "(conversation_id,connection_id,state,policy_version,opened_at) "+
    "VALUES($1,$2,'open',$3,$4)",
    [room.id,pair.id,DIRECT_POLICY,instant]);
  return {status:"created",connectionId:pair.id,conversationId:room.id,
    expiresAt:room.idle_expires_at};
}
/**
 * Only a relationship may outlive a direct segment.
 * Every open/reopen checks current eligibility and block state.
 */
export async function openOrResumeDirectLocked(c,pair,instant) {
  const existing=await findOpenDirectLocked(c,pair.id);
  if(existing) {
    const state=directState(existing.room,existing.segment,pair.id,instant);
    if(state==="active")return {status:"resumed",connectionId:pair.id,
      conversationId:existing.room.id,expiresAt:existing.room.idle_expires_at};
    if(state!=="expired")denyDirect();
    await closeDirectLocked(c,existing,instant,"expired");
  }
  return insertFreshDirectLocked(c,pair,instant);
}
export function createDirectSessionRepository(pool) {
  if(!pool?.connect)throw new TypeError("PostgreSQL pool required");
  return Object.freeze({
    async open({connectionId,actorId}) {
      return withV2ConnectionTx(pool,async c=>{
        const pair=await lockV2Relationship(c,connectionId,actorId);
        const current=await findOpenDirectLocked(c,pair.id);
        // Always sample clock after row locks, including an active D1 row.
        const now=await instantAfterLocks(c);
        if(current){
          const state=directState(current.room,current.segment,pair.id,now);
          if(state==="active")return {status:"resumed",connectionId:pair.id,
            conversationId:current.room.id,expiresAt:current.room.idle_expires_at};
          if(state!=="expired")denyDirect();
          await closeDirectLocked(c,current,now,"expired");
          return insertFreshDirectLocked(c,pair,now);
        }
        return insertFreshDirectLocked(c,pair,now);
      });
    },
    async current({conversationId,actorId}) {
      return withV2ConnectionTx(pool,async c=>{
        const lookup=await c.query(
          "SELECT connection_id FROM bridge_v2_direct_sessions "+
          "WHERE conversation_id=$1",[conversationId]);
        if(lookup.rows.length!==1)denyDirect();
        const pair=await lockV2Relationship(c,lookup.rows[0].connection_id,actorId);
        const current=await findOpenDirectLocked(c,pair.id);
        if(!current||current.room.id!==conversationId)denyDirect();
        if(directState(current.room,current.segment,pair.id,
             await instantAfterLocks(c))!=="active")denyDirect();
        return {connectionId:pair.id,conversationId,expiresAt:current.room.idle_expires_at};
      });
    },
    async end({conversationId,actorId}) {
      return withV2ConnectionTx(pool,async c=>{
        const lookup=await c.query(
          "SELECT connection_id,state FROM bridge_v2_direct_sessions "+
          "WHERE conversation_id=$1",[conversationId]);
        if(lookup.rows.length!==1)denyDirect();
        const pair=await lockV2Relationship(c,lookup.rows[0].connection_id,actorId,
          {strict:false,requireActive:false});
        if(lookup.rows[0].state==="closed")return {status:"already_closed"};
        const current=await findOpenDirectLocked(c,pair.id);
        if(!current||current.room.id!==conversationId)denyDirect();
        const now=await instantAfterLocks(c);
        const state=directState(current.room,current.segment,pair.id,now);
        if(state==="unavailable"||state==="closed")denyDirect();
        return closeDirectLocked(c,current,now,state==="expired"?"expired":"ended");
      });
    },
    async endRelationship({connectionId,actorId}) {
      return withV2ConnectionTx(pool,async c=>{
        const pair=await lockV2Relationship(c,connectionId,actorId,
          {strict:false,requireActive:false});
        if(pair.ended_at)return {status:"already_ended"};
        const current=await findOpenDirectLocked(c,pair.id);
        const now=await instantAfterLocks(c);
        if(current){
          if(directState(current.room,current.segment,pair.id,now)==="unavailable")
            denyDirect();
          await closeDirectLocked(c,current,now,"safety_closed");
        }
        await c.query(
          "UPDATE bridge_connections SET ended_at=$2,revocation_reason='user_ended' "+
          "WHERE id=$1 AND ended_at IS NULL",[pair.id,now]);
        return {status:"ended"};
      });
    }
  });
}
