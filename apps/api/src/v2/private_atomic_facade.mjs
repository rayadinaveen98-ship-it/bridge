/**
 * Bridge B3b-2 — DISCONNECTED synthetic JWT -> encrypted B2 transaction.
 * Single transaction owner: B3b-1 subject adapter (714411 + actor FOR UPDATE).
 * Neither this file nor B2 inner workers are imported by HTTP/Render/Android.
 * Synthetic keys, internal operation dispatcher and acknowledged local PG16 only.
 */
import {verifyBearer} from "../auth.mjs";
import {createDisposableSubjectAdapter} from "./private_subject_adapter.mjs";
import {createPrivateWriteRepository} from "../messaging/private_repository.mjs";
import {createPrivateDeliveryRepository} from "../messaging/private_delivery_repository.mjs";
import {
  acceptedWriteReceipt,currentLiveResponse,unreadInboxResponse,
  acknowledgmentResponse,recoveryResponse
} from "./response_contract.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const deny=()=>{const e=new Error("resource_unavailable");
  e.name="AtomicPrivateDenied";e.code="resource_unavailable";throw e;};
const exact=(obj,keys)=>obj!==null&&typeof obj==="object"&&
  !Array.isArray(obj)&&Object.getPrototypeOf(obj)===Object.prototype&&
  Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));
const validId=x=>typeof x==="string"&&UUID.test(x);
function verifyPayload(operation,payload){
  if(!payload||typeof payload!=="object"||Array.isArray(payload))deny();
  switch(operation){
    case "send":
      if(!exact(payload,["conversationId","clientMessageId","syntheticPlaintext"])||
        !validId(payload.conversationId)||!validId(payload.clientMessageId)||
        typeof payload.syntheticPlaintext!=="string")deny();
      return;
    case "live":
      if(!(exact(payload,["conversationId"])||
           exact(payload,["conversationId","cursor"]))||
         !validId(payload.conversationId)||
         !(payload.cursor===undefined||payload.cursor===null||
           typeof payload.cursor==="string"))deny();
      return;
    case "unread":
      if(!exact(payload,[]))deny();
      return;
    case "ack":
      if(!exact(payload,["envelopeId","presentationProof"])||
         !validId(payload.envelopeId)||
         typeof payload.presentationProof!=="string")deny();
      return;
    case "recover":
      if(!exact(payload,["envelopeId","recoveryToken"])||
         !validId(payload.envelopeId)||typeof payload.recoveryToken!=="string")deny();
      return;
    default:deny();
  }
}
function finalTokenCheck(c,authorization,authentication,actorId){
  return c.query("SELECT clock_timestamp() AS instant").then(q=>{
    const instant=q.rows?.[0]?.instant;
    if(!(instant instanceof Date)||!Number.isSafeInteger(instant.getTime()))
      deny();
    const nowSeconds=Math.floor(instant.getTime()/1000);
    let verified;
    try{
      verified=verifyBearer(authorization,{
        publicKeyPem:authentication.publicKeyPem,
        issuer:authentication.issuer,
        audience:authentication.audience,
        nowSeconds
      });
    }catch{deny();}
    // B3b-1 synthetic-only subject UUID binding; NOT public provider syntax.
    if(verified.subject!=="b3b-disposable:"+actorId)deny();
  });
}
/**
 * testGate is a trusted CI fixture hook (never caller payload or HTTP input).
 * It may delay or throw inside the transaction for race/rollback certification.
 */
export function createDisposablePrivateAtomicFacade(pool,{
  authentication,keyProvider,wrapNonceRegistry,keyRefs,
  cursorKey,presentationKey,recoveryKey,testGate=null
}={}){
  if(testGate!==null&&typeof testGate!=="function")deny();
  const subjects=createDisposableSubjectAdapter(pool,{authentication});
  const writer=createPrivateWriteRepository(pool,{
    keyProvider,wrapNonceRegistry,keyRefs
  });
  const reader=createPrivateDeliveryRepository(pool,{
    keyProvider,cursorKey,presentationKey,recoveryKey
  });
  return Object.freeze({
    async dispatchSynthetic(request){
      if(!exact(request,["authorization","operation","payload"])||
         typeof request.authorization!=="string"||
         !["send","live","unread","ack","recover"].includes(request.operation))
        deny();
      const {authorization,operation,payload}=request;
      verifyPayload(operation,payload);
      // B3b-1 owns both the authenticated account lock and PG transaction.
      return subjects.withVerifiedActor({
        authorization,
        work:async (c,verified)=>{
          if(!c||typeof c.query!=="function"||!Object.isFrozen(verified)||
             !validId(verified.actorId))deny();
          const actorId=verified.actorId;
          const stage=async point=>{
            if(testGate)await testGate(Object.freeze({point,operation,client:c}));
          };
          let output;
          switch(operation){
            case "send":
              output=acceptedWriteReceipt(
                await writer.acceptInExistingTx(c,{
                  ...payload,actorId,failureHook:stage
                })
              );break;
            case "live":
              output=currentLiveResponse(
                await reader.readCurrentInExistingTx(c,{
                  conversationId:payload.conversationId,
                  cursor:payload.cursor??null,actorId
                })
              );break;
            case "unread":
              output=unreadInboxResponse(
                await reader.unreadInboxInExistingTx(c,{actorId})
              );break;
            case "ack":
              output=acknowledgmentResponse(
                await reader.acknowledgeInExistingTx(c,{
                  ...payload,actorId,failureHook:stage
                })
              );break;
            case "recover":
              output=recoveryResponse(
                await reader.recoverInExistingTx(c,{...payload,actorId})
              );break;
            default:deny();
          }
          await stage("after_operation_before_final_token");
          // CRITICAL: any wait during B2 room/peer locks, AEAD, callback or
          // gated tests can cross exp; reject + rollback BEFORE COMMIT.
          await finalTokenCheck(c,authorization,authentication,actorId);
          return output;
        }
      });
    }
  });
}
