/**
 * Bridge B2a — disconnected synthetic-only encrypted WRITE repository.
 * NEVER import from hosted start/http/postgres/outbox or Android.
 * Uses disposable PG16 bridge_test only; B1b keys are ephemeral TEST keys.
 * No V1 bridge_messages/bridge_message_payloads/bridge_unread_deliveries writes.
 */
import {randomUUID} from "node:crypto";
import {withV2ConnectionTx,instantAfterLocks,lockV2Relationship}
  from "../sessions/direct_repository.mjs";
import {requireLive} from "./scope.mjs";
import {encryptSyntheticPrivate,decryptSyntheticPrivate}
  from "./private_crypto.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_ID=/^[a-zA-Z0-9._:-]{1,128}$/;
const POLICY="bridge-v2";
const ACK="disposable-bridge_test-only";
const THIRTY_MIN=30*60*1000;
const SEVEN_DAYS=7*86400000;
export class PrivateWriteDenied extends Error {
  constructor(){super("resource_unavailable");this.name="PrivateWriteDenied";this.code="resource_unavailable";}
}
const deny=()=>{throw new PrivateWriteDenied();};
const id=x=>typeof x==="string"&&UUID.test(x);
function assertDisposable(pool){
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
function validText(text){
  if(typeof text!=="string"||!text.isWellFormed()||text.length>8000)deny();
  const normalized=text.normalize("NFC");
  const bytes=Buffer.byteLength(normalized,"utf8");
  if(bytes<1||bytes>4000)deny();
  return normalized;
}
function configuredRef(ref){
  if(!ref||typeof ref.keyId!=="string"||!KEY_ID.test(ref.keyId)||
     !Number.isSafeInteger(ref.version)||ref.version<1)deny();
  return Object.freeze({keyId:ref.keyId,version:ref.version});
}
function fromSecureRow(row) {
  if(!row||!row.ciphertext)deny();
  return {
    ciphertext:row.ciphertext,dataIv:row.data_iv,dataTag:row.data_tag,
    wrappedDek:row.wrapped_dek,wrapIv:row.wrap_iv,wrapTag:row.wrap_tag,
    kekId:row.kek_id,kekVersion:row.kek_version,
    cipherSuite:row.cipher_suite,aadVersion:row.aad_version
  };
}
function aad({messageId,conversationId,senderId,recipientId=null,acceptedAt,purpose}){
  if(!(acceptedAt instanceof Date)||!Number.isSafeInteger(acceptedAt.getTime()))deny();
  return {
    policyVersion:POLICY,payloadVersion:1,purpose,
    messageId,conversationId,senderId,recipientId,
    acceptedAtMs:acceptedAt.getTime()
  };
}
async function guardDatabaseIdentity(c){
  const {rows}=await c.query("SELECT current_database() AS db,current_user AS usr,inet_server_addr() AS host");
  if(rows.length!==1||rows[0].db!=="bridge_test"||
     rows[0].usr!=="bridge_test"||rows[0].host===null)deny();
  const receipt=(await c.query(
    "SELECT 1 FROM bridge_schema_migrations WHERE version='0008' LIMIT 1")).rows;
  if(receipt.length!==1)deny();
}
async function lockedContext(c,conversationId,actorId){
  const room=(await c.query(
    "SELECT id,kind,state,policy_version,v2_session_role,legacy_qa,"+
    "connection_id,match_session_id,last_accepted_at,idle_expires_at,"+
    "next_message_sequence FROM bridge_conversations WHERE id=$1 FOR UPDATE",
    [conversationId])).rows[0];
  if(!room||room.policy_version!==POLICY||room.legacy_qa!==false||
     room.state!=="open")deny();
  const parts=(await c.query(
    "SELECT account_id,left_at FROM bridge_conversation_participants "+
    "WHERE conversation_id=$1 ORDER BY account_id",
    [conversationId])).rows;
  if(parts.length!==2||parts.some(p=>p.left_at!==null)||
     !parts.some(p=>p.account_id===actorId)||
     parts[0].account_id===parts[1].account_id)deny();
  const members=parts.map(p=>p.account_id);
  const recipientId=members.find(x=>x!==actorId);
  let relation=null,segment=null;
  if(room.kind==="random"){
    if(room.v2_session_role!=="random"||!room.match_session_id||
       room.connection_id!==null)deny();
    const match=(await c.query(
      "SELECT state,member_low,member_high FROM bridge_match_sessions "+
      "WHERE id=$1 FOR UPDATE",[room.match_session_id])).rows[0];
    if(!match||match.state!=="active"||match.member_low!==members[0]||
       match.member_high!==members[1])deny();
    const slots=(await c.query(
      "SELECT account_id FROM bridge_active_match_slots "+
      "WHERE match_session_id=$1 ORDER BY account_id FOR UPDATE",
      [room.match_session_id])).rows;
    if(slots.length!==2||slots.some((v,i)=>v.account_id!==members[i]))deny();
  } else if(room.kind==="connection"){
    if(room.v2_session_role!=="direct"||room.match_session_id!==null||
       !room.connection_id)deny();
    relation=await lockV2Relationship(c,room.connection_id,actorId);
    if(relation.member_low!==members[0]||relation.member_high!==members[1])deny();
    segment=(await c.query(
      "SELECT conversation_id,connection_id,state,policy_version "+
      "FROM bridge_v2_direct_sessions WHERE conversation_id=$1 FOR UPDATE",
      [conversationId])).rows[0]??null;
  }else deny();
  const accounts=(await c.query(
    "SELECT id,status,age_verified_at,safety_eligible FROM bridge_accounts "+
    "WHERE id=ANY($1::uuid[]) ORDER BY id",[members])).rows;
  const blocked=(await c.query(
    "SELECT 1 FROM bridge_blocks WHERE (blocker_id=$1 AND blocked_id=$2) "+
    "OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",members)).rows.length>0;
  // PostgreSQL clock_timestamp(), never transaction now() or a client clock.
  const dbInstant=await instantAfterLocks(c);
  if(!(dbInstant instanceof Date))deny();
  const now=new Date(dbInstant.getTime()); // DB owner time normalized to a single ms.
  requireLive({room,segment,relation,actorId,participants:members,
    accounts,blocked,now});
  return {room,relation,now,recipientId};
}
function publicReceipt(id,sequenceNumber,duplicate=false){
  return Object.freeze({id,sequenceNumber,duplicate});
}
async function persistPayload(c,table,idColumn,idValue,record){
  // Only internal static names, never user-supplied identifier interpolation.
  if(table!=="bridge_v2_secure_live"&&table!=="bridge_v2_secure_unread")deny();
  const fields=[
    record.ciphertext,record.dataIv,record.dataTag,record.wrappedDek,
    record.wrapIv,record.wrapTag,record.kekId,record.kekVersion,
    record.cipherSuite,record.aadVersion
  ];
  if(table==="bridge_v2_secure_live"){
    await c.query(
      "INSERT INTO bridge_v2_secure_live "+
      "(message_id,ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
      "kek_id,kek_version,cipher_suite,aad_version) "+
      "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [idValue,...fields]);
  } else {
    // Unread row requires independently authorized recipient and relation.
    if(!idColumn||!idValue)deny();
    throw new Error("B2a unread requires explicit authorized columns");
  }
}
export function createPrivateWriteRepository(pool,{
  keyProvider,wrapNonceRegistry,keyRefs
}={}){
  assertDisposable(pool);
  if(typeof keyProvider?.getKek!=="function"||
     typeof wrapNonceRegistry?.claim!=="function")deny();
  const live=configuredRef(keyRefs?.live);
  const unread=configuredRef(keyRefs?.unread);
  if(live.keyId===unread.keyId)deny();
  return Object.freeze({
    async acceptSynthetic({
      conversationId,actorId,clientMessageId,syntheticPlaintext,failureHook=null
    }={}){
      assertDisposable(pool);
      if(!id(conversationId)||!id(actorId)||!id(clientMessageId)||
         (failureHook!==null&&typeof failureHook!=="function"))deny();
      const canonical=validText(syntheticPlaintext);
      // Per-item keys only from synthetic injected test provider, no env fallback.
      return withV2ConnectionTx(pool,async c=>{
        await guardDatabaseIdentity(c);
        const {room,relation,now,recipientId}=
          await lockedContext(c,conversationId,actorId);
        const previous=(await c.query(
          "SELECT m.id,m.sequence_number,m.accepted_at,m.sender_id,"+
          "l.ciphertext,l.data_iv,l.data_tag,l.wrapped_dek,l.wrap_iv,"+
          "l.wrap_tag,l.kek_id,l.kek_version,l.cipher_suite,l.aad_version "+
          "FROM bridge_v2_secure_messages m LEFT JOIN bridge_v2_secure_live l "+
          "ON l.message_id=m.id "+
          "WHERE m.conversation_id=$1 AND m.sender_id=$2 AND m.client_message_id=$3",
          [conversationId,actorId,clientMessageId])).rows[0];
        if(previous){
          let decrypted;
          try{
            decrypted=decryptSyntheticPrivate({
              record:fromSecureRow(previous),
              metadata:aad({
                messageId:previous.id,conversationId,senderId:actorId,
                acceptedAt:previous.accepted_at,purpose:"live"
              }),
              keyProvider
            });
          }catch{deny();}
          if(decrypted!==canonical)deny();
          return publicReceipt(previous.id,Number(previous.sequence_number),true);
        }
        const seq=Number(room.next_message_sequence);
        if(!Number.isSafeInteger(seq)||seq<1||
           seq>=Number.MAX_SAFE_INTEGER)deny();
        const messageId=randomUUID();
        const liveMeta=aad({
          messageId,conversationId,senderId:actorId,acceptedAt:now,
          purpose:"live"
        });
        const liveRecord=encryptSyntheticPrivate({
          plaintext:canonical,metadata:liveMeta,keyProvider,
          wrapNonceRegistry,keyId:live.keyId,keyVersion:live.version
        });
        // Every row below is in the SAME transaction; no legacy plaintext row.
        await c.query(
          "INSERT INTO bridge_v2_secure_messages "+
          "(id,conversation_id,sender_id,client_message_id,sequence_number,"+
          "policy_version,accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [messageId,conversationId,actorId,clientMessageId,seq,POLICY,now]);
        if(failureHook)await failureHook("after_metadata");
        await persistPayload(c,"bridge_v2_secure_live","message_id",messageId,liveRecord);
        if(failureHook)await failureHook("after_live");
        if(relation){
          const unreadMeta=aad({
            messageId,conversationId,senderId:actorId,
            recipientId,acceptedAt:now,purpose:"unread"
          });
          const unreadRecord=encryptSyntheticPrivate({
            plaintext:canonical,metadata:unreadMeta,keyProvider,
            wrapNonceRegistry,keyId:unread.keyId,keyVersion:unread.version
          });
          await c.query(
            "INSERT INTO bridge_v2_secure_unread "+
            "(message_id,connection_id,recipient_id,accepted_at,expires_at,"+
            "ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
            "kek_id,kek_version,cipher_suite,aad_version) "+
            "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
            [messageId,relation.id,recipientId,now,
             new Date(now.getTime()+SEVEN_DAYS),
             unreadRecord.ciphertext,unreadRecord.dataIv,unreadRecord.dataTag,
             unreadRecord.wrappedDek,unreadRecord.wrapIv,unreadRecord.wrapTag,
             unreadRecord.kekId,unreadRecord.kekVersion,
             unreadRecord.cipherSuite,unreadRecord.aadVersion]);
        }
        if(failureHook)await failureHook("after_unread");
        await c.query(
          "INSERT INTO bridge_event_outbox "+
          "(event_key,event_type,conversation_id,payload) "+
          "VALUES($1,'conversation.message.accepted',$2,$3::jsonb)",
          ["message:"+messageId,conversationId,
           JSON.stringify({messageId,sequenceNumber:seq})]);
        if(failureHook)await failureHook("after_outbox");
        await c.query(
          "UPDATE bridge_conversations SET next_message_sequence=$2,"+
          "last_accepted_at=$3,idle_expires_at=$4 "+
          "WHERE id=$1",[conversationId,seq+1,now,
            new Date(now.getTime()+THIRTY_MIN)]);
        if(failureHook)await failureHook("after_clock");
        return publicReceipt(messageId,seq);
      });
    }
  });
}
