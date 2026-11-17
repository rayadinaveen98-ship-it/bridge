/**
 * B3c-2R3B-1. Disconnected, disposable PG18 TEST-ONLY transaction adapter.
 *
 * This is never a hosted API. Its ephemeral HMAC issuer and SQL gateway are
 * synthetic scaffolding, not a production trust boundary or E2EE system.
 * No caller-provided actor, SQL, role, key, policy or account permission flag.
 */
import {verifyBearer,uuid} from "../../auth.mjs";

const ACK="bridge-b3c2r3b1-disposable-only";
const ENV_URL="postgresql://bridge_privproof_admin:bridge_privproof_only@127.0.0.1:5432/bridge_privproof";
const ALLOWED=new Set(["send","live","unread","ack","recover"]);
const TARGET_OPERATIONS=new Set(["send","live","unread","ack","recover"]);
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class DisposableAuthorizationDenied extends Error {
  constructor(){super("resource_unavailable");this.name="DisposableAuthorizationDenied";
    this.code="resource_unavailable";}
}
const deny=()=>{throw new DisposableAuthorizationDenied();};
export function assertDisposableB3c2r3b1(env=process.env) {
  if(env.CI!=="true"||env.GITHUB_ACTIONS!=="true"||
    env.BRIDGE_B3C2R3B1_ACK!==ACK||
    env.BRIDGE_B3C2R2_ACK!=="disposable-actual-0008-pg18-only"||
    env.BRIDGE_B3C2R2_PG_MAJOR!=="18"||
    env.BRIDGE_B3C2R2_TEST_DATABASE_URL!==ENV_URL)deny();
  return ENV_URL;
}
const only=(o,keys)=>o&&typeof o==="object"&&!Array.isArray(o)&&
  Object.keys(o).every(k=>keys.includes(k));
const secureName=s=>typeof s==="string"&&/^b3r2_[0-9a-f]{12}_s$/.test(s);
function normalizedRequest(req){
  if(!only(req,["authorization","operation","targetId","clientMessageId","recoveryToken"])||
    typeof req.authorization!=="string"||!ALLOWED.has(req.operation)||
    !ID.test(req.targetId))deny();
  if(req.operation==="send"){
    if(!ID.test(req.clientMessageId)||req.recoveryToken!==undefined)deny();
  }else if(req.operation==="recover"){
    if(typeof req.recoveryToken!=="string"||
       req.recoveryToken.length<20||req.recoveryToken.length>256||
       req.clientMessageId!==undefined)deny();
  }else if(req.clientMessageId!==undefined||req.recoveryToken!==undefined)deny();
  return req;
}
export function createDisposableAtomicGuard({
  checkout,authentication,proofSigner,schema,testGate=null,env=process.env
}={}) {
  assertDisposableB3c2r3b1(env); // fail before even considering a pool
  if(!secureName(schema)||typeof checkout!=="function"||
     typeof proofSigner!=="function"||
     !authentication?.publicKeyPem||typeof authentication.issuer!=="string"||
     typeof authentication.audience!=="string"||
     (testGate!==null&&typeof testGate!=="function"))deny();
  return Object.freeze({
    async dispatch(raw){
      const req=normalizedRequest(raw);
      let client=null,active=false;
      try{
        // Verify first without DB; a second check uses authoritative PG clock
        const initial=verifyBearer(req.authorization,authentication);
        if(!/^b3b-disposable:[0-9a-f-]{36}$/.test(initial.subject))deny();
        const actor=initial.subject.substring("b3b-disposable:".length);
        if(!uuid(actor))deny();
        client=await checkout();
        if(!client||typeof client.query!=="function"||
           typeof client.release!=="function")deny();
        await client.query("BEGIN");
        active=true;
        const lock=await client.query("SELECT pg_advisory_xact_lock($1)",[714411]);
        if(!lock)deny();
        if(testGate)await testGate({point:"after_mutex",operation:req.operation,client});
        const state=(await client.query(
          "SELECT txid_current()::text tx, "+
          "floor(extract(epoch from clock_timestamp()))::bigint epoch, "+
          "session_user AS sess, current_user AS usr"
        )).rows[0];
        if(!state||state.usr!==state.sess||!Number.isSafeInteger(Number(state.epoch)))deny();
        const admitted=verifyBearer(req.authorization,{
          ...authentication,nowSeconds:Number(state.epoch)
        });
        if(admitted.subject!==initial.subject)deny();
        const expires=Math.min(admitted.expiresAt,Number(state.epoch)+25);
        if(expires<=Number(state.epoch))deny();
        const signature=proofSigner(Object.freeze({
          actor,operation:req.operation,targetId:req.targetId,
          clientMessageId:req.clientMessageId??null,
          recoveryToken:req.recoveryToken??null,
          expires,tx:state.tx,session:state.sess
        }));
        if(typeof signature!=="string"||!/^[0-9a-f]{64}$/.test(signature))deny();
        // Strictly fixed SQL, generated throwaway schema, no dynamic identifier from request.
        const response=await client.query(
          "SELECT "+schema+".dispatch("+
          "$1::uuid,$2::text,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::text) AS result",
          [actor,req.operation,req.targetId,req.clientMessageId??null,
            req.recoveryToken??null,String(expires),signature]
        );
        const result=response.rows[0]?.result;
        if(result===undefined||result===null)deny();
        if(testGate)await testGate({
          point:"after_operation_before_final_token",
          operation:req.operation,client
        });
        const wall=(await client.query(
          "SELECT floor(extract(epoch from clock_timestamp()))::bigint AS epoch"
        )).rows[0]?.epoch;
        const end=verifyBearer(req.authorization,{
          ...authentication,nowSeconds:Number(wall)
        });
        if(end.subject!==initial.subject||Number(wall)>=expires)deny();
        await client.query("COMMIT");
        active=false;
        return result;
      }catch{
        if(active&&client)try{await client.query("ROLLBACK");}catch{}
        deny();
      }finally{
        if(client)try{client.release();}catch{}
      }
    }
  });
}
