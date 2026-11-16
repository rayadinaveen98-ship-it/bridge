/**
 * B3b-2 internal CI-only composition of synthetic keys/accounts/rooms.
 * All fixtures live in acknowledged localhost PG16 bridge_test, never Neon.
 */
import {randomBytes} from "node:crypto";
import {createDisposablePrivateAtomicFacade}
  from "../../../src/v2/private_atomic_facade.mjs";
import {
  syntheticSigning,signedToken,subject,disposableUrl,blocked,sleep
} from "./fixtures.mjs";
import {
  b2SchemaReady,testWriter,repos,connected,randomRoom,
  legacyFixture,legacySnapshot,perRoomState,tally,qty,uuid
} from "../private_messaging/b2_fixtures.mjs";

export {b2SchemaReady,repos,connected,randomRoom,legacyFixture,legacySnapshot,
  perRoomState,tally,qty,uuid,disposableUrl,blocked,sleep};

export async function bindSyntheticSubjects(pool,people){
  for(const actorId of people){
    await pool.query("UPDATE bridge_accounts SET auth_subject=$2 WHERE id=$1",
      [actorId,subject(actorId)]);
  }
}
export async function makeAtomic(pool,{
  kind="direct",testGate=null
}={}){
  const keep=repos(pool).keep;
  const f=kind==="direct"?await connected(pool,keep):await randomRoom(pool);
  await bindSyntheticSubjects(pool,f.people);
  const keys=syntheticSigning(),w=testWriter(pool);
  const cursorKey=randomBytes(32);
  const presentationKey=randomBytes(32);
  const recoveryKey=randomBytes(32);
  const facade=createDisposablePrivateAtomicFacade(pool,{
    authentication:keys.authentication,keyProvider:w.keyProvider,
    wrapNonceRegistry:w.wrapNonceRegistry,keyRefs:w.keyRefs,
    cursorKey,presentationKey,recoveryKey,testGate
  });
  const room=f.conversationId??f.room;
  const tokenFor=id=>signedToken(keys,{sub:subject(id)});
  const call=(who,operation,payload)=>facade.dispatchSynthetic({
    authorization:tokenFor(who),operation,payload
  });
  const send=(actorId,body="B3b-2 encrypted Telugu తెలుగు 🎬",messageId=uuid())=>
    call(actorId,"send",{conversationId:room,clientMessageId:messageId,
      syntheticPlaintext:body});
  const live=(actorId,cursor=null)=>call(actorId,"live",
    {conversationId:room,cursor});
  const unread=actorId=>call(actorId,"unread",{});
  const ack=(actorId,envelopeId,presentationProof)=>call(actorId,"ack",
    {envelopeId,presentationProof});
  const recover=(actorId,envelopeId,recoveryToken)=>call(actorId,"recover",
    {envelopeId,recoveryToken});
  return {
    f,room,w,keys,facade,tokenFor,call,send,live,unread,ack,recover,
    destroy:()=>{w.destroy();cursorKey.fill(0);presentationKey.fill(0);
      recoveryKey.fill(0);}
  };
}
export async function secureCounts(pool,room){
  return tally(pool,room);
}
export function guardedPoolSpy(pool){
  const audit={checkout:0,begin:0,commit:0,rollback:0,mutex:0,clients:new Set()};
  const wrapped={
    options:{connectionString:disposableUrl()},
    async connect(){
      audit.checkout++;
      const c=await pool.connect();
      audit.clients.add(c);
      return {
        async query(sql,...args){
          if(sql==="BEGIN")audit.begin++;
          else if(sql==="COMMIT")audit.commit++;
          else if(sql==="ROLLBACK")audit.rollback++;
          else if(typeof sql==="string"&&sql.includes("pg_advisory_xact_lock"))audit.mutex++;
          return c.query(sql,...args);
        },
        release(){c.release();}
      };
    }
  };
  return {pool:wrapped,audit};
}
export async function actualLegacySnapshot(pool){
  const legacy=await legacyFixture(pool);
  return {
    fixture:legacy,
    before:await legacySnapshot(pool,legacy)
  };
}
