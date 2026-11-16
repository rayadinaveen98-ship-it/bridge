import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  deniedResponse,upgradeResponse,safeEnvelopeMetadata,currentLiveResponse,
  unreadInboxResponse,acknowledgmentResponse,recoveryResponse,
  acceptedWriteReceipt,notificationHint,bootstrapResponse,trustedActorShape
} from "../../../src/v2/response_contract.mjs";

const id={
  room:"33333333-3333-4333-8333-333333333333",
  a:"11111111-1111-4111-8111-111111111111",
  b:"22222222-2222-4222-8222-222222222222",
  message:"44444444-4444-4444-8444-444444444444",
  second:"55555555-5555-4555-8555-555555555555",
  envelope:"66666666-6666-4666-8666-666666666666",
  mutual:"77777777-7777-4777-8777-777777777777"
};
const cursor="eyJwb2xpY3kiOiJ0ZXN0In0."+"A".repeat(43);
const proof="eyJlbmQiOiJzeW50aGV0aWMifQ."+"B".repeat(43);
const recoveryToken="c".repeat(43);
const live={id:id.message,sequenceNumber:1,senderId:id.a,deleted:false,text:"Hello Telugu తెలుగు 🎬"};
const tomb={id:id.second,sequenceNumber:2,deleted:true};
const unread={envelopeId:id.envelope,messageId:id.message,text:"Hello",
  presentationProof:proof};
const unavailable=e=>e?.code==="resource_unavailable";

test("G03-13: uniform no-oracle denied response is no-store, immutable, ID/body free",()=>{
  const a=deniedResponse(),b=deniedResponse();
  assert.deepEqual(a,{status:404,headers:{
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
  },body:{error:"resource_unavailable"}});
  assert.deepEqual(a,b);
  assert.equal(Object.isFrozen(a),true);
  assert.equal(Object.isFrozen(a.body),true);
  assert.equal(Object.isFrozen(a.headers),true);
  for(const forbidden of ["id","actorId","body","text","token","ciphertext",
    "recoveryToken","conversationId","messageId"]){
    assert.equal(Object.hasOwn(a.body,forbidden),false,forbidden);
  }
});
test("G03-14: upgrade required only when future server certifies own account",()=>{
  assert.deepEqual(upgradeResponse(),deniedResponse());
  assert.deepEqual(upgradeResponse({authorizedOwnAccount:false}),deniedResponse());
  const own=upgradeResponse({authorizedOwnAccount:true});
  assert.equal(own.status,426);
  assert.deepEqual(own.body,{error:"upgrade_required"});
  assert.equal(own.headers["Cache-Control"],"no-store");
  assert.equal(JSON.stringify(own).includes(id.room),false);
});
test("G03-15: response metadata explicitly no-store and status bound",()=>{
  assert.deepEqual(safeEnvelopeMetadata(),{
    status:200,headers:{"Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff"}
  });
  for(const status of [-1,0,199,500,999,NaN,201.5,"200"]){
    assert.throws(()=>safeEnvelopeMetadata({status}),unavailable);
  }
  assert.equal(safeEnvelopeMetadata({status:426}).status,426);
});
test("G03-16: current-only LIVE page preserves ordered text and tombstone, not history",()=>{
  const result=currentLiveResponse({messages:[live,tomb],cursor});
  assert.deepEqual(result,{messages:[live,tomb],cursor});
  assert.ok(Object.isFrozen(result.messages));
  assert.ok(Object.isFrozen(result.messages[0]));
  assert.equal(Object.hasOwn(result,"previousSession"),false);
  assert.equal(Object.hasOwn(result,"history"),false);
  assert.equal(Object.hasOwn(result.messages[1],"text"),false);
});
test("G03-17: LIVE malformed/oversized/replay and private metadata denied",()=>{
  const bad=[
    {messages:[{...live,conversationId:id.room}],cursor},
    {messages:[{...live,body:"old plaintext"}],cursor},
    {messages:[{...live,text:""}],cursor},
    {messages:[{...live,text:"bad\u0000input"}],cursor},
    {messages:[{...live,sequenceNumber:0}],cursor},
    {messages:[{...live,deleted:true,text:"old"}],cursor},
    {messages:[{...tomb,text:"not tombstoned"}],cursor},
    {messages:[tomb,live],cursor},
    {messages:[live,live],cursor},
    {messages:[live,tomb],cursor:"tampered"},
    {messages:[live],cursor,history:[live]},
    {messages:Array(26).fill(live),cursor}
  ];
  for(const value of bad){
    assert.throws(()=>currentLiveResponse(value),unavailable);
  }
});
test("G03-18: unread response finite, recipient-only, has no general timeline",()=>{
  const result=unreadInboxResponse([unread]);
  assert.deepEqual(result,[unread]);
  assert.equal(Object.isFrozen(result),true);
  assert.equal(Object.isFrozen(result[0]),true);
  assert.deepEqual(unreadInboxResponse([]),[]);
  for(const banned of ["conversationId","senderId","history","afterSequence",
    "sourceRoom","clientUserId","wrappedDek","recipientId"]){
    assert.equal(Object.hasOwn(result[0],banned),false);
  }
});
test("G03-19: unread forged recipient/source, extra fields or repeated envelopes denied",()=>{
  const invalid=[
    [{...unread,senderId:id.a}],
    [{...unread,conversationId:id.room}],
    [{...unread,recoveryToken}],
    [{...unread,text:""}],
    [{...unread,presentationProof:"broken"}],
    [{...unread,envelopeId:"guess"}],
    [{...unread,messageId:"guess"}],
    [unread,unread],
    Array(26).fill(unread),
    {items:[unread]}
  ];
  for(const value of invalid)assert.throws(()=>unreadInboxResponse(value),unavailable);
});
test("G03-20: first ack and 15m recovery shapes must not grow previous-history fields",()=>{
  const ack=acknowledgmentResponse({status:"acknowledged",recoveryToken});
  assert.deepEqual(ack,{status:"acknowledged",recoveryToken});
  assert.equal(Object.isFrozen(ack),true);
  assert.deepEqual(acknowledgmentResponse({
    status:"already_acknowledged",recoveryToken
  }),{status:"already_acknowledged",recoveryToken});
  for(const invalid of [
    {status:"seen",recoveryToken},
    {status:"acknowledged",recoveryToken:"too short"},
    {status:"acknowledged",recoveryToken,history:[live]},
    {status:"acknowledged",recoveryToken,ciphertext:"x"}
  ])assert.throws(()=>acknowledgmentResponse(invalid),unavailable);
  const rec=recoveryResponse({envelopeId:id.envelope,
    messageId:id.message,text:"Recovered once"});
  assert.deepEqual(rec,{envelopeId:id.envelope,messageId:id.message,
    text:"Recovered once"});
  assert.equal(Object.hasOwn(rec,"conversationId"),false);
  for(const invalid of [
    {envelopeId:id.envelope,messageId:id.message,text:"Hi",history:[live]},
    {envelopeId:id.envelope,messageId:id.message,text:""},
    {envelopeId:"foreign",messageId:id.message,text:"Hi"}
  ])assert.throws(()=>recoveryResponse(invalid),unavailable);
});
test("G03-21: write receipt and SSE hint have no body, key or capability",()=>{
  const receipt=acceptedWriteReceipt({
    id:id.message,sequenceNumber:4,duplicate:true
  });
  assert.deepEqual(receipt,{id:id.message,sequenceNumber:4,duplicate:true});
  const hint=notificationHint({conversationId:id.room,
    messageId:id.message,sequenceNumber:4});
  assert.deepEqual(hint,{conversationId:id.room,messageId:id.message,
    sequenceNumber:4});
  for(const key of ["text","body","ciphertext","recoveryToken","cursor","kekId"])
    assert.equal(Object.hasOwn(hint,key),false);
  for(const malformed of [
    {id:id.message,sequenceNumber:0,duplicate:false},
    {id:id.message,sequenceNumber:1,duplicate:1},
    {id:id.message,sequenceNumber:1,duplicate:false,body:"SECRET"}
  ])assert.throws(()=>acceptedWriteReceipt(malformed),unavailable);
  for(const bad of [
    {conversationId:id.room,messageId:id.message,sequenceNumber:1,body:"SECRET"},
    {conversationId:id.room,messageId:id.message,sequenceNumber:-1},
    {conversationId:"bad",messageId:id.message,sequenceNumber:1}
  ])assert.throws(()=>notificationHint(bad),unavailable);
});
test("G03-22: bootstrap cannot include previous room IDs, old chat snippet or history",()=>{
  const good={currentConversationId:id.room,
    mutualConnectionIds:[id.mutual],unreadCount:1};
  assert.deepEqual(bootstrapResponse(good),good);
  assert.deepEqual(bootstrapResponse({currentConversationId:null,
    mutualConnectionIds:[],unreadCount:0}),{
      currentConversationId:null,mutualConnectionIds:[],unreadCount:0
    });
  for(const bad of [
    {...good,previousConversationId:id.second},
    {...good,lastMessage:"old random content"},
    {...good,mutualConnectionIds:[id.mutual,id.mutual]},
    {...good,unreadCount:-1},
    {...good,mutualConnectionIds:Array(101).fill(id.mutual)}
  ])assert.throws(()=>bootstrapResponse(bad),unavailable);
});
test("G03-23: only future verified subject + DB actor *shape* may delegate",()=>{
  const stored={id:id.a,auth_subject:"qa:synthetic-a",status:"active",
    age_verified_at:new Date("2026-01-01T00:00:00.000Z"),safety_eligible:true};
  const context={verifiedSubject:"qa:synthetic-a",serverAccountId:id.a,
    storedAccount:stored};
  assert.equal(trustedActorShape(context),true);
  for(const invalid of [
    {...context,actorId:id.b},
    {...context,verifiedSubject:"qa:synthetic-b"},
    {...context,serverAccountId:id.b},
    {...context,storedAccount:{...stored,status:"restricted"}},
    {...context,storedAccount:{...stored,age_verified_at:null}},
    {...context,storedAccount:{...stored,safety_eligible:false}}
  ])assert.equal(trustedActorShape(invalid),false);
});
test("G03-24: no currently hosted server/SSE/outbox import of B3a pure contracts",async()=>{
  const sources=["http.mjs","postgres.mjs","start.mjs","live.mjs","outbox.mjs"];
  for(const p of sources){
    const body=await readFile(new URL("../../../src/"+p,import.meta.url),"utf8");
    assert.doesNotMatch(body,/v2\/response_contract|v2\/compatibility_contract/);
  }
  const self=await readFile(new URL(
    "../../../src/v2/response_contract.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(self,/BRIDGE_DATABASE_URL|SELECT\s|INSERT INTO|UPDATE\s|fetch\(/i);
});
