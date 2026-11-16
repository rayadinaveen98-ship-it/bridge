/**
 * Bridge B2b — synthetic PG16 only: disconnected private LIVE/UNREAD reader.
 * NOT imported by hosted HTTP/start/postgres or Android; NOT a real auth adapter.
 * A caller-supplied actorId is only a disposable test fixture identity.
 *
 * Current LIVE: policy/participant-guarded, scoped signed cursor, no previous D1.
 * UNREAD: active mutual recipient only, independent of source segment being open.
 * Ack: requires a synthetic presentation proof, pins FIRST acknowledgment.
 * Recovery: digest-only capability, min(firstAck+15m, accepted+7d).
 */
import {createHmac,createHash,timingSafeEqual} from "node:crypto";
import {withV2ConnectionTx,instantAfterLocks,lockV2Relationship}
  from "../sessions/direct_repository.mjs";
import {requireLive,pairAllowed} from "./scope.mjs";
import {decryptSyntheticPrivate} from "./private_crypto.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACK="disposable-bridge_test-only",POLICY="bridge-v2";
const HARD_UNREAD_MS=7*86400000,RECOVERY_MS=15*60000;
const PRESENTATION_MS=5*60000; // Synthetic transport proof, NOT a user-facing policy.
const MAX_PAGE=25;
export class PrivateDeliveryDenied extends Error{
  constructor(){super("resource_unavailable");this.name="PrivateDeliveryDenied";this.code="resource_unavailable";}
}
const deny=()=>{throw new PrivateDeliveryDenied();};
const validId=v=>typeof v==="string"&&UUID.test(v);
function isBuffer32(b){return Buffer.isBuffer(b)&&b.length===32;}
function asTime(d){if(!(d instanceof Date)||!Number.isSafeInteger(d.getTime()))deny();return d.getTime();}
function guardedPool(pool){
  if(process.env.BRIDGE_TEST_MIGRATION_ACK!==ACK)deny();
  const dsn=process.env.BRIDGE_TEST_DATABASE_URL;
  let u;
  try{u=new URL(dsn);}catch{deny();}
  if(!["postgres:","postgresql:"].includes(u.protocol)||
     !["127.0.0.1","localhost"].includes(u.hostname)||
     u.pathname!=="/bridge_test"||u.username!=="bridge_test"||
     !u.password||!["","5432"].includes(u.port)||u.search||u.hash||
     pool?.options?.connectionString!==dsn||typeof pool?.connect!=="function")deny();
}
async function guardActual(c){
  const q=(await c.query(
    "SELECT current_database() AS db,current_user AS usr,inet_server_addr() AS host"
  )).rows;
  if(q.length!==1||q[0].db!=="bridge_test"||q[0].usr!=="bridge_test"||
     q[0].host===null)deny();
  if((await c.query(
    "SELECT 1 FROM bridge_schema_migrations WHERE version='0008'"
  )).rows.length!==1)deny();
}
function actualKeys(keys){
  if(!isBuffer32(keys?.cursorKey)||!isBuffer32(keys?.presentationKey)||
     !isBuffer32(keys?.recoveryKey)||typeof keys?.keyProvider?.getKek!=="function")deny();
  if(timingSafeEqual(keys.cursorKey,keys.presentationKey)||
     timingSafeEqual(keys.cursorKey,keys.recoveryKey)||
     timingSafeEqual(keys.presentationKey,keys.recoveryKey))deny();
}
function sign(key,fields){
  const payload=Buffer.from(JSON.stringify(fields),"utf8").toString("base64url");
  const mac=createHmac("sha256",key).update(payload,"ascii").digest("base64url");
  return payload+"."+mac;
}
function unpack(token,key,expectedName){
  if(typeof token!=="string"||token.length>1024)deny();
  const chunks=token.split(".");
  if(chunks.length!==2||!chunks.every(s=>/^[A-Za-z0-9_-]+$/.test(s)))deny();
  let payload;
  try{
    const raw=Buffer.from(chunks[0],"base64url");
    if(raw.length>500||raw.toString("base64url")!==chunks[0])deny();
    payload=JSON.parse(raw.toString("utf8"));
  }catch{deny();}
  if(!Array.isArray(payload)||payload.length!==6||
     payload[0]!==1||payload[1]!==expectedName)deny();
  const mac=createHmac("sha256",key).update(chunks[0],"ascii").digest();
  const received=Buffer.from(chunks[1],"base64url");
  if(received.length!==32||received.toString("base64url")!==chunks[1]||
     !timingSafeEqual(mac,received))deny();
  return payload;
}
function cursorAfter(token,key,conversationId,actorId){
  if(token===null)return 0;
  const p=unpack(token,key,"live");
  if(p[2]!==conversationId||p[3]!==actorId||
     !Number.isSafeInteger(p[4])||p[4]<0||p[5]!==0)deny();
  return p[4];
}
function cursor(key,conversationId,actorId,lastSequence){
  return sign(key,[1,"live",conversationId,actorId,lastSequence,0]);
}
function proof(key,envelopeId,actorId,acceptedMs,issuedMs){
  return sign(key,[1,"present",envelopeId,actorId,acceptedMs,issuedMs]);
}
function requireProof(token,key,e,actorId,nowMs){
  const p=unpack(token,key,"present");
  if(p[2]!==e.id||p[3]!==actorId||p[4]!==asTime(e.accepted_at)||
     !Number.isSafeInteger(p[5])||p[5]>nowMs||p[5]<asTime(e.accepted_at)||
     nowMs-p[5]>PRESENTATION_MS)deny();
}
function capability(key,e,actorId){
  const h=createHmac("sha256",key);
  h.update("bridge:v2:unread:recovery:1|");
  h.update(e.id+"|"+actorId+"|"+asTime(e.accepted_at));
  return h.digest("base64url");
}
const tokenDigest=token=>createHash("sha256").update(token,"ascii").digest();
function compareDigest(stored,expected){
  return Buffer.isBuffer(stored)&&stored.length===32&&
    timingSafeEqual(stored,expected);
}
function metadata({id,conversation_id,sender_id,accepted_at},purpose,recipientId=null){
  return {policyVersion:POLICY,payloadVersion:1,purpose,
    messageId:id,conversationId:conversation_id,
    senderId:sender_id,recipientId,acceptedAtMs:asTime(accepted_at)};
}
function protectedFields(row){
  if(!row||!Buffer.isBuffer(row.ciphertext))deny();
  return {
    ciphertext:row.ciphertext,dataIv:row.data_iv,dataTag:row.data_tag,
    wrappedDek:row.wrapped_dek,wrapIv:row.wrap_iv,wrapTag:row.wrap_tag,
    kekId:row.kek_id,kekVersion:row.kek_version,
    cipherSuite:row.cipher_suite,aadVersion:row.aad_version
  };
}
function decrypt(row,meta,keyProvider){
  try{return decryptSyntheticPrivate({
    record:protectedFields(row),metadata:meta,keyProvider
  });}catch{deny();}
}
async function pairAccounts(c,members){
  const accounts=(await c.query(
    "SELECT id,status,age_verified_at,safety_eligible FROM bridge_accounts "+
    "WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE",[members]
  )).rows;
  const blocks=(await c.query(
    "SELECT 1 FROM bridge_blocks WHERE "+
    "(blocker_id=$1 AND blocked_id=$2) OR "+
    "(blocker_id=$2 AND blocked_id=$1) LIMIT 1",members
  )).rows;
  return {accounts,blocked:blocks.length>0};
}
async function participants(c,conversationId,actorId){
  const rows=(await c.query(
    "SELECT account_id,left_at FROM bridge_conversation_participants "+
    "WHERE conversation_id=$1 ORDER BY account_id",[conversationId]
  )).rows;
  if(rows.length!==2||rows.some(x=>x.left_at!==null)||
     rows[0].account_id===rows[1].account_id||
     !rows.some(x=>x.account_id===actorId))deny();
  return rows.map(x=>x.account_id);
}
async function authorizedLive(c,conversationId,actorId){
  const room=(await c.query(
    "SELECT id,kind,state,policy_version,v2_session_role,legacy_qa,"+
    "connection_id,match_session_id,last_accepted_at,idle_expires_at "+
    "FROM bridge_conversations WHERE id=$1 FOR UPDATE",[conversationId]
  )).rows[0];
  if(!room||room.policy_version!==POLICY||room.legacy_qa!==false)deny();
  const members=await participants(c,conversationId,actorId);
  let relation=null,segment=null;
  if(room.kind==="random"){
    if(room.v2_session_role!=="random"||room.connection_id!==null||
       !room.match_session_id)deny();
    const match=(await c.query(
      "SELECT state,member_low,member_high FROM bridge_match_sessions "+
      "WHERE id=$1 FOR UPDATE",[room.match_session_id]
    )).rows[0];
    const slots=(await c.query(
      "SELECT account_id FROM bridge_active_match_slots "+
      "WHERE match_session_id=$1 ORDER BY account_id FOR UPDATE",
      [room.match_session_id]
    )).rows;
    if(!match||match.state!=="active"||
       match.member_low!==members[0]||match.member_high!==members[1]||
       slots.length!==2||slots.some((x,i)=>x.account_id!==members[i]))deny();
  }else if(room.kind==="connection"){
    if(room.v2_session_role!=="direct"||room.match_session_id!==null||
       !room.connection_id)deny();
    relation=await lockV2Relationship(c,room.connection_id,actorId);
    if(relation.member_low!==members[0]||relation.member_high!==members[1])deny();
    segment=(await c.query(
      "SELECT conversation_id,connection_id,state,policy_version "+
      "FROM bridge_v2_direct_sessions WHERE conversation_id=$1 FOR UPDATE",
      [conversationId]
    )).rows[0]??null;
  }else deny();
  const {accounts,blocked}=await pairAccounts(c,members);
  // Post-lock time: must not trust transaction now()/client-provided time.
  const now=await instantAfterLocks(c);
  requireLive({room,relation,segment,actorId,participants:members,
    accounts,blocked,now});
  return {now,room};
}
async function authorizedEnvelope(c,envelopeId,actorId,{mustBeUnread=false}={}){
  // Envelope identity first; no generic history read or source-room transcript.
  const data=(await c.query(
    "SELECT u.*,m.id AS source_message_id,m.conversation_id,m.sender_id,"+
    "m.accepted_at AS message_accepted_at,m.policy_version AS message_policy,"+
    "conv.kind AS source_kind,conv.policy_version AS room_policy,"+
    "conv.v2_session_role AS source_role,conv.legacy_qa AS source_legacy,"+
    "conv.connection_id AS source_connection_id,"+
    "ds.connection_id AS segment_connection_id,ds.policy_version AS segment_policy "+
    "FROM bridge_v2_secure_unread u "+
    "JOIN bridge_v2_secure_messages m ON m.id=u.message_id "+
    "JOIN bridge_conversations conv ON conv.id=m.conversation_id "+
    "LEFT JOIN bridge_v2_direct_sessions ds ON ds.conversation_id=conv.id "+
    "WHERE u.id=$1 AND u.recipient_id=$2 FOR UPDATE OF u",
    [envelopeId,actorId]
  )).rows[0];
  if(!data||data.source_kind!=="connection"||
     data.source_role!=="direct"||data.source_legacy!==false||
     data.room_policy!==POLICY||data.message_policy!==POLICY||
     data.segment_policy!==POLICY||data.source_connection_id!==data.connection_id||
     data.segment_connection_id!==data.connection_id||
     asTime(data.accepted_at)!==asTime(data.message_accepted_at))deny();
  const relation=await lockV2Relationship(c,data.connection_id,actorId);
  if(![relation.member_low,relation.member_high].includes(data.sender_id)||
     data.sender_id===actorId||
     relation.member_low!==data.sender_id&&relation.member_high!==data.sender_id||
     ![relation.member_low,relation.member_high].includes(actorId))deny();
  const members=await participants(c,data.conversation_id,actorId);
  if(members[0]!==relation.member_low||members[1]!==relation.member_high)deny();
  const {accounts,blocked}=await pairAccounts(c,members);
  if(!pairAllowed({actorId,participants:members,accounts,blocked}))deny();
  const now=await instantAfterLocks(c);
  const ms=asTime(now),accepted=asTime(data.accepted_at),end=asTime(data.expires_at);
  if(end<=accepted||end>accepted+HARD_UNREAD_MS||ms>=end||
     data.state==="expired"||data.state==="revoked")deny();
  if(mustBeUnread&&(data.state!=="unread"||data.first_acknowledged_at!==null))deny();
  return {data,nowMs:ms};
}
export function createPrivateDeliveryRepository(pool,{
  keyProvider,cursorKey,presentationKey,recoveryKey
}={}){
  guardedPool(pool);
  actualKeys({keyProvider,cursorKey,presentationKey,recoveryKey});
  // Each key is distinct test material, never exposed from returned repository.
  const cursorSecret=Buffer.from(cursorKey);
  const presentationSecret=Buffer.from(presentationKey);
  const recoverySecret=Buffer.from(recoveryKey);
  const trans=work=>{
    guardedPool(pool);
    return withV2ConnectionTx(pool,async c=>{
      await guardActual(c);
      return work(c);
    });
  };
  const readCurrentInExistingTx=async (c,{conversationId,actorId,cursor:pageCursor=null}={})=>{
      if(!validId(conversationId)||!validId(actorId))deny();
      guardedPool(pool);
      if(!c||typeof c.query!=="function")deny();
      await guardActual(c);
        await authorizedLive(c,conversationId,actorId);
        const after=cursorAfter(pageCursor,cursorSecret,conversationId,actorId);
        const rows=(await c.query(
          "SELECT m.id,m.conversation_id,m.sender_id,m.accepted_at,m.sequence_number,"+
          "l.ciphertext,l.data_iv,l.data_tag,l.wrapped_dek,l.wrap_iv,l.wrap_tag,"+
          "l.kek_id,l.kek_version,l.cipher_suite,l.aad_version "+
          "FROM bridge_v2_secure_messages m "+
          "LEFT JOIN bridge_v2_secure_live l ON l.message_id=m.id "+
          "WHERE m.conversation_id=$1 AND m.sequence_number>$2 "+
          "ORDER BY m.sequence_number ASC LIMIT $3",
          [conversationId,after,MAX_PAGE]
        )).rows;
        const messages=rows.map(row=>{
          if(row.ciphertext===null)return {
            id:row.id,sequenceNumber:Number(row.sequence_number),deleted:true
          };
          return {
            id:row.id,sequenceNumber:Number(row.sequence_number),
            senderId:row.sender_id,deleted:false,
            text:decrypt(row,metadata(row,"live"),keyProvider)
          };
        });
        const last=rows.length?Number(rows.at(-1).sequence_number):after;
        return {messages,cursor:cursor(cursorSecret,conversationId,actorId,last)};
  };
  const unreadInboxInExistingTx=async (c,{actorId}={})=>{
      if(!validId(actorId))deny();
      guardedPool(pool);
      if(!c||typeof c.query!=="function")deny();
      await guardActual(c);
        const rows=(await c.query(
          "SELECT id FROM bridge_v2_secure_unread "+
          "WHERE recipient_id=$1 AND state='unread' ORDER BY accepted_at,id LIMIT $2",
          [actorId,MAX_PAGE]
        )).rows;
        const result=[];
        for(const row of rows){
          let authorized;
          try{authorized=await authorizedEnvelope(c,row.id,actorId,{mustBeUnread:true});}
          catch(e){if(e?.code==="resource_unavailable")continue;throw e;}
          const {data,nowMs}=authorized;
          const text=decrypt(data,metadata({
            id:data.source_message_id,conversation_id:data.conversation_id,
            sender_id:data.sender_id,accepted_at:data.accepted_at
          },"unread",actorId),keyProvider);
          result.push({
            envelopeId:data.id,messageId:data.message_id,
            text,presentationProof:proof(
              presentationSecret,data.id,actorId,asTime(data.accepted_at),nowMs)
          });
        }
        return result;
  };
  const acknowledgeInExistingTx=async (c,{envelopeId,actorId,presentationProof,failureHook=null}={})=>{
      if(!validId(envelopeId)||!validId(actorId))deny();
      guardedPool(pool);
      if(!c||typeof c.query!=="function")deny();
      await guardActual(c);
        const {data,nowMs}=await authorizedEnvelope(c,envelopeId,actorId);
        requireProof(presentationProof,presentationSecret,data,actorId,nowMs);
        if(data.state!=="unread"&&data.state!=="acknowledged")deny();
        const token=capability(recoverySecret,data,actorId);
        const digest=tokenDigest(token);
        if(data.state==="unread"){
          if(data.first_acknowledged_at!==null||data.recovery_token_digest!==null)deny();
          const changed=await c.query(
            "UPDATE bridge_v2_secure_unread SET state='acknowledged',"+
            "first_acknowledged_at=$2,recovery_token_digest=$3 "+
            "WHERE id=$1 AND state='unread' AND first_acknowledged_at IS NULL "+
            "RETURNING id",[envelopeId,new Date(nowMs),digest]
          );
          if(changed.rows.length!==1)deny();
           if(failureHook)await failureHook("after_ack");
          return {status:"acknowledged",recoveryToken:token};
        }
        const first=asTime(data.first_acknowledged_at);
        if(first>nowMs||nowMs>=first+RECOVERY_MS||
           !compareDigest(data.recovery_token_digest,digest))deny();
        return {status:"already_acknowledged",recoveryToken:token};
  };
  const recoverInExistingTx=async (c,{envelopeId,actorId,recoveryToken}={})=>{
      if(!validId(envelopeId)||!validId(actorId)||typeof recoveryToken!=="string"||
         !/^[A-Za-z0-9_-]{43}$/.test(recoveryToken))deny();
      guardedPool(pool);
      if(!c||typeof c.query!=="function")deny();
      await guardActual(c);
        const {data,nowMs}=await authorizedEnvelope(c,envelopeId,actorId);
        if(data.state!=="acknowledged"||data.first_acknowledged_at===null)deny();
        const first=asTime(data.first_acknowledged_at);
        if(first>nowMs||nowMs>=first+RECOVERY_MS)deny();
        const expected=capability(recoverySecret,data,actorId);
        const digest=tokenDigest(recoveryToken);
        if(!compareDigest(data.recovery_token_digest,digest)||
           !timingSafeEqual(Buffer.from(expected),Buffer.from(recoveryToken)))deny();
        return {
          envelopeId:data.id,messageId:data.message_id,
          text:decrypt(data,metadata({
            id:data.source_message_id,conversation_id:data.conversation_id,
            sender_id:data.sender_id,accepted_at:data.accepted_at
          },"unread",actorId),keyProvider)
        };
  };
  return Object.freeze({
    // Synthetic internal same-client worker; caller must already hold 714411.
    readCurrentInExistingTx,
    async readCurrent(args={}){
      return trans(c=>readCurrentInExistingTx(c,args));
    },
    // Synthetic internal same-client worker; caller must already hold 714411.
    unreadInboxInExistingTx,
    async unreadInbox(args={}){
      return trans(c=>unreadInboxInExistingTx(c,args));
    },
    // Synthetic internal same-client worker; caller must already hold 714411.
    acknowledgeInExistingTx,
    async acknowledge(args={}){
      return trans(c=>acknowledgeInExistingTx(c,args));
    },
    // Synthetic internal same-client worker; caller must already hold 714411.
    recoverInExistingTx,
    async recover(args={}){
      return trans(c=>recoverInExistingTx(c,args));
    }
  });
}
