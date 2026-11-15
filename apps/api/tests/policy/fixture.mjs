import {OPERATIONS as O, POLICY_VERSION, RESOURCE_KINDS as K,
  SESSION_IDLE_MS} from "../../src/policy/operations.mjs";

export const NOW=Date.UTC(2026,10,15,12,0,0);
const principal=()=>({
  accountId:"a",authenticationValid:true,status:"active",role:"user",
  adultEligible:true,safetyEligible:true,policyAccepted:true,
  ownershipVerified:true
});
const peer=()=>({accountId:"b",status:"active",adultEligible:true,
  safetyEligible:true,policyAccepted:true});
const participants=()=>({memberLow:"a",memberHigh:"b",reciprocalBlock:false});
const relation=()=>({id:"rel-1",state:"active",memberLow:"a",memberHigh:"b"});
const consent=()=>["a","b"].map(accountId=>({
  accountId,connectionId:"rel-1",policyVersion:"consent-1",
  effectiveAt:NOW-SESSION_IDLE_MS,revokedAt:null
}));
const entitlement=()=>({
  accountId:"a",issuer:"server",environment:"qa",scope:"history",
  active:true,issuedAt:NOW-5000,expiresAt:NOW+5000,revokedAt:null
});
const common={
  [O.DISCOVERY_SEARCH]:()=>({kind:K.DISCOVERY,id:"discovery",ownerId:"a",
    hasModeratedLanguage:true,activeSlotFree:true}),
  [O.SEARCH_CANCEL]:()=>({kind:K.QUEUE,id:"queue-1",ownerId:"a",state:"waiting"}),
  [O.RANDOM_LIVE_READ]:()=>({kind:K.RANDOM,id:"random-1",state:"active",
    lastAcceptedAt:NOW-1000}),
  [O.RANDOM_LIVE_SEND]:()=>({kind:K.RANDOM,id:"random-1",state:"active",
    lastAcceptedAt:NOW-1000}),
  [O.RANDOM_KEEP]:()=>({kind:K.RANDOM,id:"random-1",state:"active",
    lastAcceptedAt:NOW-1000}),
  [O.RANDOM_END]:()=>({kind:K.RANDOM,id:"random-1",state:"active",
    lastAcceptedAt:NOW-1000}),
  [O.CONNECTION_LIST]:()=>({kind:K.CONNECTION_INDEX,id:"index-a",ownerId:"a"}),
  [O.DIRECT_CREATE]:()=>({kind:K.CONNECTION,id:"rel-1",hasActiveSegment:false}),
  [O.DIRECT_LIVE_READ]:()=>({kind:K.DIRECT,id:"direct-1",state:"active",
    connectionId:"rel-1",lastAcceptedAt:NOW-1000}),
  [O.DIRECT_LIVE_SEND]:()=>({kind:K.DIRECT,id:"direct-1",state:"active",
    connectionId:"rel-1",lastAcceptedAt:NOW-1000}),
  [O.UNREAD_DELIVER]:()=>({kind:K.UNREAD,id:"envelope-1",
    connectionId:"rel-1",recipientId:"a",state:"unread",
    acceptedAt:NOW-1000}),
  [O.UNREAD_RECOVER]:()=>({kind:K.UNREAD,id:"envelope-1",
    connectionId:"rel-1",recipientId:"a",state:"acknowledged",
    acceptedAt:NOW-4000,acknowledgedAt:NOW-1000,recoveryTokenVerified:true}),
  [O.HISTORY_READ]:()=>({kind:K.HISTORY,id:"history-1",connectionId:"rel-1",
    directMessage:true,prospectivelyRetained:true,
    acceptedAt:NOW-2000,retentionPolicyVersion:"consent-1"}),
  [O.HISTORY_CONSENT]:()=>({kind:K.CONNECTION,id:"rel-1",
    retentionPolicyVersion:"consent-1",policyDisclosureComplete:true,
    explicitAffirmative:true}),
  [O.HISTORY_CONSENT_WITHDRAW]:()=>({kind:K.CONNECTION,id:"rel-1"}),
  [O.REPORT_SUBMIT]:()=>({kind:K.REPORT,id:"new-report-1",
    reportedAccountId:"b",sessionId:"random-1",
    sessionState:"active",sessionExpiresAt:NOW+5000}),
  [O.EVIDENCE_READ]:()=>({kind:K.EVIDENCE,id:"case-1"}),
  [O.BLOCK]:()=>({kind:K.ACCOUNT,id:"account-b",accountId:"b"}),
  [O.UNBLOCK]:()=>({kind:K.ACCOUNT,id:"account-b",accountId:"b"}),
  [O.PRIVACY_ACCESS]:()=>({kind:K.PRIVACY,id:"request-a",ownerId:"a"}),
  [O.PRIVACY_DELETE]:()=>({kind:K.PRIVACY,id:"request-a",ownerId:"a"}),
  [O.TEST_GRANT_MANAGE]:()=>({kind:K.QA_GRANT,id:"qa-grant-1",
    accountId:"b",environment:"qa",auditContextValid:true})
};
export function fixture(operation) {
  const result={
    policyVersion:POLICY_VERSION,operation,
    validation:{origin:"trusted_server",sourcesVerified:true},
    serverClock:{timestamp:NOW},runtimeEnvironment:"qa",
    principal:principal(),peer:peer(),participants:participants(),
    relation:relation(),target:common[operation]?.(),
    consents:consent(),entitlement:entitlement(),
    reportToken:{tokenVerified:true,scope:"report",
      reporterId:"a",sessionId:"random-1",endedAt:NOW-1000},
    caseGrant:{reviewerId:"reviewer-1",caseId:"case-1",
      scope:"evidence_read",active:true,
      purposeApproved:true,expiresAt:NOW+5000}
  };
  if(operation===O.EVIDENCE_READ){
    result.principal={...result.principal,accountId:"reviewer-1",role:"case_reviewer"};
  }
  if(operation===O.TEST_GRANT_MANAGE){
    result.principal={...result.principal,accountId:"qa-admin",
      role:"qa_entitlement_admin"};
  }
  return result;
}
export function change(input,patch) {
  const clone=structuredClone(input);
  for(const [field,value] of Object.entries(patch))clone[field]=value;
  return clone;
}
