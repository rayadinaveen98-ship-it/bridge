import test from "node:test";
import assert from "node:assert/strict";
import {authorize} from "../../src/policy/authorize.mjs";
import {createPolicyContext} from "../../src/policy/context.mjs";
import {CODES,OPERATIONS as O,OPERATION_NAMES,POLICY_VERSION} from "../../src/policy/operations.mjs";
import {fixture,NOW} from "./fixture.mjs";

const opList=Object.values(O);
const expectAllow=ctx=>assert.deepEqual(authorize(ctx),{
  allow:true,code:CODES.ALLOW,policyVersion:POLICY_VERSION
});
const expectDeny=(ctx,code)=> {
  const d=authorize(ctx);
  assert.equal(d.allow,false);
  assert.equal(d.policyVersion,POLICY_VERSION);
  if(code)assert.equal(d.code,code);
  assert.equal(Object.isFrozen(d),true);
};

// Every declared operation has a positive and a negative test against the
// ACTUAL source policy module, not the V2-01 mock/reference oracle.
test("operation catalog is closed, distinct and includes no wildcard privileges",()=>{
  assert.equal(opList.length,22);
  assert.equal(new Set(opList).size,opList.length);
  assert.deepEqual(OPERATION_NAMES,opList);
  for(const forbidden of ["ADMIN","ALL_MESSAGES","ANY","WILDCARD","SUPERUSER"]){
    assert.equal(opList.includes(forbidden),false);
  }
});
for (const operation of opList){
  test("allow expected trusted positive operation: "+operation,()=>{
    expectAllow(fixture(operation));
  });
  test("deny malformed/wrong resource for operation: "+operation,()=>{
    const ctx=fixture(operation);
    ctx.target={...ctx.target,kind:"unrelated_resource"};
    expectDeny(ctx);
  });
}

test("explicitly scoped owner, consent, role and audience facts cannot be guessed",()=>{
  let x=fixture(O.DISCOVERY_SEARCH);
  x.target.ownerId="b"; expectDeny(x);
  x=fixture(O.SEARCH_CANCEL);x.target.ownerId="b";expectDeny(x);
  x=fixture(O.CONNECTION_LIST);x.target.ownerId="b";expectDeny(x);
  x=fixture(O.PRIVACY_DELETE);x.target.ownerId="b";expectDeny(x);
  x=fixture(O.BLOCK);x.target.accountId="a";expectDeny(x);
  x=fixture(O.UNBLOCK);x.target.accountId="a";expectDeny(x);
  x=fixture(O.HISTORY_CONSENT);x.target.explicitAffirmative=false;expectDeny(x);
  x=fixture(O.HISTORY_CONSENT);x.target.policyDisclosureComplete=false;expectDeny(x);
  x=fixture(O.HISTORY_CONSENT_WITHDRAW);x.relation.id="different";expectDeny(x);
  x=fixture(O.TEST_GRANT_MANAGE);x.runtimeEnvironment="production";expectDeny(x);
});

test("policy context is normalized to immutable allowlisted facts, not raw secrets",()=>{
  const original=fixture(O.HISTORY_READ);
  const sensitive={
    body:"never log a private text",
    rawJwt:"secret-token",
    password:"secret-password",
    isPremium:true
  };
  Object.assign(original,sensitive);
  original.principal.clientSetPremium=true;
  original.target.body="private conversation content";
  original.entitlement.paymentToken="pay-secret";
  const ctx=createPolicyContext(original);
  assert.ok(ctx);
  assert.equal(Object.isFrozen(ctx),true);
  assert.equal(Object.isFrozen(ctx.principal),true);
  assert.equal(Object.isFrozen(ctx.target),true);
  assert.equal(Object.isFrozen(ctx.consents),true);
  assert.equal(Object.isFrozen(ctx.consents[0]),true);
  const serialized=JSON.stringify(ctx);
  for(const v of Object.values(sensitive))assert.equal(serialized.includes(String(v)),false);
  assert.equal(serialized.includes("private conversation content"),false);
  assert.equal(serialized.includes("pay-secret"),false);
  expectAllow(original);
  original.principal.status="suspended";
  assert.equal(ctx.principal.status,"active","old normalized context is detached");
  assert.equal(authorize(original).allow,false);
});

test("sensitive decision object has only three safe fixed keys",()=>{
  const d=authorize(fixture(O.HISTORY_READ));
  assert.deepEqual(Object.keys(d),["allow","code","policyVersion"]);
  assert.ok(Object.isFrozen(d));
  assert.equal("message" in d,false);
  assert.equal("accountId" in d,false);
});

test("pure evaluator reads only injected clock and has no global timing dependence",()=>{
  const p=fixture(O.RANDOM_LIVE_READ);
  const old={...p.serverClock};
  expectAllow(p);
  p.serverClock={timestamp:NOW+30*60_000};
  expectDeny(p);
  assert.equal(old.timestamp,NOW);
});
