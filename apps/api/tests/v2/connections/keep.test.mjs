import test from "node:test";
import assert from "node:assert/strict";
import {KEEP_DECISIONS,twoCurrentVotes,keepOutcome}
  from "../../../src/connections/keep.mjs";
test("C05 pure: two distinct current votes, no unilateral/withdrawn grant",()=>{
  const p=["a","b"];
  assert.equal(twoCurrentVotes([{voter_id:"a",status:"accepted"}],p),false);
  assert.equal(twoCurrentVotes([
    {voter_id:"a",status:"accepted"},{voter_id:"b",status:"withdrawn"}],p),false);
  assert.equal(twoCurrentVotes([
    {voter_id:"a",status:"accepted"},{voter_id:"a",status:"accepted"}],p),false);
  assert.equal(twoCurrentVotes([
    {voter_id:"a",status:"accepted"},{voter_id:"b",status:"accepted"}],p),true);
  assert.equal(keepOutcome(KEEP_DECISIONS.WITHDRAW,[],p),"withdrawn");
  assert.equal(keepOutcome(KEEP_DECISIONS.ACCEPT,[],p),"pending");
  assert.equal(keepOutcome("ignore",[],p),null);
});
