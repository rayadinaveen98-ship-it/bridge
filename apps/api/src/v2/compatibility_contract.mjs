/**
 * Bridge B3a: PURE / DISCONNECTED proposed compatibility firewall contract.
 * This module is NOT imported into http.mjs, postgres.mjs, start.mjs, SSE,
 * Flutter or any hosted route. A PASS here DOES NOT enforce V1 denial on air.
 * Arguments labelled "stored" must come from authoritative DB reads when a
 * separately approved future facade wires this policy. Never accept markers
 * from headers, request bodies, User-Agent, URL query or local client state.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const METHODS=new Set(["GET","POST","PUT","DELETE"]);
const CONV_TAIL={
  peer:new Map([["GET","legacy_conversation_read"]]),
  events:new Map([["GET","legacy_conversation_stream"]]),
  messages:new Map([["GET","legacy_conversation_read"],["POST","legacy_conversation_write"]]),
  close:new Map([["POST","legacy_conversation_mutate"]]),
  "connection-vote":new Map([["PUT","legacy_conversation_mutate"]])
};
export const V1_SCOPE=Object.freeze({
  LEGACY:"legacy_qa",RANDOM:"v2_random",DIRECT:"v2_direct",UNKNOWN:"unknown"
});
const outcome=(decision,kind,reason)=>Object.freeze({decision,kind,reason});
const refuse=(kind="unknown",reason="resource_unavailable")=>outcome("deny",kind,reason);
const allow=(kind,reason)=>outcome("allow",kind,reason);
const isId=x=>typeof x==="string"&&UUID.test(x);
const cleanPath=path=>typeof path==="string"&&path.length<512&&
  path.startsWith("/")&&!path.includes("?")&&!path.includes("#")&&
  !path.includes("%")&&!path.includes("//")&&
  !path.includes("\0");
function matchRoute(method,pathname) {
  if(!METHODS.has(method)||!cleanPath(pathname))return null;
  if(pathname==="/healthz"&&method==="GET")return {kind:"public_health",conversationId:null};
  if(pathname==="/internal/lab/login"&&method==="POST")
    return {kind:"lab_only_login",conversationId:null};
  if(pathname==="/v1/bootstrap"&&method==="GET")
    return {kind:"legacy_discovery",conversationId:null};
  if(pathname==="/v1/connections"&&method==="GET")
    return {kind:"legacy_discovery",conversationId:null};
  if(pathname==="/v1/me/preferences"&&method==="PUT")
    return {kind:"legacy_account_mutation",conversationId:null};
  if(pathname==="/v1/matches/search"&&method==="POST")
    return {kind:"legacy_matchmaking",conversationId:null};
  if(/^\/v1\/matches\/search\/[^/]+$/.test(pathname)&&
     (method==="GET"||method==="DELETE"))
    return {kind:"legacy_matchmaking",conversationId:null};
  if(/^\/v1\/blocks\/[^/]+$/.test(pathname)&&
     (method==="PUT"||method==="DELETE"))
    return {kind:"safety_delegated",conversationId:null};
  if(pathname==="/v1/reports"&&method==="POST")
    return {kind:"safety_delegated",conversationId:null};
  const m=/^\/v1\/conversations\/([^/]+)\/([^/]+)$/.exec(pathname);
  if(m&&isId(m[1])) {
    const kind=CONV_TAIL[m[2]]?.get(method);
    if(kind)return {kind,conversationId:m[1]};
  }
  // These are proposed V2 contract paths, NOT actual HTTP routes.
  if(pathname==="/v2/bootstrap"&&method==="GET")
    return {kind:"proposed_v2_discovery",conversationId:null};
  if(pathname==="/v2/unread"&&method==="GET")
    return {kind:"proposed_v2_unread",conversationId:null};
  const unread=/^\/v2\/unread\/([^/]+)\/(ack|recover)$/.exec(pathname);
  if(unread&&isId(unread[1])&&method==="POST")
    return {kind:"proposed_v2_unread",conversationId:null};
  const v2=/^\/v2\/conversations\/([^/]+)\/(messages|events|end)$/.exec(pathname);
  if(v2&&isId(v2[1])&&(
    (v2[2]==="messages"&&(method==="GET"||method==="POST"))||
    (v2[2]==="events"&&method==="GET")||
    (v2[2]==="end"&&method==="POST")
  ))return {kind:"proposed_v2_conversation",conversationId:v2[1]};
  return null;
}
/** Shape classification ONLY. No claim that a client supplied "room" is trusted. */
export function classifyStoredConversation(stored){
  if(!stored||typeof stored!=="object"||Array.isArray(stored))return V1_SCOPE.UNKNOWN;
  const p=stored.policy_version??null;
  const role=stored.v2_session_role??null;
  const legacy=stored.legacy_qa;
  if(legacy===true&&p===null&&role===null&&
     (stored.kind==="random"||stored.kind==="connection")&&
     (stored.connection_id??null)===null)
    return V1_SCOPE.LEGACY;
  if(legacy!==false||p!=="bridge-v2")return V1_SCOPE.UNKNOWN;
  if(stored.kind==="random"&&role==="random"&&
     (stored.connection_id??null)===null&&
     isId(stored.match_session_id))
    return V1_SCOPE.RANDOM;
  if(stored.kind==="connection"&&role==="direct"&&
     (stored.match_session_id??null)===null&&
     isId(stored.connection_id))
    return V1_SCOPE.DIRECT;
  return V1_SCOPE.UNKNOWN;
}
/** Versioned routes are classified by literal path/method, not headers. */
export function classifyContractRoute({method,pathname}={}){
  const matched=matchRoute(method,pathname);
  return matched?Object.freeze({...matched}):Object.freeze({
    kind:"unknown",conversationId:null
  });
}
/** Only *verified* bearer subject and database-owned auth_subject MAY match.
 * This is a shape/consistency contract, NOT signature verification or DB auth.
 */
export function trustedSubjectMatches({verifiedSubject,account}={}){
  return typeof verifiedSubject==="string"&&verifiedSubject.length>0&&
    verifiedSubject.length<=256&&
    account&&typeof account==="object"&&!Array.isArray(account)&&
    isId(account.id)&&account.auth_subject===verifiedSubject&&
    account.status==="active";
}
/**
 * Proposed V1 route firewall. Does not perform side effects or SQL.
 * "delegate_*" is NEVER a grant: the future HTTP adapter must still run
 * authenticated, eligible DB policy, no V2 ID leak and scoped safety actions.
 */
export function decideLegacyCompatibility({
  method,pathname,storedConversation=null,verifiedSubject=null,
  serverAccount=null
}={}){
  const route=classifyContractRoute({method,pathname});
  if(route.kind==="public_health")return allow(route.kind,"health_only");
  if(route.kind==="lab_only_login")return outcome("delegate",route.kind,"lab_qa_only");
  if(!trustedSubjectMatches({verifiedSubject,account:serverAccount}))
    return refuse(route.kind);
  if(route.kind==="safety_delegated")
    return outcome("delegate",route.kind,"authenticated_safety_only");
  if(route.kind==="legacy_account_mutation")
    return outcome("delegate",route.kind,"account_policy_required");
  if(route.kind==="legacy_discovery"||route.kind==="legacy_matchmaking")
    return outcome("delegate",route.kind,"server_scope_filter_required");
  if(route.kind.startsWith("legacy_conversation_")){
    if(classifyStoredConversation(storedConversation)!==V1_SCOPE.LEGACY)
      return refuse(route.kind);
    return outcome("delegate",route.kind,"legacy_qa_policy_required");
  }
  return refuse(route.kind);
}
/** NO generic V1 disclosure of current V2 relationship/session identifiers.
 * This strips all row metadata and returns only explicitly legacy QA IDs.
 * A future integration must still restrict these to the authenticated actor.
 */
export function projectLegacyConversationIds(rows){
  if(!Array.isArray(rows)||rows.length>1000)return Object.freeze([]);
  const ids=new Set();
  for(const row of rows){
    if(isId(row?.id)&&classifyStoredConversation(row)===V1_SCOPE.LEGACY)
      ids.add(row.id);
  }
  return Object.freeze([...ids]);
}
/** Cross-version recommendation only: NEVER trust User-Agent/flags. */
export function classifyProposedV2Access({method,pathname,storedConversation}={}){
  const route=classifyContractRoute({method,pathname});
  if(route.kind==="proposed_v2_discovery"||route.kind==="proposed_v2_unread")
    return outcome("delegate",route.kind,"trusted_actor_and_scope_required");
  if(route.kind!=="proposed_v2_conversation")return refuse(route.kind);
  const scope=classifyStoredConversation(storedConversation);
  if(scope!==V1_SCOPE.RANDOM&&scope!==V1_SCOPE.DIRECT)
    return refuse(route.kind);
  return outcome("delegate",route.kind,"v2_session_auth_required");
}
