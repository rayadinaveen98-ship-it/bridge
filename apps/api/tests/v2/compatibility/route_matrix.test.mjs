import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  V1_SCOPE,classifyStoredConversation,classifyContractRoute,
  trustedSubjectMatches,decideLegacyCompatibility,
  projectLegacyConversationIds,classifyProposedV2Access
} from "../../../src/v2/compatibility_contract.mjs";

const ids={
  a:"11111111-1111-4111-8111-111111111111",
  b:"22222222-2222-4222-8222-222222222222",
  room:"33333333-3333-4333-8333-333333333333",
  match:"44444444-4444-4444-8444-444444444444",
  conn:"55555555-5555-4555-8555-555555555555"
};
const legacy={id:ids.room,kind:"random",policy_version:null,
  v2_session_role:null,connection_id:null,match_session_id:ids.match,legacy_qa:true};
const random={...legacy,policy_version:"bridge-v2",v2_session_role:"random",legacy_qa:false};
const direct={...legacy,kind:"connection",policy_version:"bridge-v2",
  v2_session_role:"direct",legacy_qa:false,match_session_id:null,connection_id:ids.conn};
const auth={verifiedSubject:"bridge-cloud-qa:synthetic-a",
  serverAccount:{id:ids.a,auth_subject:"bridge-cloud-qa:synthetic-a",status:"active"}};
const route=(suffix)=>"/v1/conversations/"+ids.room+"/"+suffix;
const decide=(method,pathname,storedConversation=legacy,extra={})=>
  decideLegacyCompatibility({method,pathname,storedConversation,...auth,...extra});

test("G03-01..04: V1 GET+POST messages and SSE/Keep deny V2-marked rooms",()=>{
  const matrix=[
    ["GET","messages","legacy_conversation_read"],
    ["POST","messages","legacy_conversation_write"],
    ["GET","events","legacy_conversation_stream"],
    ["PUT","connection-vote","legacy_conversation_mutate"],
    ["POST","close","legacy_conversation_mutate"],
    ["GET","peer","legacy_conversation_read"]
  ];
  for(const [method,path,kind] of matrix){
    assert.equal(classifyContractRoute({method,pathname:route(path)}).kind,kind);
    for(const stored of [random,direct]){
      const result=decide(method,route(path),stored);
      assert.deepEqual(result,{decision:"deny",kind,reason:"resource_unavailable"},
        method+" "+path+" "+stored.kind);
    }
    assert.equal(decide(method,route(path),legacy).decision,"delegate",
      "Legacy-only path is deferred to existing server policy, never automatically granted");
  }
});
test("G03-05: legacy QA marked explicitly; no blanket V1 denial before G1",()=>{
  assert.equal(classifyStoredConversation(legacy),V1_SCOPE.LEGACY);
  assert.equal(classifyStoredConversation({...legacy,kind:"connection"}),V1_SCOPE.LEGACY);
  assert.equal(decide("GET",route("messages")).reason,"legacy_qa_policy_required");
  assert.equal(decide("POST",route("messages")).decision,"delegate");
});
test("G03-06: NULL/ambiguous/mixed room markers always fail closed",()=>{
  const variants=[
    null,undefined,{},[],{...legacy,legacy_qa:null},
    {...legacy,legacy_qa:false},{...legacy,policy_version:"bridge-v2"},
    {...legacy,v2_session_role:"random"},
    {...legacy,legacy_qa:true,connection_id:ids.conn},
    {...random,legacy_qa:true},{...random,match_session_id:null},
    {...random,connection_id:ids.conn},{...direct,match_session_id:ids.match},
    {...direct,connection_id:null},{...direct,kind:"random"},
    {...direct,policy_version:"bridge-v99"},
    {...legacy,legacy_qa:"true"}
  ];
  for(const value of variants){
    assert.equal(classifyStoredConversation(value),V1_SCOPE.UNKNOWN);
    assert.equal(decide("GET",route("messages"),value??null).decision,"deny");
    assert.equal(decide("POST",route("messages"),value??null).decision,"deny");
  }
});
test("G03-07: classification comes from stored metadata, not client version/UA/actor",()=>{
  const spoof=[{userAgent:"Bridge/2"},{clientVersion:2},{legacy_qa:true},
    {actorId:ids.a},{policy_version:null},{premium:true}];
  for(const injected of spoof){
    assert.equal(decideLegacyCompatibility({
      method:"GET",pathname:route("messages"),storedConversation:random,
      ...auth,...injected
    }).decision,"deny");
  }
  assert.equal(classifyStoredConversation(random),V1_SCOPE.RANDOM);
  assert.equal(classifyStoredConversation(direct),V1_SCOPE.DIRECT);
});
test("G03-08: room ID guessed/wrong verb, encoded or query-tainted URLs deny",()=>{
  const attempts=[
    ["GET","/v1/conversations/not-uuid/messages"],
    ["DELETE",route("messages")],
    ["GET",route("messages")+"?afterSequence=0"],
    ["GET","/v1/conversations/%33"+ids.room.slice(1)+"/messages"],
    ["GET","/v1//conversations/"+ids.room+"/messages"],
    ["POST",route("events")]
  ];
  for(const [method,pathname] of attempts){
    assert.equal(classifyContractRoute({method,pathname}).kind,"unknown");
    assert.equal(decide(method,pathname).decision,"deny");
  }
});
test("G03-09: only matching verified subject + DB account is a valid pure shape",()=>{
  assert.equal(trustedSubjectMatches({verifiedSubject:auth.verifiedSubject,
    account:auth.serverAccount}),true);
  for(const args of [
    {verifiedSubject:auth.verifiedSubject,account:{...auth.serverAccount,status:"blocked"}},
    {verifiedSubject:"another:sub",account:auth.serverAccount},
    {verifiedSubject:ids.a,account:auth.serverAccount},
    {verifiedSubject:auth.verifiedSubject,account:{...auth.serverAccount,id:"fake"}},
    {verifiedSubject:auth.verifiedSubject,account:null},
    {verifiedSubject:auth.verifiedSubject,account:{...auth.serverAccount,auth_subject:ids.b}}
  ])assert.equal(trustedSubjectMatches(args),false);
  assert.equal(decide("GET",route("messages"),legacy,
    {verifiedSubject:"spoofed"}).decision,"deny");
});
test("G03-10: stale/absent actor denied before delegated legacy read",()=>{
  assert.equal(decideLegacyCompatibility({
    method:"POST",pathname:route("messages"),storedConversation:legacy,
    verifiedSubject:null,serverAccount:auth.serverAccount
  }).decision,"deny");
  assert.equal(decideLegacyCompatibility({
    method:"GET",pathname:route("messages"),storedConversation:legacy,
    verifiedSubject:auth.verifiedSubject,serverAccount:null
  }).decision,"deny");
});
test("G03-11: safety Block and report still delegated after auth, never grant content",()=>{
  for(const [method,pathname] of [
    ["PUT","/v1/blocks/"+ids.b],["DELETE","/v1/blocks/"+ids.b],
    ["POST","/v1/reports"]
  ]){
    const d=decide(method,pathname,random);
    assert.deepEqual(d,{decision:"delegate",kind:"safety_delegated",
      reason:"authenticated_safety_only"});
    assert.equal(decide(method,pathname,random,{verifiedSubject:"not-owner"}).decision,"deny");
  }
});
test("G03-12: v1 bootstrap/connections/matches must use filtered server discovery",()=>{
  for(const [method,path] of [
    ["GET","/v1/bootstrap"],["GET","/v1/connections"],
    ["POST","/v1/matches/search"],
    ["GET","/v1/matches/search/"+ids.match],
    ["DELETE","/v1/matches/search/"+ids.match]
  ]){
    assert.equal(decide(method,path).reason,
      path.includes("search")?"server_scope_filter_required":"server_scope_filter_required");
    assert.equal(decide(method,path,legacy,{verifiedSubject:"bad"}).decision,"deny");
  }
  assert.deepEqual(projectLegacyConversationIds([
    legacy,random,direct,{...legacy,id:ids.b},
    {...legacy,id:ids.a,legacy_qa:null},legacy
  ]),[ids.room,ids.b]);
});
test("G03-13: no V2 ID disclosure in pure legacy projection",()=>{
  assert.deepEqual(projectLegacyConversationIds([random,direct,{},null]),[]);
  assert.deepEqual(projectLegacyConversationIds("not-a-row-array"),[]);
  assert.deepEqual(projectLegacyConversationIds(Array(1001).fill(legacy)),[]);
  const output=projectLegacyConversationIds([{...legacy,body:"SECRET",
    recoveryToken:"SECRET",ownerId:ids.a}]);
  assert.deepEqual(output,[ids.room]);
  assert.equal(JSON.stringify(output).includes("SECRET"),false);
  assert.equal(Object.isFrozen(output),true);
});
test("G03-14: proposed V2 route only delegates to future trusted actor path",()=>{
  const v2="/v2/conversations/"+ids.room;
  for(const stored of [random,direct]){
    assert.equal(classifyProposedV2Access({method:"GET",pathname:v2+"/messages",
      storedConversation:stored}).decision,"delegate");
    assert.equal(classifyProposedV2Access({method:"POST",pathname:v2+"/messages",
      storedConversation:stored}).reason,"v2_session_auth_required");
    assert.equal(classifyProposedV2Access({method:"GET",pathname:v2+"/events",
      storedConversation:stored}).decision,"delegate");
  }
  for(const stored of [legacy,{},null]){
    assert.equal(classifyProposedV2Access({method:"GET",pathname:v2+"/messages",
      storedConversation:stored}).decision,"deny");
  }
});
test("G03-15: proposed unread routes are NOT public authorization",()=>{
  for(const [method,pathname] of [
    ["GET","/v2/unread"],["POST","/v2/unread/"+ids.conn+"/ack"],
    ["POST","/v2/unread/"+ids.conn+"/recover"],["GET","/v2/bootstrap"]
  ]){
    assert.equal(classifyProposedV2Access({method,pathname}).decision,"delegate");
    assert.equal(classifyProposedV2Access({method,pathname}).reason,
      "trusted_actor_and_scope_required");
  }
  assert.equal(classifyProposedV2Access({method:"GET",
    pathname:"/v2/conversations/"+ids.room+"/history"}).decision,"deny");
});
test("G03-16: route recognition consistent and no new HTTP/PG implementation imports",async()=>{
  for(const path of ["http.mjs","postgres.mjs","start.mjs","live.mjs","outbox.mjs"]){
    const f=await readFile(new URL("../../../src/"+path,import.meta.url),"utf8");
    assert.doesNotMatch(f,/v2\/compatibility_contract|v2\/response_contract|classifyProposedV2Access/);
  }
  const file=await readFile(new URL(
    "../../../src/v2/compatibility_contract.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(file,/BRIDGE_DATABASE_URL|SELECT\s|UPDATE\s|INSERT\s|DELETE FROM|fetch\(/i);
  assert.equal(classifyContractRoute({method:"GET",pathname:"/healthz"}).kind,
    "public_health");
  assert.equal(decide("GET","/healthz").decision,"allow");
  assert.equal(decide("POST","/internal/lab/login").decision,"delegate");
  assert.equal(decide("GET","/unlisted/route").decision,"deny");
});
