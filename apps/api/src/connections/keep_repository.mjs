/**
 * V2-05A disconnected Keep adapter. Uses only V2-marked random sources.
 *
 * IMPORTANT: V2-04A close() commits separately and MUST NOT be called here.
 * Votes, source closure, relationship, D1, slot/queue cleanup all commit
 * atomically under the same match/block advisory lock.
 * Never exposes message bodies or past session transcripts.
 */
import {KEEP_DECISIONS,KEEP_RESULTS,validKeepDecision,keepOutcome} from "./keep.mjs";
import {isManagedRandom,evaluateRandom} from "../sessions/clock.mjs";
import {
  withV2ConnectionTx,instantAfterLocks,verifyPairEligibilityLocked,
  lockV2Relationship,openOrResumeDirectLocked,findOpenDirectLocked,denyDirect
} from "../sessions/direct_repository.mjs";

export class KeepDenied extends Error {
  constructor(code="session_unavailable"){super(code);this.name="KeepDenied";this.code=code;}
}
const deny=code=>{throw new KeepDenied(code);};

async function lockSource(c,conversationId) {
  const q=await c.query(
    "SELECT id,match_session_id,kind,state,policy_version,v2_session_role,"+
    "legacy_qa,last_accepted_at,idle_expires_at,closed_reason "+
    "FROM bridge_conversations WHERE id=$1 FOR UPDATE",[conversationId]);
  const room=q.rows[0];
  if(!room||!isManagedRandom(room)||!room.match_session_id)deny();
  return room;
}
async function eligiblePair(c,room,actorId) {
  const q=await c.query(
    "SELECT p.account_id,p.left_at FROM bridge_conversation_participants p "+
    "WHERE p.conversation_id=$1 ORDER BY p.account_id",[room.id]);
  if(q.rows.length!==2||q.rows.some(p=>p.left_at!==null)||
    !q.rows.some(p=>p.account_id===actorId))deny();
  const pair={member_low:q.rows[0].account_id,member_high:q.rows[1].account_id};
  try{await verifyPairEligibilityLocked(c,pair,actorId);}
  catch {deny();}
  return pair;
}
async function findExistingConnection(c,pair) {
  const q=await c.query(
    "SELECT id,member_low,member_high,source_conversation_id,policy_version,ended_at "+
    "FROM bridge_connections WHERE member_low=$1 AND member_high=$2 "+
    "AND ended_at IS NULL FOR UPDATE",
    [pair.member_low,pair.member_high]);
  const current=q.rows[0];
  if(current&&current.policy_version!=="bridge-v2")deny("existing_legacy_connection");
  return current||null;
}
async function matchCanConvert(c,room,pair) {
  const q=await c.query(
    "SELECT id,state,member_low,member_high FROM bridge_match_sessions "+
    "WHERE id=$1 FOR UPDATE",[room.match_session_id]);
  const match=q.rows[0];
  if(!match||match.state!=="active"||
     match.member_low!==pair.member_low||match.member_high!==pair.member_high)
    deny();
  const slots=await c.query(
    "SELECT account_id FROM bridge_active_match_slots "+
    "WHERE match_session_id=$1 ORDER BY account_id FOR UPDATE",
    [room.match_session_id]);
  if(slots.rows.length!==2||slots.rows[0].account_id!==pair.member_low||
     slots.rows[1].account_id!==pair.member_high)deny();
}
async function convertedReplay(c,room,pair,actorId) {
  if(room.state!=="closed"||room.closed_reason!=="converted")deny();
  const rel=await findExistingConnection(c,pair);
  if(!rel)deny();
  // Only the original source or an existing active pair can be returned;
  // an unrelated caller cannot learn ID or content from guessed source.
  const active=await lockV2Relationship(c,rel.id,actorId);
  const segment=await findOpenDirectLocked(c,active.id);
  const now=await instantAfterLocks(c);
  const {directState}=await import("../sessions/direct_lifecycle.mjs");
  const current=segment&&directState(segment.room,segment.segment,active.id,now)==="active"
    ?segment.room.id:null;
  return {status:KEEP_RESULTS.CONNECTED,connectionId:active.id,
    conversationId:current,sourceConversationId:null};
}
export function createKeepRepository(pool,{failureHook=null}={}) {
  if(!pool?.connect)throw new TypeError("PostgreSQL pool required");
  if(failureHook!==null&&typeof failureHook!=="function")
    throw new TypeError("failureHook must be a function");
  const stage=async name=>{if(failureHook)await failureHook(name);};
  return Object.freeze({
    async vote({conversationId,actorId,decision}) {
      if(!validKeepDecision(decision))deny("invalid_keep_decision");
      return withV2ConnectionTx(pool,async c=>{
        const room=await lockSource(c,conversationId);
        const pair=await eligiblePair(c,room,actorId);
        if(room.state==="closed"){
          if(decision===KEEP_DECISIONS.WITHDRAW)deny("already_connected");
          return convertedReplay(c,room,pair,actorId);
        }
        if(room.state!=="open")deny();
        await matchCanConvert(c,room,pair);
        const tick=await instantAfterLocks(c); // AFTER waits and locks.
        const state=evaluateRandom(room,tick);
        if(state!=="active")deny(state==="expired"?"session_expired":"session_unavailable");

        await c.query(
          "INSERT INTO bridge_connection_votes(conversation_id,voter_id,status,updated_at) "+
          "VALUES($1,$2,$3,$4) ON CONFLICT(conversation_id,voter_id) "+
          "DO UPDATE SET status=EXCLUDED.status,updated_at=EXCLUDED.updated_at",
          [conversationId,actorId,
           decision===KEEP_DECISIONS.ACCEPT?"accepted":"withdrawn",tick]);
        await stage("after_vote");
        const rows=await c.query(
          "SELECT voter_id,status FROM bridge_connection_votes WHERE conversation_id=$1",
          [conversationId]);
        const voters=rows.rows;
        const outcome=keepOutcome(decision,voters,
          [pair.member_low,pair.member_high]);
        if(outcome!==KEEP_RESULTS.CONNECTED)return {status:outcome};

        let relation=await findExistingConnection(c,pair);
        if(!relation) {
          const inserted=await c.query(
            "INSERT INTO bridge_connections "+
            "(member_low,member_high,source_conversation_id,policy_version) "+
            "VALUES($1,$2,$3,$4) RETURNING id,member_low,member_high,"+
            "source_conversation_id,policy_version,ended_at",
            [pair.member_low,pair.member_high,room.id,"bridge-v2"]);
          relation=inserted.rows[0];
        }
        await stage("after_connection");
        await c.query(
          "UPDATE bridge_conversations SET state='closed',closed_reason='converted',"+
          "closed_at=$2 WHERE id=$1 AND kind='random' AND state='open'",
          [room.id,tick]);
        await stage("after_source_close");
        await c.query(
          "UPDATE bridge_match_sessions SET state='ended',ended_at=$2 "+
          "WHERE id=$1 AND state='active'",[room.match_session_id,tick]);
        await c.query(
          "DELETE FROM bridge_active_match_slots WHERE match_session_id=$1",
          [room.match_session_id]);
        await c.query(
          "UPDATE bridge_match_queue SET state='cancelled' WHERE "+
          "match_session_id=$1 AND state IN ('waiting','reserved')",
          [room.match_session_id]);
        await stage("after_slots");
        // Initial D1 created within the SAME Keep-transaction as source close.
        const direct=await openOrResumeDirectLocked(c,relation,tick);
        await stage("after_direct");
        return {status:KEEP_RESULTS.CONNECTED,connectionId:relation.id,
          conversationId:direct.conversationId,sourceConversationId:null};
      });
    }
  });
}
