/**
 * Bridge B3a PURE response-shape contract; DISCONNECTED, NOT A LIVE ROUTE.
 * Future code must derive identity, eligibility, room scope and data from
 * signed bearer + authoritative locked DB; these formatters do NOT authorize.
 * No history endpoint, no plaintext fallback, no logging.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_PAGE=25;
const UUID_OK=x=>typeof x==="string"&&UUID.test(x);
const isPlain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
function exact(x,names){
  return isPlain(x)&&Object.keys(x).length===names.length&&
    names.every(k=>Object.hasOwn(x,k));
}
function fail(){
  const e=new Error("resource_unavailable");
  e.name="BridgeB3aContractDenied";
  e.code="resource_unavailable";
  throw e;
}
const frozen=x=>Object.freeze(x);
const NO_STORE=frozen({
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"
});
/** A uniform 404 body has no guessed IDs, actor IDs, plaintext or secrets. */
export function deniedResponse(){
  return frozen({
    status:404,
    headers:NO_STORE,
    body:frozen({error:"resource_unavailable"})
  });
}
/** Only use after server has established that the requesting account itself
 * must upgrade; NEVER on a guessed session ID/foreign account.
 */
export function upgradeResponse({authorizedOwnAccount}={}){
  if(authorizedOwnAccount!==true)return deniedResponse();
  return frozen({
    status:426,
    headers:NO_STORE,
    body:frozen({error:"upgrade_required"})
  });
}
export function safeEnvelopeMetadata({status=200}={}){
  if(!Number.isInteger(status)||status<200||status>499)fail();
  return frozen({status,headers:NO_STORE});
}
function signedOpaque(cursor){
  // Test contract only: B2b HMAC cursor includes payload.signature.
  return typeof cursor==="string"&&cursor.length>20&&cursor.length<=1024&&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cursor);
}
function printableText(x){
  return typeof x==="string"&&x.length>0&&
    [...x].length<=4000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(x);
}
function goodNumber(n){return Number.isSafeInteger(n)&&n>=1;}
function visibleMessage(row){
  if(!isPlain(row)||!UUID_OK(row.id)||!goodNumber(row.sequenceNumber))
    fail();
  if(row.deleted===true){
    if(!exact(row,["id","sequenceNumber","deleted"]))fail();
    return frozen({id:row.id,sequenceNumber:row.sequenceNumber,deleted:true});
  }
  if(!exact(row,["id","sequenceNumber","senderId","deleted","text"])||
     row.deleted!==false||!UUID_OK(row.senderId)||!printableText(row.text))
    fail();
  return frozen({
    id:row.id,sequenceNumber:row.sequenceNumber,
    senderId:row.senderId,deleted:false,text:row.text
  });
}
/** Current LIVE only. Explicitly no room history/copy of old random content. */
export function currentLiveResponse(payload){
  if(!exact(payload,["messages","cursor"])||
     !Array.isArray(payload.messages)||payload.messages.length>MAX_PAGE||
     !signedOpaque(payload.cursor))fail();
  let prev=0;
  const seen=new Set();
  const messages=payload.messages.map(row=>{
    const m=visibleMessage(row);
    if(m.sequenceNumber<=prev||seen.has(m.id))fail();
    prev=m.sequenceNumber;seen.add(m.id);
    return m;
  });
  return frozen({messages:frozen(messages),cursor:payload.cursor});
}
/** Recipient-only UNREAD: no conversationId, sender list, paging or history.
 * Proof is SECRET to this response. Never pass this response to logs/SSE.
 */
export function unreadInboxResponse(items){
  if(!Array.isArray(items)||items.length>MAX_PAGE)fail();
  const seen=new Set();
  const out=items.map(item=>{
    if(!exact(item,["envelopeId","messageId","text","presentationProof"])||
       !UUID_OK(item.envelopeId)||!UUID_OK(item.messageId)||
       !printableText(item.text)||!signedOpaque(item.presentationProof)||
       seen.has(item.envelopeId))fail();
    seen.add(item.envelopeId);
    return frozen({
      envelopeId:item.envelopeId,messageId:item.messageId,
      text:item.text,presentationProof:item.presentationProof
    });
  });
  return frozen(out);
}
function opaqueRecoveryToken(v){
  return typeof v==="string"&&/^[A-Za-z0-9_-]{43}$/.test(v);
}
/** For recipient transport only: do NOT emit recoveryToken in notifications. */
export function acknowledgmentResponse(value){
  if(!exact(value,["status","recoveryToken"])||
     !["acknowledged","already_acknowledged"].includes(value.status)||
     !opaqueRecoveryToken(value.recoveryToken))fail();
  return frozen({status:value.status,recoveryToken:value.recoveryToken});
}
export function recoveryResponse(value){
  if(!exact(value,["envelopeId","messageId","text"])||
     !UUID_OK(value.envelopeId)||!UUID_OK(value.messageId)||
     !printableText(value.text))fail();
  return frozen({
    envelopeId:value.envelopeId,messageId:value.messageId,text:value.text
  });
}
export function acceptedWriteReceipt(value){
  if(!exact(value,["id","sequenceNumber","duplicate"])||
     !UUID_OK(value.id)||!goodNumber(value.sequenceNumber)||
     typeof value.duplicate!=="boolean")fail();
  return frozen({
    id:value.id,sequenceNumber:value.sequenceNumber,duplicate:value.duplicate
  });
}
/** Proposed V2 hint-only SSE payload. No body/ciphertext/secret/cursor. */
export function notificationHint(value){
  if(!exact(value,["conversationId","messageId","sequenceNumber"])||
     !UUID_OK(value.conversationId)||!UUID_OK(value.messageId)||
     !goodNumber(value.sequenceNumber))fail();
  return frozen({
    conversationId:value.conversationId,messageId:value.messageId,
    sequenceNumber:value.sequenceNumber
  });
}
/** Proposed V2 bootstrap: explicit finite current ID and unread count.
 * No previous-session pointers, snippets, report/case evidence or timeline.
 */
export function bootstrapResponse(value){
  if(!exact(value,["currentConversationId","mutualConnectionIds","unreadCount"])||
     !(value.currentConversationId===null||UUID_OK(value.currentConversationId))||
     !Array.isArray(value.mutualConnectionIds)||value.mutualConnectionIds.length>100||
     !value.mutualConnectionIds.every(UUID_OK)||
     new Set(value.mutualConnectionIds).size!==value.mutualConnectionIds.length||
     !Number.isSafeInteger(value.unreadCount)||value.unreadCount<0||value.unreadCount>10000)
    fail();
  return frozen({
    currentConversationId:value.currentConversationId,
    mutualConnectionIds:frozen([...value.mutualConnectionIds]),
    unreadCount:value.unreadCount
  });
}
/** Neither user-agent nor arbitrary caller actor/recipient is an authority.
 * This validates only a FUTURE trusted facade-produced identity shape,
 * NOT a JWT signature or database authorization by itself.
 */
export function trustedActorShape(context){
  return exact(context,["verifiedSubject","serverAccountId","storedAccount"] )&&
    typeof context.verifiedSubject==="string"&&
    context.verifiedSubject.length>0&&context.verifiedSubject.length<=256&&
    UUID_OK(context.serverAccountId)&&
    isPlain(context.storedAccount)&&
    context.storedAccount.id===context.serverAccountId&&
    context.storedAccount.auth_subject===context.verifiedSubject&&
    context.storedAccount.status==="active"&&
    context.storedAccount.age_verified_at!=null&&
    context.storedAccount.safety_eligible===true;
}
