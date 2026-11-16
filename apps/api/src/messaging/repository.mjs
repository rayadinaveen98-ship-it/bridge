/**
 * Bridge V2-06A: DISCONNECTED / SYNTHETIC-ONLY PostgreSQL messaging metadata.
 *
 * NOT production messaging: body is a fixed synthetic marker, bytea values are
 * opaque fixture bytes (NOT encrypted), reads return metadata ONLY, and this
 * factory refuses anything except the expressly acknowledged loopback test DB.
 * No HTTP, Render, Neon, Android, keys, plaintext delivery or purge is wired.
 */
import {withV2ConnectionTx,instantAfterLocks,lockV2Relationship}
  from "../sessions/direct_repository.mjs";
import {requireLive,unreadStatus,deny} from "./scope.mjs";
import {hashBytes,signCursor,verifyCursor} from "./sequence.mjs";
import {unreadExpiry,recoveryUntil,tokenForAck,tokenDigest,recoveryAllowed}
  from "./unread.mjs";

const MARKER="[Bridge V2-06A synthetic fixture - no user body]";
const POLICY="bridge-v2";
const KEY_REF="disposable-v206-synthetic-not-encrypted";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const checkId=x=>typeof x==="string"&&UUID.test(x);
const same=(a,b)=>Buffer.isBuffer(a)&&Buffer.isBuffer(b)&&a.equals(b);
function assertDisposable() {
  if(process.env.BRIDGE_TEST_MIGRATION_ACK!=="disposable-bridge_test-only")throw Error("V2-06A disconnected adapter: explicit disposable acknowledgment required");
  let u;
  try{u=new URL(process.env.BRIDGE_TEST_DATABASE_URL);}catch{throw Error("V2-06A: missing disposable URL");}
  if(!["postgres:","postgresql:"].includes(u.protocol)||
     !["127.0.0.1","localhost"].includes(u.hostname)||
     u.username!=="bridge_test"||u.pathname!=="/bridge_test"||
     !["","5432"].includes(u.port)||!u.password||u.search||u.hash)
    throw Error("V2-06A refuses all non-loopback bridge_test databases");
}
async function accountsAndBlocks(c,members) {
  if(!Array.isArray(members)||members.length!==2)deny();
  const accounts=(await c.query(
    "SELECT id,status,age_verified_at,safety_eligible FROM bridge_accounts "+
    "WHERE id=ANY($1::uuid[]) ORDER BY id",[members])).rows;
  const blocked=(await c.query(
    "SELECT 1 FROM bridge_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR "+
    "(blocker_id=$2 AND blocked_id=$1) LIMIT 1",members)).rows.length>0;
  return {accounts,blocked};
}
async function lockRoom(c,conversationId,actorId) {
  const q=await c.query(
    "SELECT id,kind,state,policy_version,v2_session_role,legacy_qa,connection_id,"+
    "match_session_id,last_accepted_at,idle_expires_at,next_message_sequence "+
    "FROM bridge_conversations WHERE id=$1 FOR UPDATE",[conversationId]);
  const room=q.rows[0];
  if(!room||!checkId(actorId))deny();
  const participants=(await c.query(
    "SELECT account_id,left_at FROM bridge_conversation_participants "+
    "WHERE conversation_id=$1 ORDER BY account_id",[conversationId])).rows;
  if(participants.length!==2||participants.some(p=>p.left_at!==null))deny();
  const members=participants.map(p=>p.account_id);
  let relation=null,segment=null;
  if(room.kind==="random"){
    if(!room.match_session_id)deny();
    const match=(await c.query(
      "SELECT state,member_low,member_high FROM bridge_match_sessions "+
      "WHERE id=$1 FOR UPDATE",[room.match_session_id])).rows[0];
    const membersSorted=[...members].sort();
    if(!match||match.state!=="active"||match.member_low!==membersSorted[0]||
       match.member_high!==membersSorted[1])deny();
    const slots=(await c.query(
      "SELECT account_id FROM bridge_active_match_slots "+
      "WHERE match_session_id=$1 ORDER BY account_id FOR UPDATE",
      [room.match_session_id])).rows;
    if(slots.length!==2||slots[0].account_id!==membersSorted[0]||
       slots[1].account_id!==membersSorted[1])deny();
  }
  if(room.kind==="connection"){
    if(!room.connection_id)deny();
    relation=await lockV2Relationship(c,room.connection_id,actorId);
    segment=(await c.query(
      "SELECT conversation_id,connection_id,state,policy_version "+
      "FROM bridge_v2_direct_sessions WHERE conversation_id=$1 FOR UPDATE",
      [conversationId])).rows[0]||null;
  }
  const {accounts,blocked}=await accountsAndBlocks(c,members);
  const now=await instantAfterLocks(c);
  requireLive({room,segment,relation,actorId,participants:members,accounts,blocked,now});
  return {room,relation,now,members};
}
async function lockedEnvelope(c,id,actorId) {
  const envelope=(await c.query(
    "SELECT id,message_id,connection_id,recipient_id,accepted_at,expires_at,"+
    "acknowledged_at,state,recovery_token_digest FROM bridge_unread_deliveries "+
    "WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if(!envelope||envelope.recipient_id!==actorId)deny();
  const relation=await lockV2Relationship(c,envelope.connection_id,actorId);
  const {accounts,blocked}=await accountsAndBlocks(c,[relation.member_low,relation.member_high]);
  const now=await instantAfterLocks(c);
  const status=unreadStatus({envelope,actorId,relation,accounts,blocked,now});
  if(!["unread","acknowledged"].includes(status))deny();
  return {envelope,relation,now,status};
}
const exposed=x=>({id:x.id,messageId:x.message_id,acceptedAt:x.accepted_at,
  expiresAt:x.expires_at,acknowledgedAt:x.acknowledged_at??null,state:x.state});
export function createMessagingRepository(pool,{recoveryKey}={}) {
  assertDisposable();
  // Bind the actual injected PG pool to the same acknowledged loopback DSN.
  if(pool?.options?.connectionString!==process.env.BRIDGE_TEST_DATABASE_URL)
    throw new Error("V2-06A refuses unverified PostgreSQL pools");
  if(!pool?.connect||!Buffer.isBuffer(recoveryKey)||recoveryKey.length<32)
    throw new TypeError("Synthetic PG pool and 32-byte test recovery key required");
  return Object.freeze({
    async acceptSynthetic({conversationId,actorId,clientMessageId,opaqueFixture,
      failureHook=null}={}) {
      if(!checkId(conversationId)||!checkId(actorId)||!checkId(clientMessageId)||
         !Buffer.isBuffer(opaqueFixture)||opaqueFixture.length<1||opaqueFixture.length>2048)
        deny();
      if(failureHook!==null&&typeof failureHook!=="function")deny();
      return withV2ConnectionTx(pool,async c=>{
        const {room,relation,now,members}=await lockRoom(c,conversationId,actorId);
        const prior=(await c.query(
          "SELECT m.id,m.sequence_number,p.ciphertext FROM bridge_messages m "+
          "LEFT JOIN bridge_message_payloads p ON p.message_id=m.id "+
          "WHERE m.conversation_id=$1 AND m.sender_id=$2 AND m.client_message_id=$3",
          [conversationId,actorId,clientMessageId])).rows[0];
        if(prior) {
          if(!same(prior.ciphertext,opaqueFixture))deny();
          return {id:prior.id,sequenceNumber:Number(prior.sequence_number),duplicate:true};
        }
        const seq=Number(room.next_message_sequence);
        if(!Number.isSafeInteger(seq)||seq<1)deny();
        const msg=(await c.query(
          "INSERT INTO bridge_messages(conversation_id,sender_id,client_message_id,"+
          "sequence_number,body,policy_version,payload_scope,sent_at) "+
          "VALUES($1,$2,$3,$4,$5,$6,'live',$7) "+
          "RETURNING id,sequence_number",
          [conversationId,actorId,clientMessageId,seq,MARKER,POLICY,now])).rows[0];
        if(failureHook)await failureHook("after_message");
        await c.query(
          "INSERT INTO bridge_message_payloads(message_id,conversation_id,ciphertext,"+
          "key_reference,scope,expires_at) VALUES($1,$2,$3,$4,'live',$5)",
          [msg.id,conversationId,opaqueFixture,KEY_REF,
           new Date(now.getTime()+24*3600000)]);
        if(relation) {
          const recipientId=members.find(x=>x!==actorId);
          await c.query(
            "INSERT INTO bridge_unread_deliveries(message_id,connection_id,recipient_id,"+
            "encrypted_copy,key_reference,accepted_at,expires_at) "+
            "VALUES($1,$2,$3,$4,$5,$6,$7)",
            [msg.id,relation.id,recipientId,opaqueFixture,KEY_REF,now,unreadExpiry(now)]);
        }
        if(failureHook)await failureHook("after_envelope");
        await c.query(
          "INSERT INTO bridge_event_outbox(event_key,event_type,conversation_id,payload) "+
          "VALUES($1,'conversation.message.accepted',$2,$3::jsonb) "+
          "ON CONFLICT(event_key) DO NOTHING",
          ["message:"+msg.id,conversationId,
           JSON.stringify({messageId:msg.id,sequenceNumber:seq})]);
        await c.query(
          "UPDATE bridge_conversations SET next_message_sequence=$2,"+
          "last_accepted_at=$3,idle_expires_at=$3::timestamptz+interval '30 minutes' "+
          "WHERE id=$1",[conversationId,seq+1,now]);
        if(failureHook)await failureHook("after_clock");
        return {id:msg.id,sequenceNumber:seq,duplicate:false};
      });
    },
    async liveMetadata({conversationId,actorId,cursor=null}={}) {
      if(!checkId(conversationId)||!checkId(actorId))deny();
      return withV2ConnectionTx(pool,async c=>{
        await lockRoom(c,conversationId,actorId);
        let after=0;
        if(cursor!==null) {
          after=verifyCursor(cursor,{actorId,conversationId,scope:"live",key:recoveryKey});
          if(after===null)deny();
        }
        const rows=(await c.query(
          "SELECT m.id,m.sequence_number,m.sent_at, "+
          "(p.message_id IS NOT NULL AND p.purged_at IS NULL) AS fixture_present "+
          "FROM bridge_messages m LEFT JOIN bridge_message_payloads p ON p.message_id=m.id "+
          "WHERE m.conversation_id=$1 AND m.policy_version=$3 "+
          "AND m.sequence_number>$2 ORDER BY m.sequence_number LIMIT 50",
          [conversationId,after,POLICY])).rows;
        const end=rows.length?Number(rows[rows.length-1].sequence_number):after;
        return {messages:rows.map(x=>({id:x.id,sequenceNumber:Number(x.sequence_number),
          sentAt:x.sent_at,state:x.fixture_present?"present":"tombstone"})),
          cursor:signCursor({actorId,conversationId,afterSequence:end,key:recoveryKey})};
      });
    },
    async unreadMetadata({actorId}={}) {
      if(!checkId(actorId))deny();
      return withV2ConnectionTx(pool,async c=>{
        const ids=(await c.query(
          "SELECT id FROM bridge_unread_deliveries "+
          "WHERE recipient_id=$1 AND state='unread' ORDER BY accepted_at,id LIMIT 50",
          [actorId])).rows;
        const visible=[];
        for(const item of ids){
          try {
            const {envelope,status}=await lockedEnvelope(c,item.id,actorId);
            if(status==="unread")visible.push(exposed(envelope));
          }catch(e){if(e?.code!=="resource_unavailable")throw e;}
        }
        return visible;
      });
    },
    async acknowledge({envelopeId,actorId}={}) {
      if(!checkId(envelopeId)||!checkId(actorId))deny();
      return withV2ConnectionTx(pool,async c=>{
        const {envelope,now,status}=await lockedEnvelope(c,envelopeId,actorId);
        const acknowledgedAt=status==="unread"?now:envelope.acknowledged_at;
        const until=recoveryUntil(envelope.accepted_at,acknowledgedAt);
        if(!until)deny();
        const token=tokenForAck({envelopeId,recipientId:actorId,
          acknowledgedAt,key:recoveryKey});
        if(status==="unread"){
          await c.query(
            "UPDATE bridge_unread_deliveries SET state='acknowledged',"+
            "acknowledged_at=$2,recovery_token_digest=$3 WHERE id=$1 AND state='unread'",
            [envelopeId,now,tokenDigest(token)]);
        }
        return {status:status==="unread"?"acknowledged":"already_acknowledged",
          recoveryToken:now.getTime()<until.getTime()?token:null,recoveryUntil:until};
      });
    },
    async recoverMetadata({envelopeId,actorId,recoveryToken}={}) {
      if(!checkId(envelopeId)||!checkId(actorId))deny();
      return withV2ConnectionTx(pool,async c=>{
        const {envelope,now,status}=await lockedEnvelope(c,envelopeId,actorId);
        if(status!=="acknowledged"||!recoveryAllowed({
          envelope,now,token:recoveryToken,digest:envelope.recovery_token_digest
        }))deny();
        return exposed(envelope); // NEVER returns the source room, ciphertext or body
      });
    }
  });
}
