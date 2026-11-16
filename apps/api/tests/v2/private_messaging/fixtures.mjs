/**
 * B1a synthetic fixture builders, absolutely no private QA/live data.
 * Opaque bytea test values ARE NOT encrypted.
 */
import {randomBytes,randomUUID} from "node:crypto";
import {legacyFixture,legacySnapshot,connected,uuid} from "../connections/fixtures.mjs";
import {createKeepRepository} from "../../../src/connections/keep_repository.mjs";

export const checkHistorical=legacySnapshot;
export const seedHistorical=legacyFixture;
export const bytes=()=>({
  ciphertext:Buffer.from("synthetic-b1a-not-encrypted-"+randomUUID()),
  dataIv:randomBytes(12),
  dataTag:randomBytes(16),
  wrappedDek:randomBytes(32),
  wrapIv:randomBytes(12),
  wrapTag:randomBytes(16),
  kekId:"b1a-test-key-"+randomUUID(),
  kekVersion:1,
  cipherSuite:"aes-256-gcm-v1",
  aadVersion:1
});
export const count=async(pool,sql,args=[])=>
  Number((await pool.query(sql,args)).rows[0].n);
export async function seedSecureDirect(pool) {
  const f=await connected(pool,createKeepRepository(pool));
  const messageId=uuid(),clientMessageId=uuid(),acceptedAt=new Date();
  const record=(await pool.query(
    "INSERT INTO bridge_v2_secure_messages "+
    "(id,conversation_id,sender_id,client_message_id,sequence_number,"+
    "policy_version,accepted_at) VALUES($1,$2,$3,$4,1,'bridge-v2',$5) "+
    "RETURNING *",
    [messageId,f.conversationId,f.people[0],clientMessageId,acceptedAt])).rows[0];
  return {...f,messageId,clientMessageId,acceptedAt,message:record,
    senderId:f.people[0],recipientId:f.people[1]};
}
export async function insertLive(pool,messageId,blob=bytes()){
  await pool.query(
    "INSERT INTO bridge_v2_secure_live "+
    "(message_id,ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
    "kek_id,kek_version,cipher_suite,aad_version) "+
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [messageId,blob.ciphertext,blob.dataIv,blob.dataTag,blob.wrappedDek,
     blob.wrapIv,blob.wrapTag,blob.kekId,blob.kekVersion,blob.cipherSuite,blob.aadVersion]);
  return blob;
}
export async function insertUnread(pool,fixture,blob=bytes(),{
  expiresAt=new Date(fixture.acceptedAt.getTime()+7*86400000),state="unread",
  acknowledgedAt=null,tokenDigest=null,recipientId=fixture.recipientId,
  messageId=fixture.messageId,connectionId=fixture.connectionId
}={}){
  const id=uuid();
  await pool.query(
    "INSERT INTO bridge_v2_secure_unread "+
    "(id,message_id,connection_id,recipient_id,accepted_at,expires_at,"+
    "state,first_acknowledged_at,recovery_token_digest,"+
    "ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
    "kek_id,kek_version,cipher_suite,aad_version) "+
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",
    [id,messageId,connectionId,recipientId,fixture.acceptedAt,expiresAt,
     state,acknowledgedAt,tokenDigest,blob.ciphertext,blob.dataIv,blob.dataTag,
     blob.wrappedDek,blob.wrapIv,blob.wrapTag,blob.kekId,blob.kekVersion,
     blob.cipherSuite,blob.aadVersion]
  );
  return {id,blob};
}
export async function failsSql(pool,sql,args,code) {
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await (await import("node:assert/strict")).default.rejects(
      client.query(sql,args),e=>e.code===code);
  }finally{
    await client.query("ROLLBACK");
    client.release();
  }
}
