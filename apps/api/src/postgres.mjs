import { randomInt } from "node:crypto";
import { findCandidate } from "../../../packages/matching/src/index.mjs";
import { ApiError } from "./auth.mjs";

const MATCH_MUTEX_ID = 714411; // M1 only; global matchmaking/blocks lock, revisit for scaling.
const PAGE_SIZE = 50;

export async function transaction(pool, action) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await action(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
    throw error;
  } finally { client.release(); }
}

function requireRows(result, status = 404, code = "not_found") {
  if (!result.rows.length) throw new ApiError(status, code);
  return result.rows[0];
}

async function account(c, subject, eligible = false, forUpdate = false) {
  const q = await c.query(
    "SELECT id,status,age_verified_at,safety_eligible FROM bridge_accounts WHERE auth_subject=$1" +
    (forUpdate ? " FOR UPDATE" : ""), [subject]
  );
  const a = requireRows(q, 403, "account_unavailable");
  if (a.status !== "active") throw new ApiError(403, "account_restricted");
  if (eligible && (!a.age_verified_at || a.safety_eligible !== true)) {
    throw new ApiError(403, "account_not_eligible");
  }
  return a;
}

async function languages(c, id) {
  const r = await c.query(
    "SELECT l.language_code AS code FROM bridge_account_languages l " +
    "JOIN bridge_supported_languages s ON s.code=l.language_code " +
    "WHERE l.account_id=$1 AND s.moderation_ready=true ORDER BY l.language_code", [id]);
  return r.rows.map(x => x.code);
}

async function blocked(c, a, b) {
  const q = await c.query(
    "SELECT 1 FROM bridge_blocks WHERE (blocker_id=$1 AND blocked_id=$2) " +
    "OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1", [a,b]);
  return q.rows.length !== 0;
}

async function participants(c, conversationId, subject) {
  const me = await account(c,subject,true);
  const conv = requireRows(await c.query(
    "SELECT id,state,kind,next_message_sequence,match_session_id FROM bridge_conversations WHERE id=$1 FOR UPDATE",
    [conversationId]), 404);
  const q = await c.query(
    "SELECT account_id,left_at FROM bridge_conversation_participants WHERE conversation_id=$1 ORDER BY account_id", [conversationId]);
  const members=q.rows.map(x=>x.account_id);
  if (members.length !== 2 || !members.includes(me.id)) throw new ApiError(404,"not_found");
  const other=members.find(x=>x!==me.id);
  if (await blocked(c,me.id,other)) throw new ApiError(403,"blocked");
  return {me,other,conv,participant:q.rows.find(x=>x.account_id===me.id)};
}

export function createPostgresService(pool, onError = () => {}) {
  if (!pool?.query || !pool?.connect) throw new TypeError("Postgres pool required");
  return {
    onError,
    // Checked on connection AND before every live notification. The client
    // never chooses its own age, account ID or moderation eligibility.
    async authorizeEvents(subject,conversationId) {
      return transaction(pool,async c=>{
        const {other,conv,participant,me}=await participants(c,conversationId,subject);
        if(conv.state!=="open" || participant.left_at)
          throw new ApiError(403,"conversation_closed");
        const recipient=await c.query(
          "SELECT status,age_verified_at,safety_eligible FROM bridge_accounts WHERE id=$1",[other]);
        if(recipient.rows[0]?.status!=="active" || !recipient.rows[0]?.age_verified_at ||
           recipient.rows[0]?.safety_eligible!==true)
          throw new ApiError(403,"recipient_unavailable");
        if(conv.kind==="connection"){
          const pair=[me.id,other].sort();
          const linked=await c.query(
            "SELECT 1 FROM bridge_connections WHERE member_low=$1 AND member_high=$2 AND ended_at IS NULL",
            pair);
          if(!linked.rows.length)throw new ApiError(403,"connection_closed");
        }
        return true;
      });
    },
    async bootstrap(subject) {
      const c=await pool.connect();
      try {
        await account(c,subject);
        const q=await c.query("SELECT code,display_name FROM bridge_supported_languages WHERE moderation_ready=true ORDER BY display_name");
        return {languages:q.rows.map(x=>({code:x.code,displayName:x.display_name})),featureFlags:{voice:false,video:false,publicChat:false}};
      } finally {c.release();}
    },
    async setPreferences(subject,body) {
      await transaction(pool,async c=>{
        await c.query("SELECT pg_advisory_xact_lock($1)",[MATCH_MUTEX_ID]);
        const me=await account(c,subject,false,true);
        const allowed=await c.query(
          "SELECT code FROM bridge_supported_languages WHERE code=ANY($1::varchar[]) AND moderation_ready=true", [body.languageCodes]);
        if (allowed.rows.length!==body.languageCodes.length) throw new ApiError(422,"unsupported_language");
        const active=await c.query("SELECT 1 FROM bridge_active_match_slots WHERE account_id=$1",[me.id]);
        if(active.rows.length) throw new ApiError(409,"active_match");
        await c.query("DELETE FROM bridge_account_languages WHERE account_id=$1",[me.id]);
        for(const code of body.languageCodes)
          await c.query("INSERT INTO bridge_account_languages(account_id,language_code) VALUES($1,$2)",[me.id,code]);
        await c.query(
          "INSERT INTO bridge_preferences(account_id,intention,topic,interests) VALUES($1,$2,$3,$4) " +
          "ON CONFLICT(account_id) DO UPDATE SET intention=EXCLUDED.intention,topic=EXCLUDED.topic," +
          "interests=EXCLUDED.interests,updated_at=now()",[me.id,body.intention,body.topic,body.interests]);
        await c.query("UPDATE bridge_match_queue SET state='cancelled' WHERE account_id=$1 AND state='waiting'",[me.id]);
      });
    },
    async enqueue(subject,{topic,idempotencyKey}) {
      return transaction(pool,async c=>{
        await c.query("SELECT pg_advisory_xact_lock($1)",[MATCH_MUTEX_ID]);
        const me=await account(c,subject,true,true);
        const myLang=await languages(c,me.id);
        if(!myLang.length) throw new ApiError(422,"no_supported_language");
        if((await c.query("SELECT 1 FROM bridge_active_match_slots WHERE account_id=$1",[me.id])).rows.length)
          throw new ApiError(409,"active_match");

        let existing=(await c.query(
          "SELECT request_id,state,match_session_id,expires_at FROM bridge_match_queue WHERE account_id=$1 FOR UPDATE",[me.id])).rows[0];
        if (existing && existing.state==="waiting" && new Date(existing.expires_at).getTime()<=Date.now()) {
          await c.query("UPDATE bridge_match_queue SET state='expired' WHERE account_id=$1",[me.id]);
          existing={...existing,state:"expired"};
        }
        if(existing && existing.request_id===idempotencyKey) {
          if(existing.state==="reserved"){
            const found=await c.query("SELECT id FROM bridge_conversations WHERE match_session_id=$1",[existing.match_session_id]);
            return {requestId:idempotencyKey,state:"connected",conversationId:found.rows[0]?.id||null};
          }
          return {requestId:idempotencyKey,state:existing.state};
        }
        if(existing && (existing.state==="waiting" || existing.state==="reserved")) throw new ApiError(409,"already_searching");

        const prefs=requireRows(await c.query(
          "SELECT intention,topic,interests FROM bridge_preferences WHERE account_id=$1",[me.id]),422,"preferences_required");
        await c.query(
          "INSERT INTO bridge_match_queue(account_id,request_id,state,intention,topic,queued_at,expires_at,match_session_id) " +
          "VALUES($1,$2,'waiting',$3,$4,now(),now()+interval '120 seconds',NULL) " +
          "ON CONFLICT (account_id) DO UPDATE SET request_id=EXCLUDED.request_id,state='waiting'," +
          "intention=EXCLUDED.intention,topic=EXCLUDED.topic,queued_at=now()," +
          "expires_at=now()+interval '120 seconds',match_session_id=NULL",
          [me.id,idempotencyKey,prefs.intention,topic ?? prefs.topic]);

        const eligibleRows=await c.query(
          "SELECT q.account_id,q.queued_at,q.topic,a.status,a.age_verified_at,a.safety_eligible," +
          "p.intention,p.interests FROM bridge_match_queue q " +
          "JOIN bridge_accounts a ON a.id=q.account_id " +
          "JOIN bridge_preferences p ON p.account_id=q.account_id " +
          "WHERE q.state='waiting' AND q.expires_at>now() AND q.account_id<>$1 " +
          "AND a.status='active' AND a.age_verified_at IS NOT NULL AND a.safety_eligible=true " +
          "AND NOT EXISTS (SELECT 1 FROM bridge_active_match_slots s WHERE s.account_id=q.account_id) " +
          "AND NOT EXISTS (SELECT 1 FROM bridge_blocks b WHERE " +
          "(b.blocker_id=$1 AND b.blocked_id=q.account_id) OR " +
          "(b.blocker_id=q.account_id AND b.blocked_id=$1)) " +
          "AND EXISTS (SELECT 1 FROM bridge_account_languages mine " +
          "JOIN bridge_account_languages theirs ON mine.language_code=theirs.language_code " +
          "JOIN bridge_supported_languages lang ON lang.code=mine.language_code " +
          "WHERE mine.account_id=$1 AND theirs.account_id=q.account_id AND lang.moderation_ready=true) " +
          "ORDER BY q.queued_at LIMIT 40 FOR UPDATE OF q SKIP LOCKED",[me.id]);

        const supported=(await c.query("SELECT code FROM bridge_supported_languages WHERE moderation_ready=true")).rows.map(x=>x.code);
        const candidates=[];
        for(const x of eligibleRows.rows) candidates.push({
          id:x.account_id,status:x.status,ageVerified:!!x.age_verified_at,
          safetyEligible:x.safety_eligible,available:true,hasActiveSession:false,
          languages:await languages(c,x.account_id),interests:x.interests||[],
          intent:x.intention,topic:x.topic,queuedAt:new Date(x.queued_at).getTime()
        });
        const choice=findCandidate({
          id:me.id,status:"active",ageVerified:true,safetyEligible:true,available:true,
          hasActiveSession:false,languages:myLang,interests:prefs.interests||[],
          intent:prefs.intention,topic:topic??prefs.topic
        },candidates,{supportedLanguages:supported,nowMs:Date.now(),maxQueueAgeMs:120000});
        if(!choice)return {requestId:idempotencyKey,state:"waiting"};
        const other=choice.candidateId;
        const pair=[me.id,other].sort();
        const selectedLanguage=choice.sharedLanguages[randomInt(choice.sharedLanguages.length)];
        const sess=requireRows(await c.query(
          "INSERT INTO bridge_match_sessions(member_low,member_high,language_code,state,reserved_at,lease_expires_at,activated_at) " +
          "VALUES($1,$2,$3,'active',now(),now()+interval '60 seconds',now()) RETURNING id",
          [pair[0],pair[1],selectedLanguage]));
        // Both unique active slots must commit together; collision aborts transaction.
        await c.query("INSERT INTO bridge_active_match_slots(account_id,match_session_id) VALUES($1,$3),($2,$3)",[pair[0],pair[1],sess.id]);
        const conv=requireRows(await c.query(
          "INSERT INTO bridge_conversations(match_session_id,kind,state) VALUES($1,'random','open') RETURNING id",[sess.id]));
        await c.query("INSERT INTO bridge_conversation_participants(conversation_id,account_id) VALUES($1,$2),($1,$3)",
          [conv.id,pair[0],pair[1]]);
        await c.query(
          "UPDATE bridge_match_queue SET state='reserved',match_session_id=$3 WHERE account_id IN ($1,$2)",
          [pair[0],pair[1],sess.id]);
        return {requestId:idempotencyKey,state:"connected",conversationId:conv.id};
      });
    },
    async queueStatus(subject,requestId) {
      const me=await pool.query("SELECT id FROM bridge_accounts WHERE auth_subject=$1",[subject]);
      const a=requireRows(me,403,"account_unavailable");
      const q=requireRows(await pool.query(
        "SELECT q.state,q.expires_at,q.match_session_id,c.id AS conversation_id " +
        "FROM bridge_match_queue q LEFT JOIN bridge_conversations c ON c.match_session_id=q.match_session_id " +
        "WHERE q.account_id=$1 AND q.request_id=$2",[a.id,requestId]));
      const expired=q.state==="waiting" && new Date(q.expires_at).getTime()<=Date.now();
      return {requestId,state:expired?"expired":q.state==="reserved"?"connected":q.state,
        conversationId:q.conversation_id||null};
    },
    async cancelQueue(subject,requestId) {
      await transaction(pool,async c=>{
        await c.query("SELECT pg_advisory_xact_lock($1)",[MATCH_MUTEX_ID]);
        const me=await account(c,subject);
        const q=requireRows(await c.query(
          "SELECT state FROM bridge_match_queue WHERE account_id=$1 AND request_id=$2 FOR UPDATE",[me.id,requestId]));
        if(q.state==="waiting") await c.query(
          "UPDATE bridge_match_queue SET state='cancelled' WHERE account_id=$1 AND request_id=$2",[me.id,requestId]);
      });
    },
    async conversationPeer(subject,conversationId) {
      return transaction(pool,async c=>{
        const {other}=await participants(c,conversationId,subject);
        const peer=requireRows(await c.query(
          "SELECT a.id,p.pseudonym,p.avatar_key FROM bridge_accounts a " +
          "JOIN bridge_profiles p ON p.account_id=a.id WHERE a.id=$1",
          [other]),404);
        return {accountId:peer.id,pseudonym:peer.pseudonym,avatarKey:peer.avatar_key};
      });
    },
    async messages(subject,conversationId,afterSequence) {
      return transaction(pool,async c=>{
        const {me,conv,participant}=await participants(c,conversationId,subject);
        if(participant.left_at || conv.state!=="open") throw new ApiError(403,"conversation_closed");
        const q=await c.query(
          "SELECT id,conversation_id,sequence_number,sender_id,body,sent_at FROM bridge_messages " +
          "WHERE conversation_id=$1 AND sequence_number>$2 ORDER BY sequence_number LIMIT $3",
          [conversationId,afterSequence,PAGE_SIZE]);
        return q.rows.map(x=>({
          id:x.id,conversationId:x.conversation_id,sequenceNumber:Number(x.sequence_number),
          senderId:x.sender_id,body:x.body,sentAt:x.sent_at
        }));
      });
    },
    async sendMessage(subject,conversationId,input) {
      return transaction(pool,async c=>{
        const {me,conv,participant,other}=await participants(c,conversationId,subject);
        if(conv.state!=="open" || participant.left_at) throw new ApiError(403,"conversation_closed");
        const otherAccount=await c.query(
          "SELECT status,age_verified_at,safety_eligible FROM bridge_accounts WHERE id=$1",[other]);
        if(otherAccount.rows[0]?.status!=="active" || !otherAccount.rows[0]?.age_verified_at ||
           otherAccount.rows[0]?.safety_eligible!==true) throw new ApiError(403,"recipient_unavailable");
        if(conv.kind==="connection"){
          const valid=await c.query("SELECT 1 FROM bridge_connections WHERE " +
            "member_low=$1 AND member_high=$2 AND ended_at IS NULL",[...[me.id,other].sort()]);
          if(!valid.rows.length) throw new ApiError(403,"connection_closed");
        }
        const old=await c.query(
          "SELECT id,conversation_id,sequence_number,sender_id,body,sent_at FROM bridge_messages " +
          "WHERE conversation_id=$1 AND sender_id=$2 AND client_message_id=$3",
          [conversationId,me.id,input.clientMessageId]);
        let msg;
        if(old.rows.length){
          msg=old.rows[0];
          if(msg.body!==input.body)throw new ApiError(409,"idempotency_conflict");
        }else{
          msg=requireRows(await c.query(
            "INSERT INTO bridge_messages(conversation_id,sender_id,client_message_id,sequence_number,body) " +
            "VALUES($1,$2,$3,$4,$5) " +
            "RETURNING id,conversation_id,sequence_number,sender_id,body,sent_at",
            [conversationId,me.id,input.clientMessageId,conv.next_message_sequence,input.body]));
          await c.query(
            "UPDATE bridge_conversations SET next_message_sequence=next_message_sequence+1 WHERE id=$1",
            [conversationId]);
          // One outbox row per accepted message, in the SAME DB transaction.
          // Keep private message bodies out of delivery events.
          await c.query(
            "INSERT INTO bridge_event_outbox(event_key,event_type,conversation_id,payload) " +
            "VALUES($1,'conversation.message.accepted',$2,$3::jsonb) " +
            "ON CONFLICT (event_key) DO NOTHING",
            ["message:" + msg.id, conversationId, JSON.stringify({
              messageId: msg.id, sequenceNumber: Number(msg.sequence_number)
            })]
          );
        }
        return {id:msg.id,conversationId:msg.conversation_id,
          sequenceNumber:Number(msg.sequence_number),senderId:msg.sender_id,body:msg.body,sentAt:msg.sent_at};
      });
    },
    async closeConversation(subject,conversationId) {
      await transaction(pool,async c=>{
        const {conv}=await participants(c,conversationId,subject);
        if(conv.kind==="connection")throw new ApiError(409,"use_connection_controls");
        await c.query("UPDATE bridge_conversations SET state='closed',closed_at=now() WHERE id=$1",[conversationId]);
        if(conv.match_session_id){
          await c.query("UPDATE bridge_match_sessions SET state='ended',ended_at=now() WHERE id=$1",[conv.match_session_id]);
          await c.query("DELETE FROM bridge_active_match_slots WHERE match_session_id=$1",[conv.match_session_id]);
          await c.query("UPDATE bridge_match_queue SET state='cancelled' WHERE match_session_id=$1",[conv.match_session_id]);
        }
      });
    },
    async castVote(subject,conversationId,decision) {
      return transaction(pool,async c=>{
        const {me,other,conv}=await participants(c,conversationId,subject);
        // Closed random sessions must never be reopened by late accept votes.
        if(conv.state!=="open")throw new ApiError(409,"conversation_closed");
        const recipient=await c.query(
          "SELECT status,age_verified_at,safety_eligible FROM bridge_accounts WHERE id=$1",[other]);
        if(recipient.rows[0]?.status!=="active" || !recipient.rows[0]?.age_verified_at ||
           recipient.rows[0]?.safety_eligible!==true)throw new ApiError(403,"recipient_unavailable");
        if(conv.kind==="connection"){
          if(decision==="withdraw")throw new ApiError(409,"already_connected");
          const pair=[me.id,other].sort();
          const current=await c.query(
            "SELECT id FROM bridge_connections WHERE member_low=$1 AND member_high=$2 " +
            "AND ended_at IS NULL",[...pair]);
          if(!current.rows.length)throw new ApiError(409,"connection_closed");
          return {status:"connected",connectionId:current.rows[0].id};
        }
        await c.query(
          "INSERT INTO bridge_connection_votes(conversation_id,voter_id,status) VALUES($1,$2,$3) " +
          "ON CONFLICT(conversation_id,voter_id) DO UPDATE SET status=EXCLUDED.status,updated_at=now()",
          [conversationId,me.id,decision==="accept"?"accepted":"withdrawn"]);
        if(decision==="withdraw")return {status:"withdrawn"};
        const count=await c.query(
          "SELECT count(*)::int AS votes FROM bridge_connection_votes " +
          "WHERE conversation_id=$1 AND status='accepted'",[conversationId]);
        if(Number(count.rows[0]?.votes)!==2)return {status:"pending"};
        const pair=[me.id,other].sort();
        const existing=await c.query(
          "INSERT INTO bridge_connections(member_low,member_high,source_conversation_id) VALUES($1,$2,$3) " +
          "ON CONFLICT DO NOTHING RETURNING id",[pair[0],pair[1],conversationId]);
        let connectionId=existing.rows[0]?.id;
        if(!connectionId) {
          const same=await c.query(
            "SELECT id FROM bridge_connections WHERE member_low=$1 AND member_high=$2 AND ended_at IS NULL",
            pair);
          connectionId=same.rows[0]?.id;
        }
        if(!connectionId)throw new ApiError(409,"connection_conflict");
        await c.query("UPDATE bridge_conversations SET kind='connection',state='open',closed_at=NULL WHERE id=$1",
          [conversationId]);
        if(conv.match_session_id){
          await c.query("UPDATE bridge_match_sessions SET state='ended',ended_at=now() WHERE id=$1",
            [conv.match_session_id]);
          await c.query("DELETE FROM bridge_active_match_slots WHERE match_session_id=$1",
            [conv.match_session_id]);
          await c.query("UPDATE bridge_match_queue SET state='cancelled' WHERE match_session_id=$1",
            [conv.match_session_id]);
        }
        return {status:"connected",connectionId};
      });
    },
    async connections(subject) {
      const me=requireRows(await pool.query(
        "SELECT id FROM bridge_accounts WHERE auth_subject=$1 AND status='active' " +
        "AND age_verified_at IS NOT NULL AND safety_eligible=true",[subject]),403);
      const q=await pool.query(
        "SELECT co.id,co.source_conversation_id,co.created_at,p.pseudonym " +
        "FROM bridge_connections co JOIN bridge_profiles p ON p.account_id = " +
        "(CASE WHEN co.member_low=$1 THEN co.member_high ELSE co.member_low END) " +
        "JOIN bridge_accounts peer ON peer.id=p.account_id " +
        "JOIN bridge_conversations conversation ON conversation.id=co.source_conversation_id " +
        "WHERE (co.member_low=$1 OR co.member_high=$1) AND co.ended_at IS NULL " +
        "AND peer.status='active' AND peer.age_verified_at IS NOT NULL " +
        "AND peer.safety_eligible=true AND conversation.state='open' " +
        "AND NOT EXISTS(SELECT 1 FROM bridge_blocks b WHERE " +
        "(b.blocker_id=co.member_low AND b.blocked_id=co.member_high) OR " +
        "(b.blocker_id=co.member_high AND b.blocked_id=co.member_low)) " +
        "ORDER BY co.created_at DESC LIMIT 100",[me.id]);
      return q.rows.map(x=>({id:x.id,conversationId:x.source_conversation_id,
        pseudonym:x.pseudonym,createdAt:x.created_at}));
    },
    async block(subject,targetId) {
      await transaction(pool,async c=>{
        await c.query("SELECT pg_advisory_xact_lock($1)",[MATCH_MUTEX_ID]);
        const me=await account(c,subject);
        if(me.id===targetId)throw new ApiError(422,"cannot_block_self");
        requireRows(await c.query("SELECT id FROM bridge_accounts WHERE id=$1",[targetId]),404);
        await c.query(
          "INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [me.id,targetId]);
        const pair=[me.id,targetId].sort();
        // Close all shared rooms, regardless of which user sent the last message.
        await c.query(
          "UPDATE bridge_conversations SET state='closed',closed_at=now() WHERE id IN " +
          "(SELECT p.conversation_id FROM bridge_conversation_participants p " +
          "JOIN bridge_conversation_participants q ON p.conversation_id=q.conversation_id " +
          "WHERE p.account_id=$1 AND q.account_id=$2)",[me.id,targetId]);
        await c.query(
          "UPDATE bridge_connections SET ended_at=now() WHERE member_low=$1 AND member_high=$2 AND ended_at IS NULL",
          pair);
        const q=await c.query(
          "UPDATE bridge_match_sessions SET state='ended',ended_at=now() " +
          "WHERE member_low=$1 AND member_high=$2 AND state IN ('active','reserved') RETURNING id",
          pair);
        for(const row of q.rows) {
          await c.query("DELETE FROM bridge_active_match_slots WHERE match_session_id=$1",[row.id]);
          await c.query("UPDATE bridge_match_queue SET state='cancelled' WHERE match_session_id=$1",[row.id]);
        }
      });
    },
    async unblock(subject,targetId) {
      const me=requireRows(await pool.query("SELECT id FROM bridge_accounts WHERE auth_subject=$1",[subject]),403);
      await pool.query("DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",[me.id,targetId]);
    },
    async report(subject,input) {
      return transaction(pool,async c=>{
        const me=await account(c,subject);
        if(me.id===input.reportedAccountId)throw new ApiError(422,"cannot_report_self");
        requireRows(await c.query("SELECT id FROM bridge_accounts WHERE id=$1",[input.reportedAccountId]),404);
        if(input.conversationId){
          const allowed=await c.query(
            "SELECT 1 FROM bridge_conversation_participants WHERE conversation_id=$1 AND account_id=$2",
            [input.conversationId,me.id]);
          if(!allowed.rows.length)throw new ApiError(404,"not_found");
          const other=await c.query(
            "SELECT 1 FROM bridge_conversation_participants WHERE conversation_id=$1 AND account_id=$2",
            [input.conversationId,input.reportedAccountId]);
          if(!other.rows.length)throw new ApiError(422,"report_target_unrelated");
        }
        const r=requireRows(await c.query(
          "INSERT INTO bridge_reports(reporter_id,reported_id,conversation_id,category,details) " +
          "VALUES($1,$2,$3,$4,$5) RETURNING id",
          [me.id,input.reportedAccountId,input.conversationId??null,input.category,input.details??null]));
        return {reportId:r.id,state:"queued"};
      });
    }
  };
}
