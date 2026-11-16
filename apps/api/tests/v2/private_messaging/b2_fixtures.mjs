/**
 * B2a PG16 synthetic-only fixture setup. Never read Neon or hosted QA records.
 * Existing four legacy messages are created only in disposable bridge_test.
 */
import {randomBytes} from "node:crypto";
import {createKeepRepository} from "../../../src/connections/keep_repository.mjs";
import {createDirectSessionRepository} from "../../../src/sessions/direct_repository.mjs";
import {createRandomSessionRepository} from "../../../src/sessions/random_repository.mjs";
import {createPrivateWriteRepository}
  from "../../../src/messaging/private_repository.mjs";
import {createInMemoryTestKeyProvider,createTestWrapNonceRegistry}
  from "../../../src/messaging/private_key_contract.mjs";
import {applyDisposable0008} from "./migration_0008_runner.mjs";
import {checkDisposable,randomRoom,connected,legacyFixture,legacySnapshot,
  setRoomDeadline,accounts,qty,single,uuid,hold} from "../connections/fixtures.mjs";

export {
  checkDisposable,randomRoom,connected,legacyFixture,legacySnapshot,
  setRoomDeadline,accounts,qty,single,uuid,hold
};
export async function b2SchemaReady(pool) {
  const result=await applyDisposable0008({
    databaseUrl:checkDisposable(),
    acknowledgment:process.env.BRIDGE_TEST_MIGRATION_ACK
  });
  if(!["applied","already_applied"].includes(result.status))
    throw Error("B2a disposable 0008 is not ready");
  const led=await qty(pool,
    "SELECT count(*)::int n FROM bridge_schema_migrations WHERE version='0008'");
  if(led!==1)throw Error("B2a 0008 ledger receipt missing");
}
export const sample="B2a synthetic text only: Telugu తెలుగు, emoji 🎬";
export function testWriter(pool){
  const keyProvider=createInMemoryTestKeyProvider();
  const wrapNonceRegistry=createTestWrapNonceRegistry();
  const keyRefs={
    live:{keyId:"b2a.synthetic.live",version:1},
    unread:{keyId:"b2a.synthetic.unread",version:1}
  };
  for(const purpose of ["live","unread"])keyProvider.registerKey({
    purpose,...keyRefs[purpose],key:randomBytes(32)
  });
  const repository=createPrivateWriteRepository(pool,{
    keyProvider,wrapNonceRegistry,keyRefs
  });
  return {
    repository,keyProvider,wrapNonceRegistry,keyRefs,
    destroy:()=>{keyProvider.destroy();wrapNonceRegistry.destroy();}
  };
}
export function repos(pool) {
  return {
    keep:createKeepRepository(pool),
    direct:createDirectSessionRepository(pool),
    random:createRandomSessionRepository(pool)
  };
}
export const row=async(pool,table,messageId)=>{
  {if(!["bridge_v2_secure_live","bridge_v2_secure_unread"].includes(table))
    throw Error("Disallowed fixture read");}
  const q=table==="bridge_v2_secure_live"?"message_id":"message_id";
  return (await pool.query("SELECT * FROM "+table+" WHERE "+q+"=$1",[messageId])).rows[0]??null;
};
export const fromRow=x=>({
  ciphertext:x.ciphertext,dataIv:x.data_iv,dataTag:x.data_tag,
  wrappedDek:x.wrapped_dek,wrapIv:x.wrap_iv,wrapTag:x.wrap_tag,
  kekId:x.kek_id,kekVersion:x.kek_version,
  cipherSuite:x.cipher_suite,aadVersion:x.aad_version
});
export const meta=(f,messageId,actorId,now,purpose="live",recipientId=null)=>({
  messageId,conversationId:f.conversationId??f.room,
  senderId:actorId,recipientId,acceptedAtMs:now.getTime(),
  purpose,policyVersion:"bridge-v2",payloadVersion:1
});
export async function perRoomState(pool,id) {
  return single(pool,
    "SELECT next_message_sequence,last_accepted_at,idle_expires_at,state "+
    "FROM bridge_conversations WHERE id=$1",[id]);
}
export const tally=async(pool,room)=>{
  const out={};
  out.messages=await qty(pool,
    "SELECT count(*)::int n FROM bridge_v2_secure_messages WHERE conversation_id=$1",[room]);
  out.live=await qty(pool,
    "SELECT count(*)::int n FROM bridge_v2_secure_live l JOIN bridge_v2_secure_messages m "+
    "ON m.id=l.message_id WHERE m.conversation_id=$1",[room]);
  out.unread=await qty(pool,
    "SELECT count(*)::int n FROM bridge_v2_secure_unread u JOIN bridge_v2_secure_messages m "+
    "ON m.id=u.message_id WHERE m.conversation_id=$1",[room]);
  out.outbox=await qty(pool,
    "SELECT count(*)::int n FROM bridge_event_outbox WHERE conversation_id=$1",[room]);
  out.legacy=await qty(pool,
    "SELECT count(*)::int n FROM bridge_messages WHERE conversation_id=$1",[room]);
  return out;
};
